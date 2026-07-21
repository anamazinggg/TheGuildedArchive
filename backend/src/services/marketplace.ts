// Abstract marketplace service interface and shared types

export interface MarketplaceListingData {
  listingId: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  status: string;
  url: string;
  category?: string;
  tags?: string[];
  photos?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingData {
  title: string;
  description: string;
  price: number;
  quantity?: number;
  category?: string;
  tags?: string[];
  photoUrls?: string[];
  shippingProfile?: string;
  returnPolicy?: string;
  etsySpecificFields?: Record<string, unknown>;
  ebaySpecificFields?: Record<string, unknown>;
}

export interface UpdateListingData {
  title?: string;
  description?: string;
  price?: number;
  quantity?: number;
  status?: string;
  category?: string;
  tags?: string[];
  shippingProfile?: string;
  returnPolicy?: string;
}

export interface OrderData {
  orderId: string;
  orderNumber: string;
  buyerName?: string;
  buyerUsername?: string;
  buyerEmail?: string;
  saleDate: Date;
  paymentStatus: string;
  fulfillmentStatus: string;
  shippingDeadline?: Date;
  shippingCarrier?: string;
  trackingNumber?: string;
  shippingCost: number;
  insuranceCost: number;
  salesTaxCollected: number;
  items: OrderItemData[];
  notes?: string;
}

export interface OrderItemData {
  listingId: string;
  salePrice: number;
  quantity: number;
}

export interface AnalyticsData {
  views: number;
  favorites: number;
  watchers: number;
  clicks: number;
  conversions: number;
  score?: number;
}

export interface SyncResult {
  marketplace: string;
  accountId: string;
  listingsProcessed: number;
  listingsCreated: number;
  listingsUpdated: number;
  listingsEnded: number;
  salesDetected: number;
  crossMarketplaceActions: number;
  errors: string[];
  startedAt: Date;
  completedAt: Date;
}

export interface SaleResult {
  listingId: string;
  orderId: string;
  orderNumber: string;
  salePrice: number;
  saleDate: Date;
  marketplace: string;
}

export interface MarketplaceService {
  connect(): Promise<{ url: string; state: string }>;
  handleCallback(code: string, state: string): Promise<{
    accessToken: string;
    refreshToken: string;
    storeId: string;
    storeName: string;
    expiresIn?: number;
  }>;
  refreshToken(accountId: string): Promise<void>;
  getListings(accountId: string): Promise<MarketplaceListingData[]>;
  createListing(accountId: string, data: CreateListingData): Promise<{ listingId: string; url: string }>;
  updateListing(accountId: string, listingId: string, data: UpdateListingData): Promise<void>;
  endListing(accountId: string, listingId: string): Promise<void>;
  getOrders(accountId: string, since?: Date): Promise<OrderData[]>;
  getListingAnalytics(accountId: string, listingId: string): Promise<AnalyticsData>;
}
