import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import env from '../config/env';
import { prisma } from '../db/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
  sessionId?: string;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization token' });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string; role: string; email: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.sub }, include: { role: true } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid user' });
    }

    req.user = { id: decoded.sub, role: user.role.name, email: user.email };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
