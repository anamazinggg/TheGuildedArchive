// Tenant-aware marketplace synchronization and cross-marketplace sale protection.
import prisma, { systemPrisma } from '../lib/prisma.js';
import { requireTenantContext, runWithTenant } from '../lib/tenant-context.js';
import { getMarketplaceService } from './marketplace-factory.js';
import {
  MarketplaceListingData,
  SyncResult,
  SaleResult,
} from './marketplace.js';

function serviceKey(marketplace: string): 'etsy' | 'ebay' {
  return marketplace.toLowerCase() === 'etsy' ? 'etsy' : 'ebay';
}

export async function runSync(marketplace: string, accountId: string): Promise<SyncResult> {
  const tenant = requireTenantContext();
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
    const account = await prisma.marketplaceAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.isConnected) {
      throw new Error('Marketplace account is not connected to this storefront');
    }
    if (account.marketplace.toLowerCase() !== marketplace.toLowerCase()) {
      throw new Error('Marketplace account does not match the requested sync');
    }

    const service = getMarketplaceService(serviceKey(marketplace));
    await prisma.marketplaceAccount.update({
      where: { id: accountId },
      data: { syncStatus: 'Syncing', syncErrorMessage: null },
    });

    let activeListings: MarketplaceListingData[];
    try {
      activeListings = await service.getListings(accountId);
      await logSyncEvent(marketplace, 'Import', 'Success', `Fetched ${activeListings.length} active listings`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await logSyncEvent(marketplace, 'Import', 'Failed', message);
      throw error;
    }

    result.listingsProcessed = activeListings.length;
    const activeIds = new Set<string>();

    for (const marketplaceData of activeListings) {
      activeIds.add(marketplaceData.listingId);
      try {
        const existing = await prisma.marketplaceListing.findFirst({
          where: {
            marketplaceAccountId: accountId,
            marketplaceListingId: marketplaceData.listingId,
          },
        });

        if (existing) {
          await prisma.marketplaceListing.update({
            where: { id: existing.id },
            data: {
              title: marketplaceData.title,
              description: marketplaceData.description,
              price: marketplaceData.price,
              quantity: marketplaceData.quantity || existing.quantity,
              status: mapStatus(marketplaceData.status),
              marketplaceListingUrl: marketplaceData.url,
              marketplaceCategory: marketplaceData.category || existing.marketplaceCategory,
              syncStatus: 'Synced',
              lastSyncAt: new Date(),
              syncMessage: null,
            },
          });
          result.listingsUpdated++;
        } else {
          const unmatchedId = await getOrCreateUnmatchedItem();
          await prisma.marketplaceListing.create({
            data: {
              organizationId: tenant.organizationId,
              inventoryItemId: unmatchedId,
              marketplaceAccountId: accountId,
              marketplace: account.marketplace,
              marketplaceListingId: marketplaceData.listingId,
              marketplaceListingUrl: marketplaceData.url,
              title: marketplaceData.title,
              description: marketplaceData.description,
              price: marketplaceData.price,
              quantity: marketplaceData.quantity || 1,
              status: 'Active',
              marketplaceCategory: marketplaceData.category,
              syncStatus: 'Synced',
              lastSyncAt: new Date(),
              syncMessage: 'Imported from marketplace — match this listing to an inventory item',
            },
          });
          result.listingsCreated++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Listing ${marketplaceData.listingId}: ${message}`);
        await logSyncEvent(marketplace, 'Import', 'Failed', message, undefined, marketplaceData.listingId);
      }
    }

    const previouslyActive = await prisma.marketplaceListing.findMany({
      where: {
        marketplaceAccountId: accountId,
        status: 'Active',
        marketplaceListingId: { notIn: Array.from(activeIds) },
      },
    });

    for (const listing of previouslyActive) {
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          status: 'Ended',
          syncStatus: 'Synced',
          lastSyncAt: new Date(),
          syncMessage: 'No longer active on the marketplace; reconciliation marked it ended',
        },
      });
      result.listingsEnded++;
    }

    const sales = await detectSales(account.marketplace, accountId);
    result.salesDetected = sales.length;

    for (const sale of sales) {
      const listing = await prisma.marketplaceListing.findFirst({
        where: {
          marketplaceAccountId: accountId,
          marketplaceListingId: sale.listingId,
        },
      });
      if (listing && !(await isUnmatchedItem(listing.inventoryItemId))) {
        const actions = await crossMarketplaceProtection(listing.inventoryItemId, account.marketplace);
        result.crossMarketplaceActions += actions;
      }
    }

    await prisma.marketplaceAccount.update({
      where: { id: accountId },
      data: {
        lastSyncAt: new Date(),
        syncStatus: result.errors.length ? 'Error' : 'Idle',
        syncErrorMessage: result.errors.length ? result.errors.join('; ') : null,
      },
    });

    await logSyncEvent(
      marketplace,
      'Sync',
      result.errors.length ? 'Partial' : 'Success',
      `Sync complete: ${result.listingsCreated} created, ${result.listingsUpdated} updated, ${result.listingsEnded} ended, ${result.salesDetected} sales`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Sync failed: ${message}`);

    await prisma.marketplaceAccount.update({
      where: { id: accountId },
      data: { syncStatus: 'Error', syncErrorMessage: message, lastSyncAt: new Date() },
    }).catch(() => undefined);
    await logSyncEvent(marketplace, 'Sync', 'Failed', message).catch(() => undefined);
  }

  result.completedAt = new Date();
  return result;
}

export async function detectSales(marketplace: string, accountId: string): Promise<SaleResult[]> {
  const tenant = requireTenantContext();
  const service = getMarketplaceService(serviceKey(marketplace));
  const sales: SaleResult[] = [];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const orders = await service.getOrders(accountId, since);

  for (const order of orders) {
    try {
      const resolvedItems = await Promise.all(
        order.items.map(async (item) => {
          const listing = await prisma.marketplaceListing.findFirst({
            where: {
              marketplaceAccountId: accountId,
              marketplaceListingId: item.listingId,
            },
          });
          const inventoryItemId = listing?.inventoryItemId && !(await isUnmatchedItem(listing.inventoryItemId))
            ? listing.inventoryItemId
            : await getOrCreateUnmatchedItem();
          return { item, listing, inventoryItemId };
        })
      );

      const existingOrder = await prisma.order.findFirst({
        where: {
          marketplaceAccountId: accountId,
          marketplaceOrderId: order.orderId,
        },
      });

      if (existingOrder) {
        continue;
      }

      await prisma.order.create({
          data: {
            organizationId: tenant.organizationId,
            marketplaceAccountId: accountId,
            orderNumber: order.orderNumber,
            marketplace,
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
              create: resolvedItems.map(({ item, inventoryItemId }) => ({
                organizationId: tenant.organizationId,
                inventoryItemId,
                salePrice: item.salePrice,
                quantity: item.quantity,
              })),
            },
          },
        });

      for (const { item, listing } of resolvedItems) {
        if (listing) {
          await prisma.marketplaceListing.update({
            where: { id: listing.id },
            data: { status: 'Sold', syncStatus: 'Synced', lastSyncAt: new Date() },
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
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await logSyncEvent(marketplace, 'SaleDetection', 'Failed', message);
    }
  }

  return sales;
}

export async function crossMarketplaceProtection(
  inventoryItemId: string,
  soldOnMarketplace: string
): Promise<number> {
  const otherListings = await prisma.marketplaceListing.findMany({
    where: {
      inventoryItemId,
      marketplace: { not: soldOnMarketplace },
      status: { in: ['Active', 'Draft'] },
    },
    include: { marketplaceAccount: true },
  });

  let completed = 0;
  for (const listing of otherListings) {
    try {
      if (listing.status === 'Active' && listing.marketplaceListingId) {
        if (!listing.marketplaceAccount?.isConnected) {
          throw new Error(`No connected ${listing.marketplace} account is attached to the listing`);
        }
        const service = getMarketplaceService(serviceKey(listing.marketplace));
        await service.endListing(listing.marketplaceAccount.id, listing.marketplaceListingId);
      }

      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          status: 'Ended',
          syncStatus: 'Synced',
          lastSyncAt: new Date(),
          syncMessage: `Auto-ended because this one-of-a-kind item sold on ${soldOnMarketplace}`,
        },
      });
      completed++;

      await logSyncEvent(
        listing.marketplace,
        'CrossMarketplaceDelist',
        'Success',
        `Ended ${listing.marketplace} listing after sale on ${soldOnMarketplace}`,
        inventoryItemId,
        listing.marketplaceListingId || undefined
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          syncStatus: 'Error',
          syncMessage: `URGENT: item sold on ${soldOnMarketplace}, but delisting failed: ${message}`,
        },
      });
      await logSyncEvent(
        listing.marketplace,
        'CrossMarketplaceDelist',
        'Failed',
        `URGENT: cross-marketplace delist failed: ${message}`,
        inventoryItemId,
        listing.marketplaceListingId || undefined
      );
    }
  }

  return completed;
}

export function scheduleSync(_intervalMs: number): NodeJS.Timeout {
  const intervalMs = _intervalMs || 15 * 60 * 1000;
  console.log(`[SyncEngine] Scheduled reconciliation every ${intervalMs / 1000}s`);

  return setInterval(async () => {
    try {
      const accounts = await systemPrisma.marketplaceAccount.findMany({
        where: { isConnected: true },
      });

      for (const account of accounts) {
        await runWithTenant(
          {
            organizationId: account.organizationId,
            membershipId: 'system',
            userId: 'system',
            role: 'Owner',
          },
          () => runSync(account.marketplace, account.id)
        );
      }
    } catch (error) {
      console.error('[SyncEngine] Scheduled sync error:', error);
    }
  }, intervalMs);
}

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
  let item = await prisma.inventoryItem.findFirst({ where: { sku } });
  if (!item) {
    item = await prisma.inventoryItem.create({
      data: {
        organizationId: requireTenantContext().organizationId,
        sku,
        title: 'Unmatched Marketplace Listing',
        description: 'Placeholder for listings that still need to be matched to an inventory item',
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
      organizationId: requireTenantContext().organizationId,
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
