import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { stringify } from 'csv-stringify/sync';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireWriteForRole, AuthRequest } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

router.use(authMiddleware);
router.use(requireWriteForRole('Manager'));

const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `receipt-${uniqueSuffix}${ext}`);
  },
});

const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

// GET /api/expenses — List with pagination, filterable
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const category = req.query.category as string;
    const vendor = req.query.vendor as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const inventoryItemId = req.query.inventoryItemId as string;

    const where: Record<string, unknown> = {};

    if (category) {
      where.category = category;
    }
    if (vendor) {
      where.vendor = { contains: vendor };
    }
    if (inventoryItemId) {
      where.inventoryItemId = inventoryItemId;
    }
    if (startDate || endDate) {
      const expenseDate: Record<string, Date> = {};
      if (startDate) expenseDate.gte = new Date(startDate);
      if (endDate) expenseDate.lte = new Date(endDate);
      where.expenseDate = expenseDate;
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take: limit,
        include: {
          inventoryItem: { select: { id: true, title: true, sku: true } },
        },
        orderBy: { expenseDate: 'desc' },
      }),
      prisma.expense.count({ where }),
    ]);

    res.json({
      expenses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List expenses error:', error);
    res.status(500).json({ error: 'Failed to list expenses' });
  }
});

// GET /api/expenses/export — Export CSV (must be before /:id)
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const category = req.query.category as string;
    const vendor = req.query.vendor as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const inventoryItemId = req.query.inventoryItemId as string;

    const where: Record<string, unknown> = {};

    if (category) where.category = category;
    if (vendor) where.vendor = { contains: vendor };
    if (inventoryItemId) where.inventoryItemId = inventoryItemId;
    if (startDate || endDate) {
      const expenseDate: Record<string, Date> = {};
      if (startDate) expenseDate.gte = new Date(startDate);
      if (endDate) expenseDate.lte = new Date(endDate);
      where.expenseDate = expenseDate;
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        inventoryItem: { select: { title: true, sku: true } },
      },
      orderBy: { expenseDate: 'desc' },
    });

    const csvData = expenses.map((e) => ({
      ID: e.id,
      Category: e.category,
      Vendor: e.vendor || '',
      Amount: e.amount,
      Date: e.expenseDate.toISOString().split('T')[0],
      'Payment Method': e.paymentMethod || '',
      'Receipt File': e.receiptFilename || '',
      'Inventory Item': e.inventoryItem?.title || '',
      'Inventory SKU': e.inventoryItem?.sku || '',
      Notes: e.notes || '',
    }));

    const csv = stringify(csvData, { header: true });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export expenses error:', error);
    res.status(500).json({ error: 'Failed to export expenses' });
  }
});

// POST /api/expenses — Create expense
router.post('/', receiptUpload.single('receipt'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      category, vendor, amount, expenseDate,
      paymentMethod, inventoryItemId, notes,
    } = req.body;

    if (!category || amount === undefined || !expenseDate) {
      res.status(400).json({ error: 'category, amount, and expenseDate are required' });
      return;
    }

    const validCategories = [
      'InventoryPurchase', 'PackagingSupplies', 'ShippingSupplies',
      'Appraisal', 'Repair', 'Cleaning', 'PhotographyEquipment',
      'MarketplaceSubscription', 'Advertising', 'Software', 'Mileage', 'Other',
    ];
    if (!validCategories.includes(category)) {
      res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
      return;
    }

    let receiptFilename: string | null = null;
    if (req.file) {
      receiptFilename = req.file.filename;
    }

    const expense = await prisma.expense.create({
      data: {
        organizationId: req.user!.organizationId,
        id: uuidv4(),
        category,
        vendor: vendor || null,
        amount: parseFloat(amount),
        expenseDate: new Date(expenseDate),
        paymentMethod: paymentMethod || null,
        receiptFilename,
        inventoryItemId: inventoryItemId || null,
        notes: notes || null,
      },
      include: {
        inventoryItem: { select: { id: true, title: true, sku: true } },
      },
    });

    res.status(201).json({ expense });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// PUT /api/expenses/:id — Update expense
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    const {
      category, vendor, amount, expenseDate,
      paymentMethod, inventoryItemId, notes,
    } = req.body;

    if (category) {
      const validCategories = [
        'InventoryPurchase', 'PackagingSupplies', 'ShippingSupplies',
        'Appraisal', 'Repair', 'Cleaning', 'PhotographyEquipment',
        'MarketplaceSubscription', 'Advertising', 'Software', 'Mileage', 'Other',
      ];
      if (!validCategories.includes(category)) {
        res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
        return;
      }
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...(category !== undefined && { category }),
        ...(vendor !== undefined && { vendor }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(expenseDate !== undefined && { expenseDate: new Date(expenseDate) }),
        ...(paymentMethod !== undefined && { paymentMethod }),
        ...(inventoryItemId !== undefined && { inventoryItemId }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        inventoryItem: { select: { id: true, title: true, sku: true } },
      },
    });

    res.json({ expense });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// DELETE /api/expenses/:id — Hard delete
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    // Delete receipt file if exists
    if (existing.receiptFilename) {
      const filePath = path.join(uploadsDir, existing.receiptFilename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await prisma.expense.delete({ where: { id } });

    res.json({ message: 'Expense deleted' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

export default router;
