// Factory that returns the appropriate marketplace service
// Uses mock by default, switches to real service if credentials are configured
import { MarketplaceService } from './marketplace.js';
import { MockMarketplaceService } from './mock-marketplace.js';

// Singleton instances
const services: Record<string, MarketplaceService> = {};

function hasCreds(marketplace: 'etsy' | 'ebay'): boolean {
  if (marketplace === 'etsy') {
    return !!(process.env.ETSY_CLIENT_ID && process.env.ETSY_CLIENT_SECRET);
  }
  return !!(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID);
}

export function getMarketplaceService(marketplace: 'etsy' | 'ebay'): MarketplaceService {
  const key = marketplace;

  if (!services[key]) {
    if (hasCreds(marketplace)) {
      console.log(`[MarketplaceFactory] Real ${marketplace} service (lazy init — using mock until async load)`);
      // Start with mock, schedule async upgrade
      services[key] = new MockMarketplaceService(marketplace);
      upgradeToReal(marketplace);
    } else {
      console.log(`[MarketplaceFactory] Using mock ${marketplace} service (no credentials)`);
      services[key] = new MockMarketplaceService(marketplace);
    }
  }

  return services[key];
}

async function upgradeToReal(marketplace: 'etsy' | 'ebay'): Promise<void> {
  try {
    if (marketplace === 'etsy') {
      const { EtsyService } = await import('./etsy.js');
      services['etsy'] = new EtsyService();
      console.log('[MarketplaceFactory] Upgraded to real Etsy service');
    } else {
      const { EbayService } = await import('./ebay.js');
      services['ebay'] = new EbayService();
      console.log('[MarketplaceFactory] Upgraded to real eBay service');
    }
  } catch (err) {
    console.error(`[MarketplaceFactory] Failed to upgrade to real ${marketplace} service:`, err);
    // Keep using mock
  }
}
