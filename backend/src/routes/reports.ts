import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireWriteForRole, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requireWriteForRole('Manager'));

// GET /api/reports/sales — Sales report data for CSV export
router.get('/sales', async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const orders = await prisma.order.findMany({
      where: Object.keys(dateFilter).length > 0 ? { saleDate: dateFilter } : {},
      include: {
        orderItems: {
          include: {
            inventoryItem: { select: { id: true, title: true, sku: true, category: true, totalCostBasis: true } },
          },
        },
      },
      orderBy: { saleDate: 'desc' },
    });

    const rows = orders.flatMap(order =>
      order.orderItems.map(oi => ({
        orderNumber: order.orderNumber,
        saleDate: order.saleDate.toISOString().split('T')[0],
        marketplace: order.marketplace,
        buyerName: order.buyerName || '',
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        itemTitle: oi.inventoryItem?.title || '',
        sku: oi.inventoryItem?.sku || '',
        category: oi.inventoryItem?.category || '',
        salePrice: oi.salePrice,
        quantity: oi.quantity,
        costBasis: oi.inventoryItem?.totalCostBasis || 0,
        grossProfit: oi.salePrice - (oi.inventoryItem?.totalCostBasis || 0),
        shippingCost: order.shippingCost || 0,
        taxCollected: order.salesTaxCollected || 0,
        trackingNumber: order.trackingNumber || '',
      }))
    );

    res.json({ rows, totalOrders: orders.length, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({ error: 'Failed to generate sales report' });
  }
});

// GET /api/reports/profit — Profit report data
router.get('/profit', async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const orderItems = await prisma.orderItem.findMany({
      where: Object.keys(dateFilter).length > 0
        ? { order: { saleDate: dateFilter } }
        : {},
      include: {
        order: true,
        inventoryItem: true,
      },
    });

    // Also get standalone expenses
    const expenses = await prisma.expense.findMany({
      where: Object.keys(dateFilter).length > 0
        ? { expenseDate: dateFilter }
        : {},
    });

    // Get fee transactions
    const feeTx = await prisma.transaction.findMany({
      where: {
        type: { in: ['Fee', 'Shipping'] },
        ...(Object.keys(dateFilter).length > 0 ? { transactionDate: dateFilter } : {}),
      },
      include: { order: { select: { orderNumber: true } } },
    });

    const rows = orderItems.map(oi => {
      const itemFees = feeTx
        .filter(ft => ft.orderId === oi.orderId)
        .reduce((s, ft) => s + ft.amount, 0);
      const cost = oi.inventoryItem?.totalCostBasis || 0;
      const revenue = oi.salePrice;
      const grossProfit = revenue - cost;
      const netProfit = grossProfit - itemFees - (oi.order.shippingCost || 0);

      return {
        orderNumber: oi.order.orderNumber,
        saleDate: oi.order.saleDate.toISOString().split('T')[0],
        marketplace: oi.order.marketplace,
        itemTitle: oi.inventoryItem?.title || '',
        sku: oi.inventoryItem?.sku || '',
        salePrice: revenue,
        costBasis: cost,
        shippingCost: oi.order.shippingCost || 0,
        marketplaceFees: Math.round(itemFees * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMargin: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
      };
    });

    // Summary
    const totalRevenue = rows.reduce((s, r) => s + r.salePrice, 0);
    const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);
    const totalFees = rows.reduce((s, r) => s + r.marketplaceFees, 0);
    const totalShipping = rows.reduce((s, r) => s + r.shippingCost, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const totalNetProfit = totalRevenue - totalCost - totalFees - totalShipping - totalExpenses;

    res.json({
      rows,
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        totalShipping: Math.round(totalShipping * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalNetProfit: Math.round(totalNetProfit * 100) / 100,
        itemCount: rows.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Profit report error:', error);
    res.status(500).json({ error: 'Failed to generate profit report' });
  }
});

// GET /api/reports/tax — Tax preparation summary
router.get('/tax', async (req: AuthRequest, res: Response) => {
  try {
    const { year } = req.query;
    const taxYear = year ? parseInt(year as string) : new Date().getFullYear();
    const startDate = new Date(taxYear, 0, 1);
    const endDate = new Date(taxYear, 11, 31, 23, 59, 59);

    const [revenueTx, feeTx, shippingTx, refundTx, expenses, sales] = await Promise.all([
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'Revenue', transactionDate: { gte: startDate, lte: endDate } },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'Fee', transactionDate: { gte: startDate, lte: endDate } },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'Shipping', transactionDate: { gte: startDate, lte: endDate } },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'Refund', transactionDate: { gte: startDate, lte: endDate } },
      }),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { expenseDate: { gte: startDate, lte: endDate } },
      }),
      prisma.order.aggregate({
        _sum: { salesTaxCollected: true },
        where: { saleDate: { gte: startDate, lte: endDate } },
      }),
    ]);

    // Marketplace breakdown
    const marketplaceBreakdown = await prisma.transaction.groupBy({
      by: ['marketplace'],
      _sum: { amount: true },
      where: { type: 'Revenue', transactionDate: { gte: startDate, lte: endDate } },
    });

    // Expense breakdown by category
    const expenseBreakdown = await prisma.expense.groupBy({
      by: ['category'],
      _sum: { amount: true },
      where: { expenseDate: { gte: startDate, lte: endDate } },
    });

    // Sold items count
    const soldCount = await prisma.orderItem.count({
      where: { order: { saleDate: { gte: startDate, lte: endDate } } },
    });

    const totalRevenue = revenueTx._sum.amount || 0;
    const totalFees = feeTx._sum.amount || 0;
    const totalShipping = shippingTx._sum.amount || 0;
    const totalRefunds = refundTx._sum.amount || 0;
    const totalExpenses = expenses._sum.amount || 0;
    const totalTaxCollected = sales._sum.salesTaxCollected || 0;

    res.json({
      taxYear,
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        totalShipping: Math.round(totalShipping * 100) / 100,
        totalRefunds: Math.round(totalRefunds * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalTaxCollected: Math.round(totalTaxCollected * 100) / 100,
        netIncome: Math.round((totalRevenue - totalFees - totalShipping - totalRefunds - totalExpenses) * 100) / 100,
        itemsSold: soldCount,
      },
      marketplaceBreakdown: marketplaceBreakdown.map(m => ({
        marketplace: m.marketplace,
        revenue: m._sum.amount || 0,
      })),
      expenseBreakdown: expenseBreakdown.map(e => ({
        category: e.category,
        amount: e._sum.amount || 0,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Tax report error:', error);
    res.status(500).json({ error: 'Failed to generate tax report' });
  }
});

// POST /api/reports/backup — Full JSON backup
router.post('/backup', async (req: AuthRequest, res: Response) => {
  try {
    const [
      memberships,
      inventoryItems,
      inventoryPhotos,
      inventoryDocuments,
      tags,
      inventoryTags,
      storageLocations,
      marketplaceAccounts,
      marketplaceListings,
      listingTemplates,
      orders,
      orderItems,
      transactions,
      expenses,
      syncEvents,
      activityLogs,
      analyticsSnapshots,
    ] = await Promise.all([
      prisma.organizationMembership.findMany({
        where: { organizationId: req.user!.organizationId, status: 'Active' },
        include: { user: true },
      }),
      prisma.inventoryItem.findMany(),
      prisma.inventoryPhoto.findMany(),
      prisma.inventoryDocument.findMany(),
      prisma.tag.findMany(),
      prisma.inventoryTag.findMany(),
      prisma.storageLocation.findMany(),
      prisma.marketplaceAccount.findMany(),
      prisma.marketplaceListing.findMany(),
      prisma.listingTemplate.findMany(),
      prisma.order.findMany(),
      prisma.orderItem.findMany(),
      prisma.transaction.findMany(),
      prisma.expense.findMany(),
      prisma.syncEvent.findMany(),
      prisma.activityLog.findMany(),
      prisma.analyticsSnapshot.findMany(),
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      version: '1.0',
      data: {
        users: memberships.map((membership) => ({
          id: membership.user.id,
          email: membership.user.email,
          name: membership.user.name,
          role: membership.role,
          membershipId: membership.id,
          createdAt: membership.user.createdAt,
          updatedAt: membership.user.updatedAt,
        })),
        inventoryItems,
        inventoryPhotos,
        inventoryDocuments,
        tags,
        inventoryTags,
        storageLocations,
        marketplaceAccounts: marketplaceAccounts.map(a => ({
          ...a,
          encryptedAccessToken: a.encryptedAccessToken ? '[REDACTED]' : null,
          encryptedRefreshToken: a.encryptedRefreshToken ? '[REDACTED]' : null,
        })),
        marketplaceListings,
        listingTemplates,
        orders,
        orderItems,
        transactions,
        expenses,
        syncEvents,
        activityLogs,
        analyticsSnapshots,
      },
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: 'Failed to generate backup' });
  }
});

// GET /api/reports/inventory — Active inventory CSV data
router.get('/inventory', async (req: AuthRequest, res: Response) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      include: {
        storageLocation: { select: { code: true, name: true } },
        photos: { take: 1, select: { filename: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = items.map(item => ({
      sku: item.sku,
      title: item.title,
      category: item.category,
      type: item.type,
      estimatedEra: item.estimatedEra || '',
      brand: item.brand || '',
      metalType: item.metalType || '',
      metalPurity: item.metalPurity || '',
      gemstoneType: item.gemstoneType || '',
      condition: item.condition,
      status: item.status,
      askingPrice: item.askingPrice || 0,
      purchaseCost: item.purchaseCost || 0,
      totalCostBasis: item.totalCostBasis || 0,
      storageLocation: item.storageLocation?.code || '',
      dateListed: item.dateListed?.toISOString().split('T')[0] || '',
      tags: item.tags.map(t => t.tag.name).join('; '),
      hasPhotos: item.photos.length > 0 ? 'Yes' : 'No',
    }));

    res.json({ rows, total: items.length, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Inventory report error:', error);
    res.status(500).json({ error: 'Failed to generate inventory report' });
  }
});

// GET /api/reports/expenses — Expense report CSV data
router.get('/expenses', async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const expenses = await prisma.expense.findMany({
      where: Object.keys(dateFilter).length > 0 ? { expenseDate: dateFilter } : {},
      include: {
        inventoryItem: { select: { title: true, sku: true } },
      },
      orderBy: { expenseDate: 'desc' },
    });

    const rows = expenses.map(e => ({
      date: e.expenseDate.toISOString().split('T')[0],
      category: e.category,
      vendor: e.vendor || '',
      amount: e.amount,
      paymentMethod: e.paymentMethod || '',
      relatedItem: e.inventoryItem?.title || '',
      notes: e.notes || '',
    }));

    const total = expenses.reduce((s, e) => s + e.amount, 0);

    res.json({ rows, total: Math.round(total * 100) / 100, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Expense report error:', error);
    res.status(500).json({ error: 'Failed to generate expense report' });
  }
});

export default router;
