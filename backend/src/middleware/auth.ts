import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthPayload } from '../types';
import { getJwtSecret } from '../config/jwtSecret';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  let decoded: AuthPayload;
  try {
    decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  // Read role and revenue access from the database on every request, so a
  // removed user or a changed role takes effect at once instead of when the
  // 24-hour token expires.
  try {
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: decoded.id },
      select: ['id', 'email', 'name', 'role', 'can_view_revenue'] as any,
    });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      can_view_revenue: !!(user as any).can_view_revenue,
    } as AuthPayload;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Authentication check failed' });
  }
};

export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
};
