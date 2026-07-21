import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
router.use(requireRole('Owner'));

const validRoles = ['Owner', 'Manager', 'ListingAssistant', 'FulfillmentAssistant', 'ReadOnly'];

// GET /api/users — List users in the active organization
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const memberships = await prisma.organizationMembership.findMany({
      where: {
        organizationId: req.user!.organizationId,
        status: 'Active',
      },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      users: memberships.map((membership) => ({
        id: membership.user.id,
        membershipId: membership.id,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
        createdAt: membership.user.createdAt,
        updatedAt: membership.user.updatedAt,
      })),
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// POST /api/users — Create a staff account or add an existing user to this organization
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !name || !role) {
      res.status(400).json({ error: 'Email, name, and role are required' });
      return;
    }

    if (!validRoles.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      if (!password || password.length < 8) {
        res.status(400).json({ error: 'A password of at least 8 characters is required for a new user' });
        return;
      }
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: await bcrypt.hash(password, 12),
          name: name.trim(),
        },
      });
    }

    const existingMembership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: req.user!.organizationId,
          userId: user.id,
        },
      },
    });

    if (existingMembership?.status === 'Active') {
      res.status(409).json({ error: 'This user already belongs to the storefront' });
      return;
    }

    const membership = existingMembership
      ? await prisma.organizationMembership.update({
          where: { id: existingMembership.id },
          data: { role, status: 'Active' },
        })
      : await prisma.organizationMembership.create({
          data: {
            organizationId: req.user!.organizationId,
            userId: user.id,
            role,
          },
        });

    await prisma.activityLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.userId,
        action: 'membership.create',
        entityType: 'OrganizationMembership',
        entityId: membership.id,
        details: JSON.stringify({ email: normalizedEmail, name: user.name, role }),
        ipAddress: req.ip || undefined,
      },
    });

    res.status(201).json({
      user: {
        id: user.id,
        membershipId: membership.id,
        email: user.email,
        name: user.name,
        role: membership.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id — Update a user's role in the active organization
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      return;
    }

    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: req.user!.organizationId,
          userId: req.params.id,
        },
      },
      include: { user: true },
    });

    if (!membership || membership.status !== 'Active') {
      res.status(404).json({ error: 'User not found in this storefront' });
      return;
    }

    if (membership.role === 'Owner' && role !== 'Owner') {
      const ownerCount = await prisma.organizationMembership.count({
        where: { role: 'Owner', status: 'Active' },
      });
      if (ownerCount <= 1) {
        res.status(400).json({ error: 'Every storefront must keep at least one active owner' });
        return;
      }
    }

    const updated = await prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { role },
    });

    await prisma.activityLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.userId,
        action: 'membership.update',
        entityType: 'OrganizationMembership',
        entityId: membership.id,
        details: JSON.stringify({ oldRole: membership.role, newRole: role }),
        ipAddress: req.ip || undefined,
      },
    });

    res.json({
      user: {
        id: membership.user.id,
        membershipId: updated.id,
        email: membership.user.email,
        name: membership.user.name,
        role: updated.role,
        createdAt: membership.user.createdAt,
        updatedAt: membership.user.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id — Remove the user's membership from the active organization
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot remove your own storefront access' });
      return;
    }

    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: req.user!.organizationId,
          userId: req.params.id,
        },
      },
      include: { user: true },
    });

    if (!membership || membership.status !== 'Active') {
      res.status(404).json({ error: 'User not found in this storefront' });
      return;
    }

    if (membership.role === 'Owner') {
      const ownerCount = await prisma.organizationMembership.count({
        where: { role: 'Owner', status: 'Active' },
      });
      if (ownerCount <= 1) {
        res.status(400).json({ error: 'Every storefront must keep at least one active owner' });
        return;
      }
    }

    await prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { status: 'Removed' },
    });

    await prisma.activityLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.userId,
        action: 'membership.remove',
        entityType: 'OrganizationMembership',
        entityId: membership.id,
        details: JSON.stringify({ email: membership.user.email, name: membership.user.name, role: membership.role }),
        ipAddress: req.ip || undefined,
      },
    });

    res.json({ message: 'User access removed' });
  } catch (error) {
    console.error('Remove user error:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

export default router;
