// Listing template routes
import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/listings/templates — List templates (filterable by category)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const category = req.query.category as string;
    const where: Record<string, unknown> = {};

    if (category) {
      where.category = category;
    }

    const templates = await prisma.listingTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    res.json({ templates });
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// POST /api/listings/templates — Create template
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      category,
      titleTemplate,
      descriptionTemplate,
      tagsTemplate,
      shippingProfile,
      returnPolicy,
    } = req.body;

    if (!name || !category) {
      res.status(400).json({ error: 'Name and category are required' });
      return;
    }

    const validCategories = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Brooch', 'Watch', 'Other'];
    if (!validCategories.includes(category)) {
      res.status(400).json({
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      });
      return;
    }

    const template = await prisma.listingTemplate.create({
      data: {
        name,
        category,
        titleTemplate: titleTemplate || null,
        descriptionTemplate: descriptionTemplate || null,
        tagsTemplate: tagsTemplate || null,
        shippingProfile: shippingProfile || null,
        returnPolicy: returnPolicy || null,
      },
    });

    res.status(201).json({ template });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// PUT /api/listings/templates/:id — Update template
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.listingTemplate.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const {
      name, category, titleTemplate, descriptionTemplate,
      tagsTemplate, shippingProfile, returnPolicy,
    } = req.body;

    const template = await prisma.listingTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(titleTemplate !== undefined && { titleTemplate }),
        ...(descriptionTemplate !== undefined && { descriptionTemplate }),
        ...(tagsTemplate !== undefined && { tagsTemplate }),
        ...(shippingProfile !== undefined && { shippingProfile }),
        ...(returnPolicy !== undefined && { returnPolicy }),
      },
    });

    res.json({ template });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/listings/templates/:id — Delete template
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.listingTemplate.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    await prisma.listingTemplate.delete({ where: { id } });

    res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
