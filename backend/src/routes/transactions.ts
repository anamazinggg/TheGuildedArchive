import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireWriteForRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);
router.use(requireWriteForRole('Manager'));

// GET /api/transactions — List with pagination, filterable
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const type = req.query.type as string;
    const marketplace = req.query.marketplace as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const inventoryItemId = req.query.inventoryItemId as string;

    const where: Record<string, unknown> = {};

    if (type) {
      where.type = type;
    }
    if (marketplace) {
      where.marketplace = marketplace;
    }
    if (inventoryItemId) {
      where.inventoryItemId = inventoryItemId;
    }
    if (startDate || endDate) {
      const transactionDate: Record<string, Date> = {};
      if (startDate) transactionDate.gte = new Date(startDate);
      if (endDate) transactionDate.lte = new Date(endDate);
      where.transactionDate = transactionDate;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          inventoryItem: { select: { id: true, title: true, sku: true } },
          order: { select: { id: true, orderNumber: true, marketplace: true } },
        },
        orderBy: { transactionDate: 'desc' },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List transactions error:', error);
    res.status(500).json({ error: 'Failed to list transactions' });
  }
});

// GET /api/transactions/summary — Financial summary
router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const marketplace = req.query.marketplace as string;

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const where: Record<string, unknown> = {};
    if (Object.keys(dateFilter).length > 0) {
      where.transactionDate = dateFilter;
    }
    if (marketplace) {
      where.marketplace = marketplace;
    }

    const [revenueResult, feesResult, expensesResult, shippingResult, taxResult] = await Promise.all([
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...where, type: 'Revenue' },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...where, type: 'Fee' },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...where, type: 'Expense' },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...where, type: 'Shipping' },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...where, type: 'Tax' },
      }),
    ]);

    const totalRevenue = revenueResult._sum.amount || 0;
    const totalFees = feesResult._sum.amount || 0;
    const totalExpenses = expensesResult._sum.amount || 0;
    const totalShipping = shippingResult._sum.amount || 0;
    const totalTax = taxResult._sum.amount || 0;
    const netProfit = totalRevenue - totalFees - totalExpenses - totalShipping - totalTax;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Average order value
    const orderAgg = await prisma.order.aggregate({
      _avg: {
        shippingCost: true,
      },
      where: {
        ...(Object.keys(dateFilter).length > 0 ? { saleDate: dateFilter } : {}),
        ...(marketplace ? { marketplace } : {}),
      },
    });

    // Sum of order item prices for average order value
    const orderItemsSum = await prisma.orderItem.aggregate({
      _sum: { salePrice: true },
      _count: true,
      where: {
        order: {
          ...(Object.keys(dateFilter).length > 0 ? { saleDate: dateFilter } : {}),
          ...(marketplace ? { marketplace } : {}),
        },
      },
    });

    const averageOrderValue = orderItemsSum._count > 0
      ? (orderItemsSum._sum.salePrice || 0) / orderItemsSum._count
      : 0;

    res.json({
      totalRevenue,
      totalFees,
      totalExpenses,
      totalShipping,
      totalTax,
      netProfit,
      profitMargin: Math.round(profitMargin * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      periodStart: startDate || null,
      periodEnd: endDate || null,
    });
  } catch (error) {
    console.error('Transactions summary error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions summary' });
  }
});

// POST /api/transactions — Create manual transaction
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      type, category, amount, description, transactionDate,
      marketplace, vendor, paymentMethod, inventoryItemId,
    } = req.body;

    if (!type || amount === undefined || !transactionDate) {
      res.status(400).json({ error: 'type, amount, and transactionDate are required' });
      return;
    }

    const validTypes = ['Revenue', 'Expense', 'Refund', 'Fee', 'Tax', 'Shipping', 'Adjustment'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
      return;
    }

    const transaction = await prisma.transaction.create({
      data: {
        id: uuidv4(),
        type,
        category: category || null,
        amount,
        description: description || null,
        transactionDate: new Date(transactionDate),
        marketplace: marketplace || 'Manual',
        vendor: vendor || null,
        paymentMethod: paymentMethod || null,
        inventoryItemId: inventoryItemId || null,
      },
      include: {
        inventoryItem: { select: { id: true, title: true, sku: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    res.status(201).json({ transaction });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

export default router;
