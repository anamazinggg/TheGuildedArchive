// eBay marketplace service — OAuth 2.0 Authorization Code Grant
// Falls back to mock mode when EBAY_APP_ID is not configured
import { v4 as uuidv4 } from 'uuid';
import {
  MarketplaceService,
  MarketplaceListingData,
  CreateListingData,
  UpdateListingData,
  OrderData,
  AnalyticsData,
} from './marketplace.js';

interface EBayTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

class EbayService implements MarketplaceService {
  private appId: string | null;
  private certId: string | null;
  private ruName: string | null;
  private redirectUri: string | null;
  private isMock: boolean;
  private mockService: MarketplaceService | null = null;

  // In-memory state storage
  private oauthStates: Map<string, string> = new Map();

  constructor() {
    this.appId = process.env.EBAY_APP_ID || null;
    this.certId = process.env.EBAY_CERT_ID || null;
    this.ruName = process.env.EBAY_RUNAME || null;
    this.redirectUri = process.env.EBAY_REDIRECT_URI || null;
    this.isMock = !this.appId || !this.certId;
  }

  private async getMockService(): Promise<MarketplaceService> {
    if (!this.mockService) {
      const { MockMarketplaceService } = await import('./mock-marketplace.js');
      this.mockService = new MockMarketplaceService('ebay');
    }
    return this.mockService!;
  }

  private getBaseUrl(): string {
    return process.env.NODE_ENV === 'production'
      ? 'https://api.ebay.com'
      : 'https://api.sandbox.ebay.com';
  }

  // ---- Public Interface ----

  async connect(): Promise<{ url: string; state: string }> {
    if (this.isMock) {
      console.log('[eBay] No credentials configured, using mock mode');
      return (await this.getMockService()).connect();
    }

    const state = uuidv4();
    const redirectUri = this.redirectUri || 'http://localhost:3000/api/integrations/ebay/callback';

    this.oauthStates.set(state, redirectUri);

    const scopes = [
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/commerce.catalog.readonly',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.appId!,
      response_type: 'code',
      redirect_uri: this.ruName || redirectUri,
      scope: scopes,
      state,
    });

    const url = `https://auth.${process.env.NODE_ENV === 'production' ? '' : 'sandbox.'}ebay.com/oauth2/authorize?${params.toString()}`;
    console.log('[eBay] Generated OAuth URL');
    return { url, state };
  }

  async handleCallback(code: string, state: string): Promise<{
    accessToken: string;
    refreshToken: string;
    storeId: string;
    storeName: string;
    expiresIn?: number;
  }> {
    if (this.isMock) {
      return (await this.getMockService()).handleCallback(code, state);
    }

    const redirectUri = this.oauthStates.get(state);
    if (!redirectUri) {
      throw new Error('Invalid OAuth state');
    }
    this.oauthStates.delete(state);

    // Exchange code for token
    const credentials = Buffer.from(`${this.appId}:${this.certId}`).toString('base64');

    const tokenResponse = await fetch(
      `https://api.${process.env.NODE_ENV === 'production' ? '' : 'sandbox.'}ebay.com/identity/v1/oauth2/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.ruName || redirectUri,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      throw new Error(`eBay token exchange failed: ${err}`);
    }

    const tokenData: EBayTokenResponse = await tokenResponse.json();

    // eBay doesn't provide shop name directly in token response — we'd need to call APIs
    // For now, use a placeholder
    const storeName = 'eBay Store';

    console.log(`[eBay] Connected to store`);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || '',
      storeId: `ebay-${Date.now()}`,
      storeName,
      expiresIn: tokenData.expires_in,
    };
  }

  async refreshToken(_accountId: string): Promise<void> {
    if (this.isMock) {
      return (await this.getMockService()).refreshToken(_accountId);
    }
    console.log('[eBay] Token refresh not yet implemented with real credentials');
  }

  async getListings(_accountId: string): Promise<MarketplaceListingData[]> {
    if (this.isMock) {
      return (await this.getMockService()).getListings(_accountId);
    }
    console.log('[eBay] getListings not yet implemented with real credentials');
    return [];
  }

  async createListing(_accountId: string, data: CreateListingData): Promise<{ listingId: string; url: string }> {
    if (this.isMock) {
      return (await this.getMockService()).createListing(_accountId, data);
    }
    console.log('[eBay] createListing not yet implemented with real credentials');
    return { listingId: '', url: '' };
  }

  async updateListing(_accountId: string, listingId: string, data: UpdateListingData): Promise<void> {
    if (this.isMock) {
      return (await this.getMockService()).updateListing(_accountId, listingId, data);
    }
    console.log('[eBay] updateListing not yet implemented with real credentials');
  }

  async endListing(_accountId: string, listingId: string): Promise<void> {
    if (this.isMock) {
      return (await this.getMockService()).endListing(_accountId, listingId);
    }
    console.log('[eBay] endListing not yet implemented with real credentials');
  }

  async getOrders(_accountId: string, since?: Date): Promise<OrderData[]> {
    if (this.isMock) {
      return (await this.getMockService()).getOrders(_accountId, since);
    }
    console.log('[eBay] getOrders not yet implemented with real credentials');
    return [];
  }

  async getListingAnalytics(_accountId: string, listingId: string): Promise<AnalyticsData> {
    if (this.isMock) {
      return (await this.getMockService()).getListingAnalytics(_accountId, listingId);
    }
    console.log('[eBay] getListingAnalytics not yet implemented with real credentials');
    return { views: 0, favorites: 0, watchers: 0, clicks: 0, conversions: 0 };
  }
}

export { EbayService };
export default EbayService;
