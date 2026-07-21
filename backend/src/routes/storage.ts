import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireWriteForRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);
router.use(requireWriteForRole('ListingAssistant'));

// GET /api/storage — List locations
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const locations = await prisma.storageLocation.findMany({
      include: {
        _count: { select: { items: true, children: true } },
      },
      orderBy: [{ room: 'asc' }, { cabinet: 'asc' }, { shelf: 'asc' }],
    });
    res.json({ locations });
  } catch (error) {
    console.error('List storage locations error:', error);
    res.status(500).json({ error: 'Failed to list storage locations' });
  }
});

// GET /api/storage/:id — Get single location
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const location = await prisma.storageLocation.findUnique({
      where: { id },
      include: {
        _count: { select: { items: true, children: true } },
      },
    });

    if (!location) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }

    res.json({ location });
  } catch (error) {
    console.error('Get storage location error:', error);
    res.status(500).json({ error: 'Failed to get storage location' });
  }
});

// GET /api/storage/:id/items — List items at location
router.get('/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const location = await prisma.storageLocation.findUnique({ where: { id } });
    if (!location) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }

    const items = await prisma.inventoryItem.findMany({
      where: { storageLocationId: id, deletedAt: null },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        tags: { include: { tag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ items, count: items.length });
  } catch (error) {
    console.error('Get location items error:', error);
    res.status(500).json({ error: 'Failed to get location items' });
  }
});

// GET /api/storage/:id/qrcode — QR code for location
router.get('/:id/qrcode', async (req: AuthRequest, res: Response) => {
  try {
    const QRCode = await import('qrcode');
    const { id } = req.params;
    const location = await prisma.storageLocation.findUnique({ where: { id } });
    if (!location) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }

    const qrData = JSON.stringify({ type: 'storage', id: location.id, code: location.code });
    const pngBuffer = await QRCode.default.toBuffer(qrData, {
      type: 'png',
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr-${location.code}.png"`);
    res.send(pngBuffer);
  } catch (error) {
    console.error('Storage QR code error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// POST /api/storage — Create location
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, room, cabinet, shelf, drawer, tray, box, slot, parentId } = req.body;

    if (!code || !name) {
      res.status(400).json({ error: 'Code and name are required' });
      return;
    }

    const existing = await prisma.storageLocation.findUnique({ where: { code } });
    if (existing) {
      res.status(409).json({ error: 'A location with this code already exists' });
      return;
    }

    const location = await prisma.storageLocation.create({
      data: {
        code, name,
        room: room || null,
        cabinet: cabinet || null,
        shelf: shelf || null,
        drawer: drawer || null,
        tray: tray || null,
        box: box || null,
        slot: slot || null,
        parentId: parentId || null,
      },
    });

    res.status(201).json({ location });
  } catch (error) {
    console.error('Create storage location error:', error);
    res.status(500).json({ error: 'Failed to create storage location' });
  }
});

// PUT /api/storage/:id — Update location
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.storageLocation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }

    const { code, name, room, cabinet, shelf, drawer, tray, box, slot, parentId } = req.body;

    if (code && code !== existing.code) {
      const dup = await prisma.storageLocation.findUnique({ where: { code } });
      if (dup) {
        res.status(409).json({ error: 'A location with this code already exists' });
        return;
      }
    }

    const location = await prisma.storageLocation.update({
      where: { id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(room !== undefined && { room }),
        ...(cabinet !== undefined && { cabinet }),
        ...(shelf !== undefined && { shelf }),
        ...(drawer !== undefined && { drawer }),
        ...(tray !== undefined && { tray }),
        ...(box !== undefined && { box }),
        ...(slot !== undefined && { slot }),
        ...(parentId !== undefined && { parentId }),
      },
    });

    res.json({ location });
  } catch (error) {
    console.error('Update storage location error:', error);
    res.status(500).json({ error: 'Failed to update storage location' });
  }
});

// DELETE /api/storage/:id — Delete location
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.storageLocation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }

    const itemCount = await prisma.inventoryItem.count({ where: { storageLocationId: id } });
    if (itemCount > 0) {
      res.status(409).json({ error: `Cannot delete location: ${itemCount} item(s) are stored here` });
      return;
    }

    await prisma.storageLocation.delete({ where: { id } });
    res.json({ message: 'Location deleted' });
  } catch (error) {
    console.error('Delete storage location error:', error);
    res.status(500).json({ error: 'Failed to delete storage location' });
  }
});

export default router;
