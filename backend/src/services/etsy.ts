// Etsy marketplace service — OAuth 2.0 with PKCE
// Falls back to mock mode when ETSY_CLIENT_ID is not configured
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import {
  MarketplaceService,
  MarketplaceListingData,
  CreateListingData,
  UpdateListingData,
  OrderData,
  AnalyticsData,
} from './marketplace.js';

interface EtsyTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface EtsyShop {
  shop_id: number;
  shop_name: string;
}

interface EtsyListing {
  listing_id: number;
  title: string;
  description: string;
  price: { amount: number; currency_code: string };
  quantity: number;
  state: string;
  url: string;
  taxonomy_path?: string[];
  tags?: string[];
  images?: { url_fullxfull: string }[];
  creation_timestamp: number;
  last_modified_timestamp: number;
}

interface EtsyReceipt {
  receipt_id: number;
  receipt_type: number;
  order_id: number;
  buyer_user_id: number;
  buyer_email: string;
  name: string;
  first_line: string;
  second_line?: string;
  city: string;
  state: string;
  zip: string;
  country_iso: string;
  created_timestamp: number;
  total_price: { amount: number; currency_code: string };
  total_shipping_cost: { amount: number; currency_code: string };
  total_tax_cost: { amount: number; currency_code: string };
  listings: {
    listing_id: number;
    transaction_id: number;
    price: { amount: number; currency_code: string };
    quantity: number;
  }[];
  is_shipped: boolean;
  was_paid: boolean;
  was_shipped: boolean;
  shipping_carrier?: string;
  shipping_tracking_code?: string;
}

class EtsyService implements MarketplaceService {
  private clientId: string | null;
  private clientSecret: string | null;
  private redirectUri: string | null;
  private baseUrl = 'https://openapi.etsy.com/v3';
  private isMock: boolean;
  private mockService: MarketplaceService | null = null;


  constructor() {
    this.clientId = process.env.ETSY_CLIENT_ID || null;
    this.clientSecret = process.env.ETSY_CLIENT_SECRET || null;
    this.redirectUri = process.env.ETSY_REDIRECT_URI || null;
    this.isMock = !this.clientId || !this.clientSecret;
  }

  private async getMockService(): Promise<MarketplaceService> {
    if (!this.mockService) {
      const { MockMarketplaceService } = await import('./mock-marketplace.js');
      this.mockService = new MockMarketplaceService('etsy');
    }
    return this.mockService!;
  }

  private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = hash.toString('base64url');
    return { codeVerifier, codeChallenge };
  }

  // ---- Public Interface ----

  async connect(organizationId: string): Promise<{ url: string; state: string }> {
    if (this.isMock) {
      console.log('[Etsy] No credentials configured, using mock mode');
      return (await this.getMockService()).connect(organizationId);
    }

    const state = uuidv4();
    const { codeVerifier, codeChallenge } = this.generatePKCE();
    const redirectUri = this.redirectUri || 'http://localhost:3000/api/integrations/etsy/callback';

    await prisma.marketplaceAuthorization.create({
      data: {
        organizationId,
        marketplace: 'Etsy',
        state,
        codeVerifier,
        redirectUri,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId!,
      redirect_uri: redirectUri,
      scope: 'listings_r listings_w shops_r transactions_r',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const url = `https://www.etsy.com/oauth/connect?${params.toString()}`;
    console.log('[Etsy] Generated OAuth URL');
    return { url, state };
  }

  async handleCallback(code: string, state: string, organizationId: string): Promise<{
    accessToken: string;
    refreshToken: string;
    storeId: string;
    storeName: string;
    expiresIn?: number;
  }> {
    if (this.isMock) {
      return (await this.getMockService()).handleCallback(code, state, organizationId);
    }

    const pkceData = await prisma.marketplaceAuthorization.findFirst({
      where: {
        state,
        marketplace: 'Etsy',
        organizationId,
        expiresAt: { gt: new Date() },
      },
    });
    if (!pkceData?.codeVerifier) {
      throw new Error('Invalid or expired OAuth state');
    }
    await prisma.marketplaceAuthorization.delete({ where: { id: pkceData.id } });

    // Exchange code for token
    const tokenResponse = await fetch(`${this.baseUrl}/public/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uri: pkceData.redirectUri,
        code,
        code_verifier: pkceData.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      throw new Error(`Etsy token exchange failed: ${err}`);
    }

    const tokenData: EtsyTokenResponse = await tokenResponse.json();

    // Get shop info
    const shopResponse = await fetch(
      `${this.baseUrl}/application/shops?shop_name=me`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'x-api-key': this.clientId!,
        },
      }
    );

    if (!shopResponse.ok) {
      throw new Error(`Failed to fetch Etsy shop info`);
    }

    const shopData = await shopResponse.json();
    const shop: EtsyShop = shopData.results?.[0];

    if (!shop) {
      throw new Error('No Etsy shop found for this account');
    }

    console.log(`[Etsy] Connected to shop: ${shop.shop_name} (${shop.shop_id})`);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      storeId: shop.shop_id.toString(),
      storeName: shop.shop_name,
      expiresIn: tokenData.expires_in,
    };
  }

  async refreshToken(_accountId: string): Promise<void> {
    if (this.isMock) {
      return (await this.getMockService()).refreshToken(_accountId);
    }
    // Real refresh would decrypt stored tokens and call /public/oauth/token
    console.log('[Etsy] Token refresh not yet implemented with real credentials');
  }

  async getListings(_accountId: string): Promise<MarketplaceListingData[]> {
    if (this.isMock) {
      return (await this.getMockService()).getListings(_accountId);
    }
    // Real implementation would call Etsy API
    console.log('[Etsy] getListings not yet implemented with real credentials');
    return [];
  }

  async createListing(_accountId: string, data: CreateListingData): Promise<{ listingId: string; url: string }> {
    if (this.isMock) {
      return (await this.getMockService()).createListing(_accountId, data);
    }
    console.log('[Etsy] createListing not yet implemented with real credentials');
    return { listingId: '', url: '' };
  }

  async updateListing(_accountId: string, listingId: string, data: UpdateListingData): Promise<void> {
    if (this.isMock) {
      return (await this.getMockService()).updateListing(_accountId, listingId, data);
    }
    console.log('[Etsy] updateListing not yet implemented with real credentials');
  }

  async endListing(_accountId: string, listingId: string): Promise<void> {
    if (this.isMock) {
      return (await this.getMockService()).endListing(_accountId, listingId);
    }
    console.log('[Etsy] endListing not yet implemented with real credentials');
  }

  async getOrders(_accountId: string, since?: Date): Promise<OrderData[]> {
    if (this.isMock) {
      return (await this.getMockService()).getOrders(_accountId, since);
    }
    console.log('[Etsy] getOrders not yet implemented with real credentials');
    return [];
  }

  async getListingAnalytics(_accountId: string, listingId: string): Promise<AnalyticsData> {
    if (this.isMock) {
      return (await this.getMockService()).getListingAnalytics(_accountId, listingId);
    }
    console.log('[Etsy] getListingAnalytics not yet implemented with real credentials');
    return { views: 0, favorites: 0, watchers: 0, clicks: 0, conversions: 0 };
  }
}

export { EtsyService };
export default EtsyService;
