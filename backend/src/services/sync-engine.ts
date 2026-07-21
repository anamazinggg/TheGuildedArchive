// Sync engine — manages the full marketplace synchronization process
import prisma from '../lib/prisma.js';
import { getMarketplaceService } from './marketplace-factory.js';
import {
  MarketplaceService,
  MarketplaceListingData,
  SyncResult,
  SaleResult,
} from './marketplace.js';

export async function runSync(
  marketplace: string,
  accountId: string
): Promise<SyncResult> {
  const startedAt = new Date();
  const result: SyncResult = {
    marketplace,
    accountId,
    listingsProcessed: 0,
    listingsCreated: 0,
    listingsUpdated: 0,
    listingsEnded: 0,
    salesDetected: 0,
    crossMarketplaceActions: 0,
    errors: [],
    startedAt,
    completedAt: startedAt,
  };

  try {
    const service = getMarketplaceService(marketplace as 'etsy' | 'ebay');

    // Update account sync status
    await prisma.marketplaceAccount.update({
      where: { id: accountId },
      data: { syncStatus: 'Syncing', syncErrorMessage: null },
    });

    // Step 1: Fetch active listings from marketplace
    let activeListings: MarketplaceListingData[];
    try {
      activeListings = await service.getListings(accountId);
      await logSyncEvent(marketplace, 'Import', 'Success', `Fetched ${activeListings.length} active listings`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await logSyncEvent(marketplace, 'Import', 'Failed', msg);
      throw err;
    }

    result.listingsProcessed = activeListings.length;

    // Step 2: Process each listing — match and create/update
    const activeIds = new Set<string>();

    for (const mlData of activeListings) {
      activeIds.add(mlData.listingId);

      try {
        const existing = await prisma.marketplaceListing.findFirst({
          where: {
            marketplaceListingId: mlData.listingId,
            marketplace: marketplace,
          },
        });

        if (existing) {
          // Update existing listing
          await prisma.marketplaceListing.update({
            where: { id: existing.id },
            data: {
              title: mlData.title,
              description: mlData.description,
              price: mlData.price,
              status: mapStatus(mlData.status),
              marketplaceListingUrl: mlData.url,
              marketplaceCategory: mlData.category || existing.marketplaceCategory,
              syncStatus: 'Synced',
              lastSyncAt: new Date(),
              syncMessage: null,
            },
          });
          result.listingsUpdated++;
        } else {
          // Create new unmatched listing
          const unmatchedId = await getOrCreateUnmatchedItem();
          await prisma.marketplaceListing.create({
            data: {
              inventoryItemId: unmatchedId,
              marketplace: marketplace,
              marketplaceListingId: mlData.listingId,
              marketplaceListingUrl: mlData.url,
              title: mlData.title,
              description: mlData.description,
              price: mlData.price,
              quantity: mlData.quantity || 1,
              status: 'Active',
              marketplaceCategory: mlData.category,
              syncStatus: 'Synced',
              lastSyncAt: new Date(),
              syncMessage: 'Created from sync — needs manual inventory matching',
            },
          });
          result.listingsCreated++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`Listing ${mlData.listingId}: ${msg}`);
        await logSyncEvent(marketplace, 'Import', 'Failed', msg, undefined, mlData.listingId);
      }
    }

    // Step 3: Detect removed listings (were active before, now not in response)
    const previouslyActive = await prisma.marketplaceListing.findMany({
      where: {
        marketplace: marketplace,
        status: 'Active',
        marketplaceListingId: { notIn: Array.from(activeIds) },
      },
    });

    for (const listing of previouslyActive) {
      // Check if it was sold (we'll handle in detectSales step)
      // For now, just mark as potentially ended
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          status: 'Ended',
          syncStatus: 'Synced',
          lastSyncAt: new Date(),
          syncMessage: 'Listing no longer returned by marketplace API (may be sold or ended)',
        },
      });
      result.listingsEnded++;
    }

    // Step 4: Detect sales
    try {
      const sales = await detectSales(marketplace, accountId);
      result.salesDetected = sales.length;

      // For each sale, check cross-marketplace protection
      for (const sale of sales) {
        try {
          // Find the inventory item linked to this listing
          const listing = await prisma.marketplaceListing.findFirst({
            where: { marketplaceListingId: sale.listingId },
          });

          if (listing && !(await isUnmatchedItem(listing.inventoryItemId))) {
            await crossMarketplaceProtection(listing.inventoryItemId, marketplace);
            result.crossMarketplaceActions++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          result.errors.push(`Cross-marketplace: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Sales detection: ${msg}`);
      await logSyncEvent(marketplace, 'SaleDetection', 'Failed', msg);
    }

    // Step 5: Update account
    await prisma.marketplaceAccount.update({
      where: { id: accountId },
      data: {
        lastSyncAt: new Date(),
        syncStatus: result.errors.length > 0 ? 'Error' : 'Idle',
        syncErrorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
      },
    });

    await logSyncEvent(
      marketplace,
      'Sync',
      'Success',
      `Sync complete: ${result.listingsCreated} created, ${result.listingsUpdated} updated, ${result.listingsEnded} ended, ${result.salesDetected} sales`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(`Sync failed: ${msg}`);

    // Update account error status
    await prisma.marketplaceAccount.update({
      where: { id: accountId },
      data: {
        syncStatus: 'Error',
        syncErrorMessage: msg,
        lastSyncAt: new Date(),
      },
    });

    await logSyncEvent(marketplace, 'Sync', 'Failed', msg);
  }

  result.completedAt = new Date();
  return result;
}

export async function detectSales(
  marketplace: string,
  accountId: string
): Promise<SaleResult[]> {
  const service = getMarketplaceService(marketplace as 'etsy' | 'ebay');
  const sales: SaleResult[] = [];

  // Look back 7 days for recent orders
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const orders = await service.getOrders(accountId, since);

  for (const order of orders) {
    for (const item of order.items) {
      try {
        // Find the listing in our DB
        const listing = await prisma.marketplaceListing.findFirst({
          where: { marketplaceListingId: item.listingId },
        });

        // Create or update Order
        const existingOrder = await prisma.order.findUnique({
          where: { marketplaceOrderId: order.orderId },
        });

        if (!existingOrder) {
          await prisma.order.create({
            data: {
              orderNumber: order.orderNumber,
              marketplace: marketplace,
              marketplaceOrderId: order.orderId,
              buyerName: order.buyerName,
              buyerUsername: order.buyerUsername,
              buyerEmail: order.buyerEmail,
              saleDate: order.saleDate,
              paymentStatus: order.paymentStatus,
              fulfillmentStatus: order.fulfillmentStatus,
              shippingDeadline: order.shippingDeadline,
              shippingCarrier: order.shippingCarrier,
              trackingNumber: order.trackingNumber,
              shippingCost: order.shippingCost,
              insuranceCost: order.insuranceCost,
              salesTaxCollected: order.salesTaxCollected,
              notes: order.notes,
              orderItems: {
                create: {
                  inventoryItemId: listing?.inventoryItemId && !(await isUnmatchedItem(listing.inventoryItemId))
                  ? listing.inventoryItemId
                  : await getOrCreateUnmatchedItem(),
                  salePrice: item.salePrice,
                  quantity: item.quantity,
                },
              },
            },
          });
        }

        // Update listing & inventory status
        if (listing) {
          await prisma.marketplaceListing.update({
            where: { id: listing.id },
            data: { status: 'Sold', syncStatus: 'Synced' },
          });

          if (!(await isUnmatchedItem(listing.inventoryItemId))) {
            await prisma.inventoryItem.update({
              where: { id: listing.inventoryItemId },
              data: { status: 'Sold' },
            });
          }
        }

        sales.push({
          listingId: item.listingId,
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          salePrice: item.salePrice,
          saleDate: order.saleDate,
          marketplace,
        });

        await logSyncEvent(
          marketplace,
          'SaleDetection',
          'Success',
          `Detected sale: ${order.orderNumber}, $${item.salePrice.toFixed(2)}`,
          listing?.inventoryItemId,
          item.listingId
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await logSyncEvent(marketplace, 'SaleDetection', 'Failed', msg, undefined, item.listingId);
      }
    }
  }

  return sales;
}

export async function crossMarketplaceProtection(
  inventoryItemId: string,
  soldOnMarketplace: string
): Promise<void> {
  // Find all active listings for this item on OTHER marketplaces
  const otherListings = await prisma.marketplaceListing.findMany({
    where: {
      inventoryItemId,
      marketplace: { not: soldOnMarketplace },
      status: { in: ['Active', 'Draft'] },
    },
  });

  for (const listing of otherListings) {
    try {
      const service = getMarketplaceService(listing.marketplace as 'etsy' | 'ebay');

      // Try to end the listing on the other marketplace
      if (listing.marketplaceListingId) {
        await service.endListing(listing.marketplaceListingId, listing.marketplaceListingId);
      }

      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          status: 'Ended',
          syncMessage: `Auto-ended: item sold on ${soldOnMarketplace}`,
        },
      });

      await logSyncEvent(
        listing.marketplace,
        'Delete',
        'Success',
        `Cross-marketplace delist: ended listing on ${listing.marketplace} (item sold on ${soldOnMarketplace})`,
        inventoryItemId,
        listing.marketplaceListingId
      );

      console.log(
        `[CrossMarketplace] Ended ${listing.marketplace} listing ${listing.marketplaceListingId} — item sold on ${soldOnMarketplace}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await logSyncEvent(
        listing.marketplace,
        'Delete',
        'Failed',
        `Cross-marketplace delist failed: ${msg}`,
        inventoryItemId,
        listing.marketplaceListingId
      );
    }
  }
}

export function scheduleSync(_intervalMs: number): NodeJS.Timeout {
  // Set up periodic sync. In production, use a proper job queue (bull/better-queue)
  const intervalMs = _intervalMs || 15 * 60 * 1000; // default 15 minutes
  console.log(`[SyncEngine] Scheduled sync every ${intervalMs / 1000}s`);

  return setInterval(async () => {
    console.log('[SyncEngine] Running scheduled sync...');
    try {
      const accounts = await prisma.marketplaceAccount.findMany({
        where: { isConnected: true },
      });

      for (const account of accounts) {
        await runSync(account.marketplace, account.id);
      }
    } catch (err) {
      console.error('[SyncEngine] Scheduled sync error:', err);
    }
  }, intervalMs);
}

// ---- Helpers ----

function mapStatus(raw: string): string {
  const status = raw?.toLowerCase() || '';
  if (status === 'active') return 'Active';
  if (status === 'inactive' || status === 'ended') return 'Ended';
  if (status === 'sold') return 'Sold';
  if (status === 'draft') return 'Draft';
  return 'Active';
}

async function getOrCreateUnmatchedItem(): Promise<string> {
  const sku = '__UNMATCHED__';
  let item = await prisma.inventoryItem.findUnique({ where: { sku } });
  if (!item) {
    item = await prisma.inventoryItem.create({
      data: {
        sku,
        title: 'Unmatched Marketplace Listing',
        description: 'Placeholder for listings that could not be matched to inventory items',
        status: 'Archived',
        askingPrice: 0,
      },
    });
  }
  return item.id;
}

async function isUnmatchedItem(inventoryItemId: string): Promise<boolean> {
  const unmatchedId = await getOrCreateUnmatchedItem();
  return inventoryItemId === unmatchedId;
}

async function logSyncEvent(
  marketplace: string,
  eventType: string,
  status: string,
  message?: string,
  relatedItemId?: string,
  relatedListingId?: string
): Promise<void> {
  await prisma.syncEvent.create({
    data: {
      marketplace,
      eventType,
      status,
      message: message || null,
      relatedItemId: relatedItemId || null,
      relatedListingId: relatedListingId || null,
      lastAttemptAt: new Date(),
    },
  });
}
