import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/auth.js';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Role hierarchy: Owner > Manager > ListingAssistant / FulfillmentAssistant > ReadOnly
const roleLevels: Record<string, number> = {
  Owner: 4,
  Manager: 3,
  ListingAssistant: 2,
  FulfillmentAssistant: 2,
  ReadOnly: 1,
};

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userRole = req.user.role;
    const userLevel = roleLevels[userRole] || 0;

    // Check if user has any of the required roles or a higher role level
    const hasPermission = roles.some((role) => {
      const requiredLevel = roleLevels[role] || 0;
      return userLevel >= requiredLevel;
    });

    if (!hasPermission) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

// Middleware that allows read-only access for GET requests regardless of role
export function requireWriteForRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // ReadOnly can only do GET
    if (req.user.role === 'ReadOnly' && req.method !== 'GET') {
      res.status(403).json({ error: 'Read-only access — write operations require higher role' });
      return;
    }

    const userLevel = roleLevels[req.user.role] || 0;
    const hasPermission = roles.some((role) => {
      const requiredLevel = roleLevels[role] || 0;
      return userLevel >= requiredLevel;
    });

    if (!hasPermission) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
