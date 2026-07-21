// Account-isolated marketplace simulator used by the working prototype.
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
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

function randomPick<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function generateJewelryTitle(): string {
  return `${randomPick(jewelryAdjectives)} ${randomPick(materials)} ${randomPick(gemstones)} ${randomPick(jewelryTypes)}`;
}

function generateJewelryDescription(): string {
  const era = randomPick(['1920s', '1930s', '1940s', '1950s', '1960s', '1970s', 'Edwardian', 'Victorian']);
  return `Beautiful ${era} era piece crafted in ${randomPick(materials)} featuring a ${randomPick(gemstones)}.`;
}

interface MockStore {
  storeId: string;
  storeName: string;
  listings: Map<string, MarketplaceListingData>;
  orders: OrderData[];
}

class MockMarketplaceService implements MarketplaceService {
  private marketplace: 'etsy' | 'ebay';
  private stores = new Map<string, MockStore>();

  constructor(marketplace: 'etsy' | 'ebay') {
    this.marketplace = marketplace;
  }

  private marketplaceName(): 'Etsy' | 'Ebay' {
    return this.marketplace === 'etsy' ? 'Etsy' : 'Ebay';
  }

  private getStoreName(): string {
    return this.marketplace === 'etsy' ? 'Prototype Etsy Shop' : 'Prototype eBay Store';
  }

  private async getStoreByAccountId(accountId: string): Promise<MockStore> {
    const account = await prisma.marketplaceAccount.findUnique({ where: { id: accountId } });
    if (!account || account.marketplace !== this.marketplaceName()) {
      throw new Error('Prototype marketplace account was not found in this storefront');
    }

    const storeId = account.storeId || account.id;
    const existing = this.stores.get(storeId);
    if (existing) return existing;

    // Rehydrate active prototype listings after a server restart so reconciliation does not
    // incorrectly mark every listing ended simply because the in-memory simulator restarted.
    const databaseListings = await prisma.marketplaceListing.findMany({
      where: {
        marketplaceAccountId: account.id,
        marketplaceListingId: { not: null },
        status: { in: ['Active', 'Sold'] },
      },
    });

    const store: MockStore = {
      storeId,
      storeName: account.storeName || account.accountName,
      listings: new Map(
        databaseListings
          .filter((listing) => listing.marketplaceListingId)
          .map((listing) => [
            listing.marketplaceListingId!,
            {
              listingId: listing.marketplaceListingId!,
              title: listing.title,
              description: listing.description || '',
              price: listing.price,
              quantity: listing.quantity,
              status: listing.status.toLowerCase(),
              url: listing.marketplaceListingUrl || `https://prototype.invalid/${this.marketplace}/${listing.marketplaceListingId}`,
              category: listing.marketplaceCategory || undefined,
              createdAt: listing.createdAt,
              updatedAt: listing.updatedAt,
            },
          ])
      ),
      orders: [],
    };
    this.stores.set(storeId, store);
    return store;
  }

  async connect(_organizationId: string): Promise<{ url: string; state: string }> {
    const state = uuidv4();
    return { url: `/api/integrations/${this.marketplace}/mock-callback?state=${state}`, state };
  }

  async handleCallback(_code: string, _state: string, _organizationId: string): Promise<{
    accessToken: string;
    refreshToken: string;
    storeId: string;
    storeName: string;
    expiresIn?: number;
  }> {
    const storeId = `mock-${this.marketplace}-${uuidv4()}`;
    const storeName = this.getStoreName();
    const store: MockStore = { storeId, storeName, listings: new Map(), orders: [] };

    // Seed a few marketplace-only listings so import/reconciliation can be demonstrated.
    for (let index = 0; index < 3; index++) {
      const listingId = `mock-listing-${this.marketplace}-${uuidv4()}`;
      store.listings.set(listingId, {
        listingId,
        title: generateJewelryTitle(),
        description: generateJewelryDescription(),
        price: Math.round((Math.random() * 2000 + 50) * 100) / 100,
        quantity: 1,
        status: 'active',
        url: `https://prototype.invalid/${this.marketplace}/${listingId}`,
        category: randomPick(jewelryTypes),
        tags: ['vintage', 'jewelry'],
        photos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    this.stores.set(storeId, store);
    return {
      accessToken: `mock-access-${this.marketplace}-${uuidv4()}`,
      refreshToken: `mock-refresh-${this.marketplace}-${uuidv4()}`,
      storeId,
      storeName,
      expiresIn: 3600,
    };
  }

  async refreshToken(_accountId: string): Promise<void> {
    return;
  }

  async getListings(accountId: string): Promise<MarketplaceListingData[]> {
    const store = await this.getStoreByAccountId(accountId);
    return [...store.listings.values()].filter((listing) => listing.status === 'active');
  }

  async createListing(accountId: string, data: CreateListingData): Promise<{ listingId: string; url: string }> {
    const store = await this.getStoreByAccountId(accountId);
    const listingId = `mock-listing-${this.marketplace}-${uuidv4()}`;
    const url = `https://prototype.invalid/${this.marketplace}/${listingId}`;
    store.listings.set(listingId, {
      listingId,
      title: data.title,
      description: data.description,
      price: data.price,
      quantity: data.quantity || 1,
      status: 'active',
      url,
      category: data.category,
      tags: data.tags,
      photos: data.photoUrls,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { listingId, url };
  }

  async updateListing(accountId: string, listingId: string, data: UpdateListingData): Promise<void> {
    const store = await this.getStoreByAccountId(accountId);
    const listing = store.listings.get(listingId);
    if (!listing) throw new Error('Prototype listing was not found');
    store.listings.set(listingId, {
      ...listing,
      ...data,
      status: data.status || listing.status,
      updatedAt: new Date(),
    });
  }

  async endListing(accountId: string, listingId: string): Promise<void> {
    const store = await this.getStoreByAccountId(accountId);
    const listing = store.listings.get(listingId);
    if (!listing) throw new Error('Prototype listing was not found');
    store.listings.set(listingId, { ...listing, status: 'ended', quantity: 0, updatedAt: new Date() });
  }

  async getOrders(accountId: string, since?: Date): Promise<OrderData[]> {
    const store = await this.getStoreByAccountId(accountId);
    return store.orders.filter((order) => !since || order.saleDate >= since);
  }

  async simulateSale(accountId: string, listingId: string): Promise<OrderData> {
    const store = await this.getStoreByAccountId(accountId);
    const listing = store.listings.get(listingId);
    if (!listing || listing.status !== 'active') {
      throw new Error('Only an active prototype listing can be sold');
    }

    store.listings.set(listingId, { ...listing, status: 'sold', quantity: 0, updatedAt: new Date() });
    const order: OrderData = {
      orderId: `mock-order-${uuidv4()}`,
      orderNumber: `PROTOTYPE-${Date.now()}`,
      buyerName: 'Prototype Buyer',
      buyerUsername: 'prototype-buyer',
      buyerEmail: 'buyer@example.invalid',
      saleDate: new Date(),
      paymentStatus: 'Paid',
      fulfillmentStatus: 'AwaitingShipment',
      shippingDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      shippingCost: 5.99,
      insuranceCost: 0,
      salesTaxCollected: 0,
      items: [{ listingId, salePrice: listing.price, quantity: 1 }],
    };
    store.orders.push(order);
    return order;
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
