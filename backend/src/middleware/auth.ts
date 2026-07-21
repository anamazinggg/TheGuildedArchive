import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/auth.js';
import prisma from '../lib/prisma.js';
import { runWithTenant } from '../lib/tenant-context.js';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    const membership = await prisma.organizationMembership.findUnique({
      where: { id: decoded.membershipId },
      include: { user: true },
    });

    if (
      !membership ||
      membership.status !== 'Active' ||
      membership.userId !== decoded.userId ||
      membership.organizationId !== decoded.organizationId
    ) {
      res.status(401).json({ error: 'Organization access is no longer active' });
      return;
    }

    req.user = {
      ...decoded,
      email: membership.user.email,
      role: membership.role,
    };

    runWithTenant(
      {
        organizationId: membership.organizationId,
        membershipId: membership.id,
        userId: membership.userId,
        role: membership.role,
      },
      next
    );
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const elevatedRoles = new Set(['Owner', 'Manager']);

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function requireWriteForRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      next();
      return;
    }

    if (req.user.role === 'ReadOnly') {
      res.status(403).json({ error: 'Read-only access — write operations require a staff role' });
      return;
    }

    if (!roles.includes(req.user.role) && !elevatedRoles.has(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
