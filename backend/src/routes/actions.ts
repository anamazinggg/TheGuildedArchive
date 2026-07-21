import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireWriteForRole, AuthRequest } from '../middleware/auth.js';
import { requireTenantContext } from '../lib/tenant-context.js';

const router = Router();
router.use(authMiddleware);
// Actions: GET for all, PUT (dismiss) requires ListingAssistant+
router.use(requireWriteForRole('ListingAssistant'));

interface Alert {
  id: string;
  category: string;
  title: string;
  itemId: string;
  description: string;
  action: string;
  actionLink: string;
}

async function gatherAlerts(): Promise<Alert[]> {
  const now = new Date();
  const savedStates = await prisma.actionAlertState.findMany({
    where: {
      OR: [
        { dismissed: true },
        { snoozedUntil: { gt: now } },
      ],
    },
  });
  const alertStates = new Map<string, { dismissed: boolean; snoozedUntil: Date | null }>(
    savedStates.map((state: any) => [state.alertId, state])
  );
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const alerts: Alert[] = [];

  // Helper: check if alert is snoozed/dismissed
  const isFiltered = (itemId: string, cat: string) => {
    const state = alertStates.get(`${cat}-${itemId}`);
    if (!state) return false;
    if (state.dismissed) return true;
    if (state.snoozedUntil && state.snoozedUntil > now) return true;
    return false;
  };

  // 1. Not Yet Listed — Draft, NeedsPhotos, NeedsResearch
  const notListed = await prisma.inventoryItem.findMany({
    where: { deletedAt: null, status: { in: ['Draft', 'NeedsPhotos', 'NeedsResearch'] } },
    select: { id: true, title: true, sku: true, status: true },
  });
  for (const item of notListed) {
    if (isFiltered(item.id, 'not-listed')) continue;
    const desc = item.status === 'Draft' ? 'Draft listing — complete item details and photos'
      : item.status === 'NeedsPhotos' ? 'Needs photos before listing'
      : 'Needs research/verification before listing';
    alerts.push({
      id: `not-listed-${item.id}`,
      category: 'not-listed',
      title: item.title,
      itemId: item.id,
      description: desc,
      action: 'Open Item',
      actionLink: `/inventory/${item.id}`,
    });
  }

  // 2. Missing Photos — Active items with no photos
  const noPhotos = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted', 'Draft', 'NeedsPhotos'] },
      photos: { none: {} },
    },
    select: { id: true, title: true, sku: true },
  });
  for (const item of noPhotos) {
    if (isFiltered(item.id, 'missing-photos')) continue;
    alerts.push({
      id: `missing-photos-${item.id}`,
      category: 'missing-photos',
      title: item.title,
      itemId: item.id,
      description: 'Active item has no photos — add photos to improve listing visibility',
      action: 'Upload Photos',
      actionLink: `/inventory/${item.id}`,
    });
  }

  // 3. Missing Information — Items missing measurements, condition, or cost
  const missingInfo = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted'] },
      OR: [
        { dimensions: null },
        { conditionNotes: null },
        { totalCostBasis: null },
        { description: '' },
      ],
    },
    select: { id: true, title: true, sku: true, dimensions: true, conditionNotes: true, totalCostBasis: true, description: true },
  });
  for (const item of missingInfo) {
    if (isFiltered(item.id, 'missing-info')) continue;
    const missing: string[] = [];
    if (!item.dimensions) missing.push('measurements');
    if (!item.conditionNotes) missing.push('condition notes');
    if (!item.totalCostBasis) missing.push('cost basis');
    if (!item.description) missing.push('description');
    alerts.push({
      id: `missing-info-${item.id}`,
      category: 'missing-info',
      title: item.title,
      itemId: item.id,
      description: `Missing: ${missing.join(', ')}`,
      action: 'Add Information',
      actionLink: `/inventory/${item.id}`,
    });
  }

  // 4. Sync Errors
  const syncErrors = await prisma.syncEvent.findMany({
    where: { status: 'Failed', createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
    select: { id: true, marketplace: true, eventType: true, message: true, relatedItemId: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  for (const ev of syncErrors) {
    if (isFiltered(ev.id, 'sync-error')) continue;
    alerts.push({
      id: `sync-error-${ev.id}`,
      category: 'sync-error',
      title: `${ev.marketplace} ${ev.eventType} failed`,
      itemId: ev.relatedItemId || ev.id,
      description: ev.message || 'Sync failed — check marketplace connection',
      action: 'View Integrations',
      actionLink: '/integrations',
    });
  }

  // 5. Listed on One Marketplace — Items only on Etsy or eBay (not both)
  const singleListed = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      status: { in: ['ListedOnEtsy', 'ListedOnEbay'] },
    },
    select: { id: true, title: true, sku: true, status: true },
  });
  for (const item of singleListed) {
    if (isFiltered(item.id, 'single-marketplace')) continue;
    const otherPlatform = item.status === 'ListedOnEtsy' ? 'eBay' : 'Etsy';
    alerts.push({
      id: `single-marketplace-${item.id}`,
      category: 'single-marketplace',
      title: item.title,
      itemId: item.id,
      description: `Only listed on ${item.status === 'ListedOnEtsy' ? 'Etsy' : 'eBay'} — consider cross-listing on ${otherPlatform}`,
      action: 'Create Listing',
      actionLink: `/inventory/${item.id}/create-listing`,
    });
  }

  // 6. Aging Inventory — Listed >30/60/90 days
  const agingItems = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted'] },
      OR: [
        { dateListed: { lt: thirtyDaysAgo } },
        { dateListed: null, createdAt: { lt: thirtyDaysAgo } },
      ],
    },
    select: { id: true, title: true, sku: true, askingPrice: true, dateListed: true, createdAt: true },
  });
  for (const item of agingItems) {
    const listDate = item.dateListed || item.createdAt;
    const days = Math.round((now.getTime() - listDate.getTime()) / (1000 * 60 * 60 * 24));
    let threshold: string;
    if (days > 90) threshold = '90+ days';
    else if (days > 60) threshold = '60+ days';
    else threshold = '30+ days';

    if (isFiltered(item.id, 'aging')) continue;
    alerts.push({
      id: `aging-${item.id}`,
      category: 'aging',
      title: item.title,
      itemId: item.id,
      description: `Listed for ${days} days (${threshold}) — consider revising price or refreshing photos`,
      action: 'Review Item',
      actionLink: `/inventory/${item.id}`,
    });
  }

  // 7. Awaiting Shipment
  const awaitingShipment = await prisma.order.findMany({
    where: { fulfillmentStatus: 'AwaitingShipment' },
    include: {
      orderItems: { include: { inventoryItem: { select: { id: true, title: true } } } },
    },
  });
  for (const order of awaitingShipment) {
    if (isFiltered(order.id, 'awaiting-shipment')) continue;
    const itemTitles = order.orderItems.map(oi => oi.inventoryItem?.title || 'Unknown').join(', ');
    alerts.push({
      id: `awaiting-shipment-${order.id}`,
      category: 'awaiting-shipment',
      title: `Order ${order.orderNumber}: ${itemTitles}`,
      itemId: order.orderItems[0]?.inventoryItem?.id || order.id,
      description: `Sold on ${new Date(order.saleDate).toLocaleDateString()} — needs to be shipped`,
      action: 'View Order',
      actionLink: `/orders/${order.id}`,
    });
  }

  // 8. No Storage Location
  const noLocation = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted'] },
      storageLocationId: null,
    },
    select: { id: true, title: true, sku: true },
  });
  for (const item of noLocation) {
    if (isFiltered(item.id, 'no-location')) continue;
    alerts.push({
      id: `no-location-${item.id}`,
      category: 'no-location',
      title: item.title,
      itemId: item.id,
      description: 'No storage location assigned — assign a location to find items faster',
      action: 'Add Location',
      actionLink: `/inventory/${item.id}`,
    });
  }

  // 9. Missing Cost Basis — Items sold or listed without purchase cost
  const noCost = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['Draft', 'NeedsPhotos', 'NeedsResearch'] },
      totalCostBasis: null,
    },
    select: { id: true, title: true, sku: true, status: true },
  });
  for (const item of noCost) {
    if (isFiltered(item.id, 'no-cost')) continue;
    alerts.push({
      id: `no-cost-${item.id}`,
      category: 'no-cost',
      title: item.title,
      itemId: item.id,
      description: statusDesc(item.status) + ' — missing cost basis; cannot calculate profit accurately',
      action: 'Add Cost',
      actionLink: `/inventory/${item.id}`,
    });
  }

  // 10. Price Inconsistency — Items where listing price differs from asking price
  const listings = await prisma.marketplaceListing.findMany({
    where: { status: 'Active' },
    include: {
      inventoryItem: { select: { id: true, title: true, askingPrice: true } },
    },
  });
  for (const listing of listings) {
    const askingPrice = listing.inventoryItem?.askingPrice;
    if (askingPrice && Math.abs(listing.price - askingPrice) > 0.01) {
      if (isFiltered(listing.inventoryItem.id, 'price-mismatch')) continue;
      alerts.push({
        id: `price-mismatch-${listing.id}`,
        category: 'price-mismatch',
        title: listing.inventoryItem?.title || listing.title,
        itemId: listing.inventoryItemId,
        description: `Listing price ($${listing.price.toFixed(2)}) differs from asking price ($${askingPrice.toFixed(2)}) on ${listing.marketplace}`,
        action: 'Update Price',
        actionLink: `/listings/${listing.id}`,
      });
    }
  }

  return alerts;
}

function statusDesc(status: string): string {
  switch (status) {
    case 'ReadyToList': return 'Ready to list';
    case 'ListedOnEtsy': return 'Listed on Etsy';
    case 'ListedOnEbay': return 'Listed on eBay';
    case 'ListedOnBoth': return 'Listed on both marketplaces';
    case 'Sold': return 'Sold';
    default: return status;
  }
}

// GET /api/actions — all alerts grouped by category
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const alerts = await gatherAlerts();

    // Group by category
    const grouped: Record<string, { category: string; label: string; icon: string; alerts: Alert[] }> = {};

    const categoryMeta: Record<string, { label: string; icon: string; order: number }> = {
      'not-listed': { label: 'Not Yet Listed', icon: '🆕', order: 1 },
      'missing-photos': { label: 'Missing Photos', icon: '📸', order: 2 },
      'missing-info': { label: 'Missing Information', icon: '📋', order: 3 },
      'sync-error': { label: 'Sync Errors', icon: '⚠️', order: 4 },
      'single-marketplace': { label: 'Listed on One Marketplace', icon: '🔗', order: 5 },
      'aging': { label: 'Aging Inventory', icon: '⏰', order: 6 },
      'awaiting-shipment': { label: 'Awaiting Shipment', icon: '📦', order: 7 },
      'no-location': { label: 'No Storage Location', icon: '🏷️', order: 8 },
      'no-cost': { label: 'Missing Cost Basis', icon: '💰', order: 9 },
      'price-mismatch': { label: 'Price Inconsistency', icon: '🔄', order: 10 },
    };

    for (const alert of alerts) {
      if (!grouped[alert.category]) {
        const meta = categoryMeta[alert.category] || { label: alert.category, icon: '📌', order: 99 };
        grouped[alert.category] = { category: alert.category, label: meta.label, icon: meta.icon, alerts: [] };
      }
      grouped[alert.category].alerts.push(alert);
    }

    // Sort groups by defined order
    const groups = Object.values(grouped).sort((a, b) => {
      const orderA = categoryMeta[a.category]?.order || 99;
      const orderB = categoryMeta[b.category]?.order || 99;
      return orderA - orderB;
    });

    const total = alerts.length;

    res.json({ total, groups });
  } catch (error) {
    console.error('Actions error:', error);
    res.status(500).json({ error: 'Failed to fetch action alerts' });
  }
});

// GET /api/actions/count
router.get('/count', async (req: AuthRequest, res: Response) => {
  try {
    const alerts = await gatherAlerts();
    res.json({ total: alerts.length });
  } catch (error) {
    console.error('Actions count error:', error);
    res.status(500).json({ error: 'Failed to fetch action count' });
  }
});

// PUT /api/actions/:alertId/dismiss
router.put('/:alertId/dismiss', async (req: AuthRequest, res: Response) => {
  try {
    const alertId = String(req.params.alertId);
    const organizationId = requireTenantContext().organizationId;
    await prisma.actionAlertState.upsert({
      where: { organizationId_alertId: { organizationId, alertId } },
      create: { organizationId, alertId, dismissed: true },
      update: { dismissed: true, snoozedUntil: null },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Dismiss error:', error);
    res.status(500).json({ error: 'Failed to dismiss alert' });
  }
});

// PUT /api/actions/:alertId/snooze
router.put('/:alertId/snooze', async (req: AuthRequest, res: Response) => {
  try {
    const alertId = String(req.params.alertId);
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    const organizationId = requireTenantContext().organizationId;
    await prisma.actionAlertState.upsert({
      where: { organizationId_alertId: { organizationId, alertId } },
      create: { organizationId, alertId, dismissed: false, snoozedUntil },
      update: { dismissed: false, snoozedUntil },
    });
    res.json({ success: true, snoozedUntil });
  } catch (error) {
    console.error('Snooze error:', error);
    res.status(500).json({ error: 'Failed to snooze alert' });
  }
});

export default router;
