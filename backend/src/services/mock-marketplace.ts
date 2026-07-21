// Mock marketplace service — simulates Etsy and eBay APIs for testing
import { v4 as uuidv4 } from 'uuid';
import {
  MarketplaceService,
  MarketplaceListingData,
  CreateListingData,
  UpdateListingData,
  OrderData,
  AnalyticsData,
} from './marketplace.js';

const jewelryAdjectives = ['Vintage', 'Antique', 'Art Deco', 'Edwardian', 'Victorian', 'Retro', 'Estate', 'Mid-Century'];
const jewelryTypes = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Brooch', 'Pendant', 'Bangle', 'Cuff'];
const materials = ['Sterling Silver', '14K Gold', '18K Gold', 'Platinum', 'Rose Gold', 'White Gold', '10K Gold'];
const gemstones = ['Diamond', 'Sapphire', 'Ruby', 'Emerald', 'Opal', 'Pearl', 'Amethyst', 'Turquoise', 'Garnet', 'Topaz'];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateJewelryTitle(): string {
  const adj = randomPick(jewelryAdjectives);
  const mat = randomPick(materials);
  const gem = randomPick(gemstones);
  const type = randomPick(jewelryTypes);
  return `${adj} ${mat} ${gem} ${type}`;
}

function generateJewelryDescription(): string {
  const era = randomPick(['1920s', '1930s', '1940s', '1950s', '1960s', '1970s', 'Edwardian', 'Victorian']);
  const mat = randomPick(materials);
  const gem = randomPick(gemstones);
  return `Beautiful ${era} era piece crafted in ${mat} featuring a stunning ${gem}. This item has been professionally cleaned and is in excellent vintage condition.`;
}

// In-memory store for mock data
interface MockStore {
  accessToken: string;
  refreshToken: string;
  storeId: string;
  storeName: string;
  listings: Map<string, MarketplaceListingData>;
  orders: OrderData[];
}

class MockMarketplaceService implements MarketplaceService {
  private marketplace: 'etsy' | 'ebay';
  private stores: Map<string, MockStore> = new Map();

  constructor(marketplace: 'etsy' | 'ebay') {
    this.marketplace = marketplace;
  }

  private getStoreName(): string {
    return this.marketplace === 'etsy' ? 'MockEtsyShop' : 'MockEbayStore';
  }

  private getStoreId(): string {
    return this.marketplace === 'etsy' ? `mock-etsy-${Date.now()}` : `mock-ebay-${Date.now()}`;
  }

  async connect(): Promise<{ url: string; state: string }> {
    const state = uuidv4();
    const url = `/api/integrations/${this.marketplace}/mock-callback?state=${state}`;
    console.log(`[Mock ${this.marketplace.toUpperCase()}] Generated connect URL: ${url}`);
    return { url, state };
  }

  async handleCallback(_code: string, _state: string): Promise<{
    accessToken: string;
    refreshToken: string;
    storeId: string;
    storeName: string;
    expiresIn?: number;
  }> {
    const storeId = this.getStoreId();
    const storeName = this.getStoreName();
    const accessToken = `mock-access-${this.marketplace}-${uuidv4()}`;
    const refreshToken = `mock-refresh-${this.marketplace}-${uuidv4()}`;

    // Initialize mock store with some fake listings
    const store: MockStore = {
      accessToken,
      refreshToken,
      storeId,
      storeName,
      listings: new Map(),
      orders: [],
    };

    // Create 5 fake active listings
    for (let i = 0; i < 5; i++) {
      const listingId = `mock-listing-${this.marketplace}-${i}-${Date.now()}`;
      const title = generateJewelryTitle();
      store.listings.set(listingId, {
        listingId,
        title,
        description: generateJewelryDescription(),
        price: Math.round((Math.random() * 2000 + 50) * 100) / 100,
        quantity: 1,
        status: 'active',
        url: `https://www.${this.marketplace}.com/listing/${listingId}`,
        category: randomPick(jewelryTypes),
        tags: ['vintage', 'jewelry', randomPick(materials).toLowerCase()],
        photos: ['https://via.placeholder.com/500'],
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      });
    }

    this.stores.set(storeId, store);

    console.log(`[Mock ${this.marketplace.toUpperCase()}] Callback handled. Store: ${storeName} (${storeId}), 5 mock listings created`);
    return { accessToken, refreshToken, storeId, storeName, expiresIn: 3600 };
  }

  async refreshToken(_accountId: string): Promise<void> {
    console.log(`[Mock ${this.marketplace.toUpperCase()}] Token refreshed`);
  }

  private getStoreByAccountId(_accountId: string): MockStore | undefined {
    // In mock mode, return the first available store (or any store)
    // The accountId from DB won't match our internal storeId, so just use the first store
    for (const [, store] of this.stores) {
      return store;
    }
    return undefined;
  }

  async getListings(accountId: string): Promise<MarketplaceListingData[]> {
    // In mock mode, return listings from the first connected store
    // If no store found (first call, no accounts), generate mock listings on the fly
    const store = this.getStoreByAccountId(accountId);
    if (!store) {
      // No store connected yet — return mock listings directly
      console.log(`[Mock ${this.marketplace.toUpperCase()}] No store found, generating mock listings on the fly`);
      const listings: MarketplaceListingData[] = [];
      for (let i = 0; i < 5; i++) {
        listings.push({
          listingId: `mock-listing-${this.marketplace}-${i}-${Date.now()}`,
          title: generateJewelryTitle(),
          description: generateJewelryDescription(),
          price: Math.round((Math.random() * 2000 + 50) * 100) / 100,
          quantity: 1,
          status: 'active',
          url: `https://www.${this.marketplace}.com/listing/mock-${i}`,
          category: randomPick(jewelryTypes),
          tags: ['vintage', 'jewelry', randomPick(materials).toLowerCase()],
          photos: ['https://via.placeholder.com/500'],
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        });
      }
      return listings;
    }
    return Array.from(store.listings.values());
  }

  async createListing(_accountId: string, data: CreateListingData): Promise<{ listingId: string; url: string }> {
    const listingId = `mock-listing-${this.marketplace}-${uuidv4()}`;
    const url = `https://www.${this.marketplace}.com/listing/${listingId}`;
    console.log(`[Mock ${this.marketplace.toUpperCase()}] Created listing: ${data.title} → ${listingId}`);
    return { listingId, url };
  }

  async updateListing(_accountId: string, listingId: string, data: UpdateListingData): Promise<void> {
    console.log(`[Mock ${this.marketplace.toUpperCase()}] Updated listing ${listingId}:`, data);
  }

  async endListing(_accountId: string, listingId: string): Promise<void> {
    console.log(`[Mock ${this.marketplace.toUpperCase()}] Ended listing ${listingId}`);
  }

  async getOrders(_accountId: string, since?: Date): Promise<OrderData[]> {
    // Simulate occasional sales
    const hasSold = Math.random() > 0.5;
    if (!hasSold) return [];

    const orders: OrderData[] = [];
    const numOrders = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < numOrders; i++) {
      orders.push({
        orderId: `mock-order-${uuidv4()}`,
        orderNumber: `MOCK-${Date.now()}-${i}`,
        buyerName: `Buyer ${i + 1}`,
        buyerUsername: `buyer${i + 1}`,
        buyerEmail: `buyer${i + 1}@example.com`,
        saleDate: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        paymentStatus: 'Paid',
        fulfillmentStatus: 'AwaitingShipment',
        shippingDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        shippingCost: 5.99,
        insuranceCost: 0,
        salesTaxCollected: Math.round(Math.random() * 50 * 100) / 100,
        items: [
          {
            listingId: `mock-listing-${this.marketplace}-${Math.floor(Math.random() * 5)}`,
            salePrice: Math.round((Math.random() * 1500 + 50) * 100) / 100,
            quantity: 1,
          },
        ],
      });
    }

    console.log(`[Mock ${this.marketplace.toUpperCase()}] Generated ${orders.length} mock orders`);
    return orders;
  }

  async getListingAnalytics(_accountId: string, _listingId: string): Promise<AnalyticsData> {
    return {
      views: Math.floor(Math.random() * 500),
      favorites: Math.floor(Math.random() * 50),
      watchers: Math.floor(Math.random() * 20),
      clicks: Math.floor(Math.random() * 100),
      conversions: Math.floor(Math.random() * 5),
      score: Math.random() * 10,
    };
  }
}

export { MockMarketplaceService };
export default MockMarketplaceService;
