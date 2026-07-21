import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);
// Dashboard is read-only, all authenticated users can access

// GET /api/dashboard/summary
router.get('/summary', async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      totalActive,
      totalCostAgg,
      totalAskingAgg,
      soldThisMonth,
      ordersAwaitingShipment,
      agingCount,
      revenueAgg,
      feesAgg,
      expensesAgg,
      shippingAgg,
      totalExpensesAgg,
      recentOrders,
    ] = await Promise.all([
      prisma.inventoryItem.count({
        where: { deletedAt: null },
      }),
      prisma.inventoryItem.aggregate({
        _sum: { totalCostBasis: true },
        where: { deletedAt: null },
      }),
      prisma.inventoryItem.aggregate({
        _sum: { askingPrice: true },
        where: { deletedAt: null, status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived'] } },
      }),
      prisma.orderItem.findMany({
        where: {
          order: { saleDate: { gte: startOfMonth } },
        },
        select: { salePrice: true },
      }),
      prisma.order.count({
        where: { fulfillmentStatus: 'AwaitingShipment' },
      }),
      prisma.inventoryItem.count({
        where: {
          deletedAt: null,
          status: {
            notIn: ['Sold', 'Shipped', 'Returned', 'Delisted', 'Archived'],
          },
          createdAt: { lt: ninetyDaysAgo },
        },
      }),
      // Revenue transactions this month
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'Revenue', transactionDate: { gte: startOfMonth } },
      }),
      // Fee transactions this month
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'Fee', transactionDate: { gte: startOfMonth } },
      }),
      // Expense transactions this month
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'Expense', transactionDate: { gte: startOfMonth } },
      }),
      // Shipping transactions this month
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'Shipping', transactionDate: { gte: startOfMonth } },
      }),
      // Actual expenses this month
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { expenseDate: { gte: startOfMonth } },
      }),
      // Last 5 orders with item titles
      prisma.order.findMany({
        take: 5,
        orderBy: { saleDate: 'desc' },
        include: {
          orderItems: {
            include: {
              inventoryItem: { select: { id: true, title: true, sku: true } },
            },
          },
        },
      }),
    ]);

    const revenueThisMonth = revenueAgg._sum.amount || 0;

    // Estimated profit = revenue - fees - expenses (from transactions) - shipping
    const totalFees = feesAgg._sum.amount || 0;
    const totalTxExpenses = expensesAgg._sum.amount || 0;
    const totalShipping = shippingAgg._sum.amount || 0;
    const totalExpensesThisMonth = totalExpensesAgg._sum.amount || 0;

    const estimatedProfitThisMonth = revenueThisMonth - totalFees - totalTxExpenses - totalShipping;

    res.json({
      totalActiveItems: totalActive,
      totalInventoryCost: totalCostAgg._sum.totalCostBasis || 0,
      totalAskingPriceValue: totalAskingAgg._sum.askingPrice || 0,
      revenueThisMonth,
      estimatedProfitThisMonth,
      ordersAwaitingShipment,
      totalExpensesThisMonth,
      itemsAwaitingShipment: ordersAwaitingShipment,
      agingInventoryCount: agingCount,
      recentOrders,
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// GET /api/dashboard/recent-sales
router.get('/recent-sales', async (_req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      take: 5,
      orderBy: { saleDate: 'desc' },
      include: {
        orderItems: {
          include: {
            inventoryItem: { select: { id: true, title: true, sku: true } },
          },
        },
      },
    });
    res.json({ orders });
  } catch (error) {
    console.error('Recent sales error:', error);
    res.status(500).json({ error: 'Failed to fetch recent sales' });
  }
});

// GET /api/dashboard/alerts
router.get('/alerts', async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      needsPhotos,
      needsResearch,
      agingCount,
      draftCount,
    ] = await Promise.all([
      prisma.inventoryItem.count({ where: { deletedAt: null, status: 'NeedsPhotos' } }),
      prisma.inventoryItem.count({ where: { deletedAt: null, status: 'NeedsResearch' } }),
      prisma.inventoryItem.count({
        where: {
          deletedAt: null,
          status: { notIn: ['Sold', 'Shipped', 'Returned', 'Delisted', 'Archived'] },
          createdAt: { lt: ninetyDaysAgo },
        },
      }),
      prisma.inventoryItem.count({ where: { deletedAt: null, status: 'Draft' } }),
    ]);

    const total = needsPhotos + needsResearch + agingCount + draftCount;

    res.json({
      total,
      breakdown: {
        needsPhotos,
        needsResearch,
        aging: agingCount,
        draft: draftCount,
      },
    });
  } catch (error) {
    console.error('Dashboard alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

export default router;
