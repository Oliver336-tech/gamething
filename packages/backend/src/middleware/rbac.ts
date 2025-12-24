import type { Response, NextFunction } from 'express';

import type { AuthenticatedRequest } from './auth';

export const requireRole =
  (allowedRoles: string | string[]) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const hasAccess = roles.includes(req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
  };
