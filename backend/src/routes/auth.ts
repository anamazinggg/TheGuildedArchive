import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'store';
}

async function uniqueOrganizationSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

// POST /api/auth/register — Create a new seller organization and owner membership
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, businessName } = req.body;

    if (!email || !password || !name || !businessName) {
      res.status(400).json({ error: 'Email, password, name, and business name are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      res.status(409).json({ error: 'Email already registered. Sign in instead, or ask an owner to add this account to another storefront.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const slug = await uniqueOrganizationSlug(businessName);

    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: businessName.trim(),
          slug,
          niche: 'antique-vintage-jewelry',
        },
      });

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name.trim(),
        },
      });

      const membership = await tx.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'Owner',
        },
      });

      return { organization, user, membership };
    });

    const token = signToken({
      userId: result.user.id,
      email: result.user.email,
      organizationId: result.organization.id,
      membershipId: result.membership.id,
      role: result.membership.role,
    });

    res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.membership.role,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
        niche: result.organization.niche,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login — Login to the requested organization or the first active membership
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, organizationId } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      include: {
        memberships: {
          where: { status: 'Active' },
          include: { organization: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const membership = organizationId
      ? user.memberships.find((entry) => entry.organizationId === organizationId)
      : user.memberships[0];

    if (!membership) {
      res.status(403).json({ error: 'No active storefront membership found' });
      return;
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      organizationId: membership.organizationId,
      membershipId: membership.id,
      role: membership.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: membership.role,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        niche: membership.organization.niche,
      },
      organizations: user.memberships.map((entry) => ({
        id: entry.organization.id,
        name: entry.organization.name,
        slug: entry.organization.slug,
        role: entry.role,
      })),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me — Get current user and active organization
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const membership = await prisma.organizationMembership.findUnique({
      where: { id: req.user!.membershipId },
      include: { user: true, organization: true },
    });

    if (!membership) {
      res.status(404).json({ error: 'Membership not found' });
      return;
    }

    res.json({
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
        createdAt: membership.user.createdAt,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        niche: membership.organization.niche,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

export default router;
