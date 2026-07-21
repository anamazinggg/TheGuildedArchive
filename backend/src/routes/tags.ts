import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireWriteForRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);
router.use(requireWriteForRole('ListingAssistant'));

// GET /api/tags — List all tags
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      include: {
        _count: { select: { inventoryItems: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ tags });
  } catch (error) {
    console.error('List tags error:', error);
    res.status(500).json({ error: 'Failed to list tags' });
  }
});

// POST /api/tags — Create tag
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Tag name is required' });
      return;
    }

    const existing = await prisma.tag.findUnique({ where: { name } });
    if (existing) {
      res.status(409).json({ error: 'A tag with this name already exists' });
      return;
    }

    const tag = await prisma.tag.create({
      data: { name, color: color || null },
    });

    res.status(201).json({ tag });
  } catch (error) {
    console.error('Create tag error:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// DELETE /api/tags/:id — Delete tag
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }

    await prisma.tag.delete({ where: { id } });
    res.json({ message: 'Tag deleted' });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

export default router;