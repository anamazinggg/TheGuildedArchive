// Integration routes — Etsy/eBay OAuth connection management
import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getMarketplaceService } from '../services/marketplace-factory.js';
import { runSync } from '../services/sync-engine.js';

const router = Router();
router.use(authMiddleware);

// Simple token encryption helpers (in production, use a proper encryption library)
function encryptToken(token: string): string {
  // Base64 is NOT real encryption — in production, use AES-256-GCM with a key from env
  return Buffer.from(token).toString('base64');
}

function decryptToken(encrypted: string): string {
  return Buffer.from(encrypted, 'base64').toString('utf-8');
}

// GET /api/integrations — List all connected marketplace accounts
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.marketplaceAccount.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        marketplace: a.marketplace,
        accountName: a.accountName,
        isConnected: a.isConnected,
        storeName: a.storeName,
        storeId: a.storeId,
        lastSyncAt: a.lastSyncAt,
        syncStatus: a.syncStatus,
        syncErrorMessage: a.syncErrorMessage,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    });
  } catch (error) {
    console.error('List integrations error:', error);
    res.status(500).json({ error: 'Failed to list marketplace accounts' });
  }
});

// ---- Etsy Routes ----

// POST /api/integrations/etsy/connect
router.post('/etsy/connect', async (_req: AuthRequest, res: Response) => {
  try {
    const service = getMarketplaceService('etsy');
    const { url, state } = await service.connect();

    res.json({ url, state });
  } catch (error) {
    console.error('Etsy connect error:', error);
    res.status(500).json({ error: 'Failed to generate Etsy connect URL' });
  }
});

// POST /api/integrations/etsy/callback
router.post('/etsy/callback', async (req: AuthRequest, res: Response) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const service = getMarketplaceService('etsy');
    const result = await service.handleCallback(code, state || '');

    // Check if account already exists
    let account = await prisma.marketplaceAccount.findFirst({
      where: { marketplace: 'Etsy', storeId: result.storeId },
    });

    if (account) {
      // Update existing account
      account = await prisma.marketplaceAccount.update({
        where: { id: account.id },
        data: {
          isConnected: true,
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: encryptToken(result.refreshToken),
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          storeName: result.storeName,
          syncStatus: 'Idle',
          syncErrorMessage: null,
        },
      });
    } else {
      // Create new account
      account = await prisma.marketplaceAccount.create({
        data: {
          marketplace: 'Etsy',
          accountName: result.storeName,
          isConnected: true,
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: encryptToken(result.refreshToken),
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          storeName: result.storeName,
          storeId: result.storeId,
          syncStatus: 'Idle',
        },
      });
    }

    res.json({
      connected: true,
      account: {
        id: account.id,
        marketplace: account.marketplace,
        accountName: account.accountName,
        isConnected: account.isConnected,
        storeName: account.storeName,
        storeId: account.storeId,
      },
    });
  } catch (error) {
    console.error('Etsy callback error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to complete Etsy connection: ${msg}` });
  }
});

// POST /api/integrations/etsy/disconnect
router.post('/etsy/disconnect', async (_req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.marketplaceAccount.findFirst({
      where: { marketplace: 'Etsy', isConnected: true },
    });

    if (!account) {
      res.status(404).json({ error: 'No connected Etsy account found' });
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

    // End all active Etsy listings locally
    await prisma.marketplaceListing.updateMany({
      where: { marketplace: 'Etsy', status: 'Active' },
      data: { status: 'Ended', syncMessage: 'Account disconnected' },
    });

    res.json({ message: 'Etsy disconnected' });
  } catch (error) {
    console.error('Etsy disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Etsy' });
  }
});

// ---- eBay Routes ----

// POST /api/integrations/ebay/connect
router.post('/ebay/connect', async (_req: AuthRequest, res: Response) => {
  try {
    const service = getMarketplaceService('ebay');
    const { url, state } = await service.connect();

    res.json({ url, state });
  } catch (error) {
    console.error('eBay connect error:', error);
    res.status(500).json({ error: 'Failed to generate eBay connect URL' });
  }
});

// POST /api/integrations/ebay/callback
router.post('/ebay/callback', async (req: AuthRequest, res: Response) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const service = getMarketplaceService('ebay');
    const result = await service.handleCallback(code, state || '');

    let account = await prisma.marketplaceAccount.findFirst({
      where: { marketplace: 'Ebay', storeId: result.storeId },
    });

    if (account) {
      account = await prisma.marketplaceAccount.update({
        where: { id: account.id },
        data: {
          isConnected: true,
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: encryptToken(result.refreshToken),
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          storeName: result.storeName,
          syncStatus: 'Idle',
          syncErrorMessage: null,
        },
      });
    } else {
      account = await prisma.marketplaceAccount.create({
        data: {
          marketplace: 'Ebay',
          accountName: result.storeName,
          isConnected: true,
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: encryptToken(result.refreshToken),
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          storeName: result.storeName,
          storeId: result.storeId,
          syncStatus: 'Idle',
        },
      });
    }

    res.json({
      connected: true,
      account: {
        id: account.id,
        marketplace: account.marketplace,
        accountName: account.accountName,
        isConnected: account.isConnected,
        storeName: account.storeName,
        storeId: account.storeId,
      },
    });
  } catch (error) {
    console.error('eBay callback error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to complete eBay connection: ${msg}` });
  }
});

// POST /api/integrations/ebay/disconnect
router.post('/ebay/disconnect', async (_req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.marketplaceAccount.findFirst({
      where: { marketplace: 'Ebay', isConnected: true },
    });

    if (!account) {
      res.status(404).json({ error: 'No connected eBay account found' });
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
      where: { marketplace: 'Ebay', status: 'Active' },
      data: { status: 'Ended', syncMessage: 'Account disconnected' },
    });

    res.json({ message: 'eBay disconnected' });
  } catch (error) {
    console.error('eBay disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect eBay' });
  }
});

// ---- Mock OAuth Callback (for testing without real credentials) ----

// GET /api/integrations/etsy/mock-callback
router.get('/etsy/mock-callback', async (req: AuthRequest, res: Response) => {
  try {
    const state = (req.query.state as string) || 'mock-state';

    const service = getMarketplaceService('etsy');
    const result = await service.handleCallback('mock-code', state);

    let account = await prisma.marketplaceAccount.findFirst({
      where: { marketplace: 'Etsy', storeId: result.storeId },
    });

    if (account) {
      account = await prisma.marketplaceAccount.update({
        where: { id: account.id },
        data: {
          isConnected: true,
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: encryptToken(result.refreshToken),
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          storeName: result.storeName,
          syncStatus: 'Idle',
          syncErrorMessage: null,
        },
      });
    } else {
      account = await prisma.marketplaceAccount.create({
        data: {
          marketplace: 'Etsy',
          accountName: result.storeName,
          isConnected: true,
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: encryptToken(result.refreshToken),
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          storeName: result.storeName,
          storeId: result.storeId,
          syncStatus: 'Idle',
        },
      });
    }

    // Redirect to frontend integrations page
    const frontendUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173';
    res.redirect(`${frontendUrl}/integrations?connected=etsy`);
  } catch (error) {
    console.error('Mock Etsy callback error:', error);
    res.status(500).json({ error: 'Mock callback failed' });
  }
});

// GET /api/integrations/ebay/mock-callback
router.get('/ebay/mock-callback', async (req: AuthRequest, res: Response) => {
  try {
    const state = (req.query.state as string) || 'mock-state';

    const service = getMarketplaceService('ebay');
    const result = await service.handleCallback('mock-code', state);

    let account = await prisma.marketplaceAccount.findFirst({
      where: { marketplace: 'Ebay', storeId: result.storeId },
    });

    if (account) {
      account = await prisma.marketplaceAccount.update({
        where: { id: account.id },
        data: {
          isConnected: true,
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: encryptToken(result.refreshToken),
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          storeName: result.storeName,
          syncStatus: 'Idle',
          syncErrorMessage: null,
        },
      });
    } else {
      account = await prisma.marketplaceAccount.create({
        data: {
          marketplace: 'Ebay',
          accountName: result.storeName,
          isConnected: true,
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: encryptToken(result.refreshToken),
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          storeName: result.storeName,
          storeId: result.storeId,
          syncStatus: 'Idle',
        },
      });
    }

    const frontendUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173';
    res.redirect(`${frontendUrl}/integrations?connected=ebay`);
  } catch (error) {
    console.error('Mock eBay callback error:', error);
    res.status(500).json({ error: 'Mock callback failed' });
  }
});

// ---- Sync & Status ----

// POST /api/integrations/:marketplace/sync — Trigger manual sync
router.post('/:marketplace/sync', async (req: AuthRequest, res: Response) => {
  try {
    const { marketplace } = req.params;
    const validMarketplaces = ['etsy', 'ebay'];

    if (!validMarketplaces.includes(marketplace)) {
      res.status(400).json({ error: 'Invalid marketplace. Must be "etsy" or "ebay"' });
      return;
    }

    const account = await prisma.marketplaceAccount.findFirst({
      where: {
        marketplace: marketplace === 'etsy' ? 'Etsy' : 'Ebay',
        isConnected: true,
      },
    });

    if (!account) {
      res.status(404).json({ error: `No connected ${marketplace} account found` });
      return;
    }

    // Run sync asynchronously — respond immediately
    res.json({
      message: 'Sync started',
      marketplace,
      accountId: account.id,
    });

    // Fire and forget
    runSync(account.marketplace, account.id).then((result) => {
      console.log(`[Sync] ${marketplace} sync complete:`, {
        created: result.listingsCreated,
        updated: result.listingsUpdated,
        ended: result.listingsEnded,
        sales: result.salesDetected,
        errors: result.errors.length,
      });
    }).catch((err) => {
      console.error(`[Sync] ${marketplace} sync failed:`, err);
    });
  } catch (error) {
    console.error('Trigger sync error:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// GET /api/integrations/:marketplace/status — Get sync status
router.get('/:marketplace/status', async (req: AuthRequest, res: Response) => {
  try {
    const { marketplace } = req.params;
    const validMarketplaces = ['etsy', 'ebay'];

    if (!validMarketplaces.includes(marketplace)) {
      res.status(400).json({ error: 'Invalid marketplace. Must be "etsy" or "ebay"' });
      return;
    }

    const account = await prisma.marketplaceAccount.findFirst({
      where: {
        marketplace: marketplace === 'etsy' ? 'Etsy' : 'Ebay',
      },
    });

    if (!account) {
      res.json({
        connected: false,
        syncStatus: null,
        lastSyncAt: null,
        syncEvents: [],
        activeListings: 0,
      });
      return;
    }

    const recentEvents = await prisma.syncEvent.findMany({
      where: { marketplace: account.marketplace },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const activeListings = await prisma.marketplaceListing.count({
      where: { marketplace: account.marketplace, status: 'Active' },
    });

    res.json({
      connected: account.isConnected,
      syncStatus: account.syncStatus,
      syncErrorMessage: account.syncErrorMessage,
      lastSyncAt: account.lastSyncAt,
      storeName: account.storeName,
      storeId: account.storeId,
      syncEvents: recentEvents,
      activeListings,
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

export default router;
