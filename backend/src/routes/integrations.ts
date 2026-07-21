import { Router, Response, Request } from 'express';
import prisma, { systemPrisma } from '../lib/prisma.js';
import { requireTenantContext, runWithTenant } from '../lib/tenant-context.js';
import { encryptSecret } from '../lib/encryption.js';
import { authMiddleware, requireWriteForRole, AuthRequest } from '../middleware/auth.js';
import { getMarketplaceService } from '../services/marketplace-factory.js';
import { runSync } from '../services/sync-engine.js';

const router = Router();
type MarketplaceName = 'Etsy' | 'Ebay';

type ConnectionResult = {
  accessToken: string;
  refreshToken: string;
  storeId: string;
  storeName: string;
  expiresIn?: number;
};

function normalizedMarketplace(value: string): MarketplaceName | null {
  const lower = value.toLowerCase();
  if (lower === 'etsy') return 'Etsy';
  if (lower === 'ebay') return 'Ebay';
  return null;
}

async function saveMarketplaceAccount(marketplace: MarketplaceName, result: ConnectionResult) {
  const existing = await prisma.marketplaceAccount.findFirst({
    where: { marketplace, storeId: result.storeId },
  });

  const data = {
    organizationId: requireTenantContext().organizationId,
    marketplace,
    accountName: result.storeName,
    isConnected: true,
    encryptedAccessToken: encryptSecret(result.accessToken),
    encryptedRefreshToken: encryptSecret(result.refreshToken),
    tokenExpiresAt: result.expiresIn ? new Date(Date.now() + result.expiresIn * 1000) : null,
    storeName: result.storeName,
    storeId: result.storeId,
    syncStatus: 'Idle',
    syncErrorMessage: null,
  };

  return existing
    ? prisma.marketplaceAccount.update({ where: { id: existing.id }, data })
    : prisma.marketplaceAccount.create({ data });
}

// Marketplace providers redirect here. The random, single-use OAuth state identifies the tenant;
// no browser Authorization header is required on this callback.
router.get('/:marketplace/callback', async (req: Request, res: Response) => {
  const marketplace = normalizedMarketplace(String(req.params.marketplace));
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');

  if (!marketplace || !code || !state) {
    res.redirect(`${frontendUrl}/integrations?error=invalid_callback`);
    return;
  }

  try {
    const authorization = await systemPrisma.marketplaceAuthorization.findUnique({ where: { state } });
    if (!authorization || authorization.marketplace !== marketplace || authorization.expiresAt <= new Date()) {
      res.redirect(`${frontendUrl}/integrations?error=expired_oauth_state`);
      return;
    }

    await runWithTenant(
      {
        organizationId: authorization.organizationId,
        membershipId: 'oauth-callback',
        userId: 'oauth-callback',
        role: 'Owner',
      },
      async () => {
        const service = getMarketplaceService(marketplace.toLowerCase() as 'etsy' | 'ebay');
        const result = await service.handleCallback(code, state, authorization.organizationId);
        await saveMarketplaceAccount(marketplace, result);
      }
    );

    res.redirect(`${frontendUrl}/integrations?connected=${marketplace.toLowerCase()}`);
  } catch (error) {
    console.error(`${marketplace} OAuth callback error:`, error);
    res.redirect(`${frontendUrl}/integrations?error=connection_failed`);
  }
});

router.use(authMiddleware);
router.use(requireWriteForRole('Manager'));

// GET /api/integrations — List accounts belonging to the active storefront
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.marketplaceAccount.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({
      accounts: accounts.map((account) => ({
        id: account.id,
        marketplace: account.marketplace,
        accountName: account.accountName,
        isConnected: account.isConnected,
        storeName: account.storeName,
        storeId: account.storeId,
        lastSyncAt: account.lastSyncAt,
        syncStatus: account.syncStatus,
        syncErrorMessage: account.syncErrorMessage,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
    });
  } catch (error) {
    console.error('List integrations error:', error);
    res.status(500).json({ error: 'Failed to list marketplace accounts' });
  }
});

router.post('/:marketplace/connect', async (req: AuthRequest, res: Response) => {
  const marketplace = normalizedMarketplace(String(req.params.marketplace));
  if (!marketplace) {
    res.status(400).json({ error: 'Unsupported marketplace' });
    return;
  }

  try {
    const service = getMarketplaceService(marketplace.toLowerCase() as 'etsy' | 'ebay');
    const result = await service.connect(req.user!.organizationId);
    res.json(result);
  } catch (error) {
    console.error(`${marketplace} connect error:`, error);
    res.status(500).json({ error: `Failed to generate ${marketplace} connection URL` });
  }
});

// Authenticated callback alternative used by native clients or tests.
router.post('/:marketplace/callback', async (req: AuthRequest, res: Response) => {
  const marketplace = normalizedMarketplace(String(req.params.marketplace));
  const { code, state } = req.body;
  if (!marketplace || !code || !state) {
    res.status(400).json({ error: 'Marketplace, authorization code, and state are required' });
    return;
  }

  try {
    const service = getMarketplaceService(marketplace.toLowerCase() as 'etsy' | 'ebay');
    const result = await service.handleCallback(code, state, req.user!.organizationId);
    const account = await saveMarketplaceAccount(marketplace, result);
    res.json({ connected: true, account });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to complete ${marketplace} connection: ${message}` });
  }
});

router.post('/:marketplace/disconnect', async (req: AuthRequest, res: Response) => {
  const marketplace = normalizedMarketplace(String(req.params.marketplace));
  if (!marketplace) {
    res.status(400).json({ error: 'Unsupported marketplace' });
    return;
  }

  try {
    const account = req.body.accountId
      ? await prisma.marketplaceAccount.findUnique({ where: { id: req.body.accountId } })
      : await prisma.marketplaceAccount.findFirst({
          where: { marketplace, isConnected: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!account || account.marketplace !== marketplace) {
      res.status(404).json({ error: `No connected ${marketplace} account found` });
      return;
    }

    await prisma.marketplaceAccount.update({
      where: { id: account.id },
      data: {
        isConnected: false,
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        syncStatus: 'Idle',
        syncErrorMessage: null,
      },
    });

    await prisma.marketplaceListing.updateMany({
      where: { marketplaceAccountId: account.id, status: 'Active' },
      data: { status: 'Ended', syncStatus: 'NeedsConnection', syncMessage: 'Marketplace account disconnected' },
    });

    res.json({ message: `${marketplace} disconnected` });
  } catch (error) {
    console.error(`${marketplace} disconnect error:`, error);
    res.status(500).json({ error: `Failed to disconnect ${marketplace}` });
  }
});

// Development connection flow when real marketplace credentials are absent.
router.get('/:marketplace/mock-callback', async (req: AuthRequest, res: Response) => {
  const marketplace = normalizedMarketplace(String(req.params.marketplace));
  if (!marketplace) {
    res.status(400).json({ error: 'Unsupported marketplace' });
    return;
  }

  try {
    const service = getMarketplaceService(marketplace.toLowerCase() as 'etsy' | 'ebay');
    const result = await service.handleCallback('mock-code', 'mock-state', req.user!.organizationId);
    const account = await saveMarketplaceAccount(marketplace, result);
    res.json({ connected: true, account, mock: true });
  } catch (error) {
    console.error(`Mock ${marketplace} callback error:`, error);
    res.status(500).json({ error: 'Mock callback failed' });
  }
});

router.post('/:marketplace/sync', async (req: AuthRequest, res: Response) => {
  const marketplace = normalizedMarketplace(String(req.params.marketplace));
  if (!marketplace) {
    res.status(400).json({ error: 'Unsupported marketplace' });
    return;
  }

  try {
    const account = req.body.accountId
      ? await prisma.marketplaceAccount.findUnique({ where: { id: req.body.accountId } })
      : await prisma.marketplaceAccount.findFirst({
          where: { marketplace, isConnected: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!account || account.marketplace !== marketplace) {
      res.status(404).json({ error: `No connected ${marketplace} account found` });
      return;
    }

    const result = await runSync(marketplace, account.id);
    res.json({ result });
  } catch (error) {
    console.error(`${marketplace} sync error:`, error);
    res.status(500).json({ error: `Failed to sync ${marketplace}` });
  }
});

router.get('/:marketplace/status', async (req: AuthRequest, res: Response) => {
  const marketplace = normalizedMarketplace(String(req.params.marketplace));
  if (!marketplace) {
    res.status(400).json({ error: 'Unsupported marketplace' });
    return;
  }

  try {
    const account = await prisma.marketplaceAccount.findFirst({
      where: { marketplace },
      orderBy: { createdAt: 'asc' },
    });
    const syncEvents = await prisma.syncEvent.findMany({
      where: { marketplace },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const activeListings = await prisma.marketplaceListing.count({
      where: { marketplace, status: 'Active' },
    });

    res.json({
      connected: !!account?.isConnected,
      syncStatus: account?.syncStatus || null,
      syncErrorMessage: account?.syncErrorMessage || null,
      lastSyncAt: account?.lastSyncAt || null,
      storeName: account?.storeName || null,
      storeId: account?.storeId || null,
      syncEvents,
      activeListings,
    });
  } catch (error) {
    console.error(`${marketplace} status error:`, error);
    res.status(500).json({ error: `Failed to get ${marketplace} status` });
  }
});

export default router;
