import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import prisma from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// All inventory routes require auth
router.use(authMiddleware);

// Multer setup for uploads
const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const photoUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
    }
  },
});

const csvUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

const docUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed'));
    }
  },
});

// ---- CRUD Routes ----

// GET /api/inventory — List items (paginated, filterable)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status as string;
    const category = req.query.category as string;
    const search = req.query.search as string;
    const tagId = req.query.tagId as string;
    const includeDeleted = req.query.includeDeleted === 'true';

    const where: Record<string, unknown> = {};

    if (!includeDeleted) {
      where.deletedAt = null;
    }

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { sku: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (tagId) {
      where.tags = {
        some: { tagId },
      };
    }

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        skip,
        take: limit,
        include: {
          photos: { orderBy: { sortOrder: 'asc' } },
          tags: { include: { tag: true } },
          storageLocation: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List inventory error:', error);
    res.status(500).json({ error: 'Failed to list inventory items' });
  }
});

// GET /api/inventory/export — Export CSV
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string;
    const category = req.query.category as string;
    const search = req.query.search as string;
    const sold = req.query.sold === 'true';

    const where: Record<string, unknown> = { deletedAt: null };

    if (sold) {
      where.status = { in: ['Sold', 'Shipped'] };
    } else if (status) {
      where.status = status;
    } else {
      where.status = { notIn: ['Sold', 'Shipped', 'Archived'] };
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { sku: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      include: {
        storageLocation: { select: { code: true, name: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const csvData = items.map((item) => ({
      SKU: item.sku,
      Title: item.title,
      Description: item.description,
      Category: item.category,
      Type: item.type,
      Status: item.status,
      Condition: item.condition,
      'Estimated Era': item.estimatedEra || '',
      Brand: item.brand || '',
      'Metal Type': item.metalType || '',
      'Metal Purity': item.metalPurity || '',
      'Gemstone Type': item.gemstoneType || '',
      'Gemstone Color': item.gemstoneColor || '',
      'Ring Size': item.ringSize || '',
      Dimensions: item.dimensions || '',
      Weight: item.weight || '',
      'Condition Notes': item.conditionNotes || '',
      'Purchase Source': item.purchaseSource || '',
      'Purchase Date': item.purchaseDate?.toISOString().split('T')[0] || '',
      'Purchase Cost': item.purchaseCost?.toString() || '',
      'Restoration Cost': item.restorationCost?.toString() || '',
      'Cleaning Cost': item.cleaningCost?.toString() || '',
      'Appraisal Cost': item.appraisalCost?.toString() || '',
      'Packaging Cost': item.packagingCost?.toString() || '',
      'Shipping Cost': item.shippingCost?.toString() || '',
      'Total Cost Basis': item.totalCostBasis?.toString() || '',
      'Asking Price': item.askingPrice?.toString() || '',
      'Min Acceptable Price': item.minAcceptablePrice?.toString() || '',
      'Storage Location': item.storageLocation?.code || '',
      Tags: item.tags.map((t) => t.tag.name).join('; '),
    }));

    const csv = stringify(csvData, { header: true });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export inventory' });
  }
});

// POST /api/inventory/import/preview — Preview CSV
router.post('/import/preview', csvUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'CSV file is required' });
      return;
    }

    const csvContent = fs.readFileSync(req.file.path, 'utf-8');
    let records: Record<string, string>[];

    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      res.status(400).json({ error: 'Invalid CSV format' });
      return;
    }

    if (records.length === 0) {
      res.status(400).json({ error: 'CSV file is empty' });
      return;
    }

    // Get column headers from CSV
    const columns = Object.keys(records[0]);

    // Preview first 10 rows
    const preview = records.slice(0, 10);

    // Cleanup uploaded file after processing
    fs.unlinkSync(req.file.path);

    res.json({
      columns,
      preview,
      totalRows: records.length,
      allRecords: records,
    });
  } catch (error) {
    console.error('Import preview error:', error);
    res.status(500).json({ error: 'Failed to preview CSV' });
  }
});

// POST /api/inventory/import/confirm — Confirm and import
router.post('/import/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const { records, mapping, skipDuplicates } = req.body as {
      records: Record<string, string>[];
      mapping: Record<string, string>;
      skipDuplicates?: boolean;
    };

    if (!records || !records.length) {
      res.status(400).json({ error: 'No records to import' });
      return;
    }

    if (!mapping || !Object.keys(mapping).length) {
      res.status(400).json({ error: 'Column mapping is required' });
      return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors: { row: number; message: string }[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        const mappedData: Record<string, unknown> = {};
        for (const [csvCol, dbField] of Object.entries(mapping)) {
          if (dbField && record[csvCol] !== undefined) {
            const val = record[csvCol].trim();
            if (val !== '') {
              mappedData[dbField] = val;
            }
          }
        }

        const sku = mappedData.sku as string;
        if (!sku) {
          errors.push({ row: i + 1, message: 'SKU is required (missing or unmapped)' });
          skipped++;
          continue;
        }

        // Check if item with this SKU already exists
        const existing = await prisma.inventoryItem.findUnique({ where: { sku } });

        if (existing) {
          if (skipDuplicates) {
            skipped++;
            continue;
          }
          // Update existing
          const updateData: Record<string, unknown> = {};
          if (mappedData.title) updateData.title = mappedData.title;
          if (mappedData.description) updateData.description = mappedData.description;
          if (mappedData.category) updateData.category = mappedData.category;
          if (mappedData.type) updateData.type = mappedData.type;
          if (mappedData.status) updateData.status = mappedData.status;
          if (mappedData.condition) updateData.condition = mappedData.condition;
          if (mappedData.estimatedEra) updateData.estimatedEra = mappedData.estimatedEra;
          if (mappedData.brand) updateData.brand = mappedData.brand;
          if (mappedData.metalType) updateData.metalType = mappedData.metalType;
          if (mappedData.metalPurity) updateData.metalPurity = mappedData.metalPurity;
          if (mappedData.gemstoneType) updateData.gemstoneType = mappedData.gemstoneType;
          if (mappedData.gemstoneColor) updateData.gemstoneColor = mappedData.gemstoneColor;
          if (mappedData.ringSize) updateData.ringSize = mappedData.ringSize;
          if (mappedData.dimensions) updateData.dimensions = mappedData.dimensions;
          if (mappedData.weight) updateData.weight = mappedData.weight;
          if (mappedData.conditionNotes) updateData.conditionNotes = mappedData.conditionNotes;
          if (mappedData.restorationHistory) updateData.restorationHistory = mappedData.restorationHistory;
          if (mappedData.authenticityNotes) updateData.authenticityNotes = mappedData.authenticityNotes;
          if (mappedData.purchaseSource) updateData.purchaseSource = mappedData.purchaseSource;
          if (mappedData.purchaseDate) updateData.purchaseDate = new Date(mappedData.purchaseDate as string);
          if (mappedData.purchaseCost) updateData.purchaseCost = parseFloat(mappedData.purchaseCost as string);
          if (mappedData.restorationCost !== undefined) updateData.restorationCost = parseFloat(mappedData.restorationCost as string);
          if (mappedData.cleaningCost !== undefined) updateData.cleaningCost = parseFloat(mappedData.cleaningCost as string);
          if (mappedData.appraisalCost !== undefined) updateData.appraisalCost = parseFloat(mappedData.appraisalCost as string);
          if (mappedData.packagingCost !== undefined) updateData.packagingCost = parseFloat(mappedData.packagingCost as string);
          if (mappedData.shippingCost !== undefined) updateData.shippingCost = parseFloat(mappedData.shippingCost as string);
          if (mappedData.askingPrice) updateData.askingPrice = parseFloat(mappedData.askingPrice as string);
          if (mappedData.minAcceptablePrice) updateData.minAcceptablePrice = parseFloat(mappedData.minAcceptablePrice as string);

          // Recalculate totalCostBasis
          const pc = (updateData.purchaseCost as number) ?? existing.purchaseCost ?? 0;
          const rc = (updateData.restorationCost as number) ?? existing.restorationCost ?? 0;
          const cc = (updateData.cleaningCost as number) ?? existing.cleaningCost ?? 0;
          const ac = (updateData.appraisalCost as number) ?? existing.appraisalCost ?? 0;
          const pkg = (updateData.packagingCost as number) ?? existing.packagingCost ?? 0;
          const sc = (updateData.shippingCost as number) ?? existing.shippingCost ?? 0;
          updateData.totalCostBasis = pc + rc + cc + ac + pkg + sc;

          await prisma.inventoryItem.update({
            where: { id: existing.id },
            data: updateData,
          });
          updated++;
        } else {
          // Create new
          const purchaseCost = mappedData.purchaseCost ? parseFloat(mappedData.purchaseCost as string) : 0;
          const restorationCost = mappedData.restorationCost !== undefined ? parseFloat(mappedData.restorationCost as string) : 0;
          const cleaningCost = mappedData.cleaningCost !== undefined ? parseFloat(mappedData.cleaningCost as string) : 0;
          const appraisalCost = mappedData.appraisalCost !== undefined ? parseFloat(mappedData.appraisalCost as string) : 0;
          const packagingCost = mappedData.packagingCost !== undefined ? parseFloat(mappedData.packagingCost as string) : 0;
          const shippingCost = mappedData.shippingCost !== undefined ? parseFloat(mappedData.shippingCost as string) : 0;
          const totalCostBasis = purchaseCost + restorationCost + cleaningCost + appraisalCost + packagingCost + shippingCost;

          await prisma.inventoryItem.create({
            data: {
              sku,
              title: (mappedData.title as string) || sku,
              description: (mappedData.description as string) || '',
              category: (mappedData.category as string) || 'Other',
              type: (mappedData.type as string) || 'Unknown',
              estimatedEra: mappedData.estimatedEra as string,
              brand: mappedData.brand as string,
              metalType: mappedData.metalType as string,
              metalPurity: mappedData.metalPurity as string,
              gemstoneType: mappedData.gemstoneType as string,
              gemstoneColor: mappedData.gemstoneColor as string,
              ringSize: mappedData.ringSize as string,
              dimensions: mappedData.dimensions as string,
              weight: mappedData.weight as string,
              condition: (mappedData.condition as string) || 'Good',
              conditionNotes: mappedData.conditionNotes as string,
              restorationHistory: mappedData.restorationHistory as string,
              authenticityNotes: mappedData.authenticityNotes as string,
              purchaseSource: mappedData.purchaseSource as string,
              purchaseDate: mappedData.purchaseDate ? new Date(mappedData.purchaseDate as string) : undefined,
              purchaseCost,
              restorationCost,
              cleaningCost,
              appraisalCost,
              packagingCost,
              shippingCost,
              totalCostBasis,
              askingPrice: mappedData.askingPrice ? parseFloat(mappedData.askingPrice as string) : 0,
              minAcceptablePrice: mappedData.minAcceptablePrice ? parseFloat(mappedData.minAcceptablePrice as string) : 0,
              status: (mappedData.status as string) || 'Draft',
            },
          });
          created++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ row: i + 1, message: msg });
        skipped++;
      }
    }

    res.json({
      summary: { created, updated, skipped, errors: errors.length, total: records.length },
      errors: errors.slice(0, 20), // Return first 20 errors
    });
  } catch (error) {
    console.error('Import confirm error:', error);
    res.status(500).json({ error: 'Failed to import items' });
  }
});

// GET /api/inventory/:id — Get single item
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        documents: true,
        tags: { include: { tag: true } },
        storageLocation: true,
        marketplaceListings: true,
        orderItems: { include: { order: true } },
      },
    });

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json({ item });
  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({ error: 'Failed to get inventory item' });
  }
});

// POST /api/inventory — Create item
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      sku, title, description, category, type, estimatedEra, brand,
      metalType, metalPurity, gemstoneType, gemstoneColor, ringSize,
      dimensions, weight, condition, conditionNotes, restorationHistory,
      authenticityNotes, purchaseSource, purchaseDate, purchaseCost,
      restorationCost, cleaningCost, appraisalCost, packagingCost, shippingCost,
      askingPrice, minAcceptablePrice, currentMarketplacePrice,
      storageLocationId, status, tagIds,
    } = req.body;

    if (!sku || !title) {
      res.status(400).json({ error: 'SKU and title are required' });
      return;
    }

    const existing = await prisma.inventoryItem.findUnique({ where: { sku } });
    if (existing) {
      res.status(409).json({ error: 'An item with this SKU already exists' });
      return;
    }

    const totalCostBasis = (purchaseCost || 0) +
      (restorationCost || 0) + (cleaningCost || 0) +
      (appraisalCost || 0) + (packagingCost || 0) + (shippingCost || 0);

    const item = await prisma.inventoryItem.create({
      data: {
        sku, title, description: description || '',
        category: category || 'Other', type: type || 'Unknown',
        estimatedEra, brand, metalType, metalPurity, gemstoneType, gemstoneColor,
        ringSize, dimensions, weight, condition: condition || 'Good',
        conditionNotes, restorationHistory, authenticityNotes,
        purchaseSource,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        purchaseCost: purchaseCost || 0,
        restorationCost: restorationCost || 0,
        cleaningCost: cleaningCost || 0,
        appraisalCost: appraisalCost || 0,
        packagingCost: packagingCost || 0,
        shippingCost: shippingCost || 0,
        totalCostBasis,
        askingPrice: askingPrice || 0,
        minAcceptablePrice: minAcceptablePrice || 0,
        currentMarketplacePrice: currentMarketplacePrice || 0,
        storageLocationId,
        status: status || 'Draft',
        tags: tagIds?.length
          ? { create: tagIds.map((tagId: string) => ({ tagId })) }
          : undefined,
      },
      include: {
        photos: true,
        tags: { include: { tag: true } },
        storageLocation: true,
      },
    });

    res.status(201).json({ item });
  } catch (error) {
    console.error('Create inventory item error:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

// PUT /api/inventory/:id — Update item
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const {
      sku, title, description, category, type, estimatedEra, brand,
      metalType, metalPurity, gemstoneType, gemstoneColor, ringSize,
      dimensions, weight, condition, conditionNotes, restorationHistory,
      authenticityNotes, purchaseSource, purchaseDate, purchaseCost,
      restorationCost, cleaningCost, appraisalCost, packagingCost, shippingCost,
      askingPrice, minAcceptablePrice, currentMarketplacePrice,
      storageLocationId, status, tagIds,
    } = req.body;

    if (sku && sku !== existing.sku) {
      const dup = await prisma.inventoryItem.findUnique({ where: { sku } });
      if (dup) {
        res.status(409).json({ error: 'An item with this SKU already exists' });
        return;
      }
    }

    const totalCostBasis = (purchaseCost ?? existing.purchaseCost ?? 0) +
      (restorationCost ?? existing.restorationCost ?? 0) +
      (cleaningCost ?? existing.cleaningCost ?? 0) +
      (appraisalCost ?? existing.appraisalCost ?? 0) +
      (packagingCost ?? existing.packagingCost ?? 0) +
      (shippingCost ?? existing.shippingCost ?? 0);

    if (tagIds !== undefined) {
      await prisma.inventoryTag.deleteMany({ where: { inventoryItemId: id } });
      if (tagIds.length > 0) {
        await prisma.inventoryTag.createMany({
          data: tagIds.map((tagId: string) => ({ inventoryItemId: id, tagId })),
        });
      }
    }

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(sku !== undefined && { sku }),
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(type !== undefined && { type }),
        ...(estimatedEra !== undefined && { estimatedEra }),
        ...(brand !== undefined && { brand }),
        ...(metalType !== undefined && { metalType }),
        ...(metalPurity !== undefined && { metalPurity }),
        ...(gemstoneType !== undefined && { gemstoneType }),
        ...(gemstoneColor !== undefined && { gemstoneColor }),
        ...(ringSize !== undefined && { ringSize }),
        ...(dimensions !== undefined && { dimensions }),
        ...(weight !== undefined && { weight }),
        ...(condition !== undefined && { condition }),
        ...(conditionNotes !== undefined && { conditionNotes }),
        ...(restorationHistory !== undefined && { restorationHistory }),
        ...(authenticityNotes !== undefined && { authenticityNotes }),
        ...(purchaseSource !== undefined && { purchaseSource }),
        ...(purchaseDate !== undefined && { purchaseDate: new Date(purchaseDate) }),
        ...(purchaseCost !== undefined && { purchaseCost }),
        ...(restorationCost !== undefined && { restorationCost }),
        ...(cleaningCost !== undefined && { cleaningCost }),
        ...(appraisalCost !== undefined && { appraisalCost }),
        ...(packagingCost !== undefined && { packagingCost }),
        ...(shippingCost !== undefined && { shippingCost }),
        totalCostBasis,
        ...(askingPrice !== undefined && { askingPrice }),
        ...(minAcceptablePrice !== undefined && { minAcceptablePrice }),
        ...(currentMarketplacePrice !== undefined && { currentMarketplacePrice }),
        ...(storageLocationId !== undefined && { storageLocationId }),
        ...(status !== undefined && { status }),
      },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        documents: true,
        tags: { include: { tag: true } },
        storageLocation: true,
        marketplaceListings: true,
      },
    });

    res.json({ item });
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// DELETE /api/inventory/:id — Soft delete
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    await prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ message: 'Item deleted' });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// ---- Photo Routes ----

// POST /api/inventory/:id/photos — Upload photos
router.post('/:id/photos', photoUpload.array('photos', 10), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    // Check if this is the first photo — make it primary
    const existingPhotos = await prisma.inventoryPhoto.count({ where: { inventoryItemId: id } });

    // Get max sortOrder
    const maxSort = await prisma.inventoryPhoto.findFirst({
      where: { inventoryItemId: id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    let nextSort = (maxSort?.sortOrder ?? -1) + 1;

    const photos = await Promise.all(
      files.map((file, idx) =>
        prisma.inventoryPhoto.create({
          data: {
            inventoryItemId: id,
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            isPrimary: existingPhotos === 0 && idx === 0,
            sortOrder: nextSort + idx,
          },
        })
      )
    );

    res.status(201).json({ photos });
  } catch (error) {
    console.error('Upload photos error:', error);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

// DELETE /api/inventory/:id/photos/:photoId — Delete photo
router.delete('/:id/photos/:photoId', async (req: AuthRequest, res: Response) => {
  try {
    const { id, photoId } = req.params;

    const photo = await prisma.inventoryPhoto.findFirst({
      where: { id: photoId, inventoryItemId: id },
    });

    if (!photo) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    // Delete the file from disk
    const filePath = path.join(uploadsDir, photo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.inventoryPhoto.delete({ where: { id: photoId } });

    // If the deleted photo was primary, make the first remaining photo primary
    if (photo.isPrimary) {
      const nextPrimary = await prisma.inventoryPhoto.findFirst({
        where: { inventoryItemId: id },
        orderBy: { sortOrder: 'asc' },
      });
      if (nextPrimary) {
        await prisma.inventoryPhoto.update({
          where: { id: nextPrimary.id },
          data: { isPrimary: true },
        });
      }
    }

    res.json({ message: 'Photo deleted' });
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// PUT /api/inventory/:id/photos/:photoId/primary — Set primary photo
router.put('/:id/photos/:photoId/primary', async (req: AuthRequest, res: Response) => {
  try {
    const { id, photoId } = req.params;

    const photo = await prisma.inventoryPhoto.findFirst({
      where: { id: photoId, inventoryItemId: id },
    });

    if (!photo) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    // Un-set all primary photos for this item
    await prisma.inventoryPhoto.updateMany({
      where: { inventoryItemId: id, isPrimary: true },
      data: { isPrimary: false },
    });

    // Set this one as primary
    await prisma.inventoryPhoto.update({
      where: { id: photoId },
      data: { isPrimary: true },
    });

    res.json({ message: 'Primary photo updated' });
  } catch (error) {
    console.error('Set primary photo error:', error);
    res.status(500).json({ error: 'Failed to set primary photo' });
  }
});

// PUT /api/inventory/:id/photos/reorder — Reorder photos
router.put('/:id/photos/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { photoIds } = req.body as { photoIds: string[] };

    if (!photoIds || !Array.isArray(photoIds)) {
      res.status(400).json({ error: 'photoIds array is required' });
      return;
    }

    await Promise.all(
      photoIds.map((photoId, index) =>
        prisma.inventoryPhoto.updateMany({
          where: { id: photoId, inventoryItemId: id },
          data: { sortOrder: index },
        })
      )
    );

    res.json({ message: 'Photos reordered' });
  } catch (error) {
    console.error('Reorder photos error:', error);
    res.status(500).json({ error: 'Failed to reorder photos' });
  }
});

// ---- Document Routes ----

// POST /api/inventory/:id/documents — Upload documents
router.post('/:id/documents', docUpload.array('documents', 5), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const documents = await Promise.all(
      files.map((file) =>
        prisma.inventoryDocument.create({
          data: {
            inventoryItemId: id,
            filename: file.filename,
            originalName: file.originalname,
            documentType: file.mimetype === 'application/pdf' ? 'document' : 'image',
          },
        })
      )
    );

    res.status(201).json({ documents });
  } catch (error) {
    console.error('Upload documents error:', error);
    res.status(500).json({ error: 'Failed to upload documents' });
  }
});

// DELETE /api/inventory/:id/documents/:docId — Delete document
router.delete('/:id/documents/:docId', async (req: AuthRequest, res: Response) => {
  try {
    const { id, docId } = req.params;

    const doc = await prisma.inventoryDocument.findFirst({
      where: { id: docId, inventoryItemId: id },
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const filePath = path.join(uploadsDir, doc.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.inventoryDocument.delete({ where: { id: docId } });

    res.json({ message: 'Document deleted' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ---- QR Code Route ----

// GET /api/inventory/:id/qrcode — Get QR code for inventory item
router.get('/:id/qrcode', async (req: AuthRequest, res: Response) => {
  try {
    const QRCode = await import('qrcode');
    const { id } = req.params;
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const qrData = JSON.stringify({ type: 'inventory', id: item.id, sku: item.sku });
    const pngBuffer = await QRCode.default.toBuffer(qrData, {
      type: 'png',
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr-${item.sku}.png"`);
    res.send(pngBuffer);
  } catch (error) {
    console.error('QR code error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

export default router;
