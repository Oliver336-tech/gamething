import { randomUUID } from 'crypto';

import { Router } from 'express';

import env from '../config/env';
import { prisma, ensureRole } from '../db/client';
import { asyncHandler } from '../lib/asyncHandler';
import { hashPassword, signToken, verifyPassword, verifyToken } from '../lib/security';
import { validateCredentials, validateRefresh } from '../lib/validation';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const normalizeRole = (email: string) => {
  if (env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()) {
    return 'admin';
  }
  return 'user';
};

const signAccessToken = (userId: string, email: string, role: string) => {
  return signToken({ sub: userId, email, role }, env.JWT_SECRET, env.ACCESS_TOKEN_TTL_MINUTES * 60);
};

const signRefreshToken = (userId: string, sessionId: string) => {
  return signToken(
    { sub: userId, type: 'refresh', sid: sessionId },
    env.REFRESH_TOKEN_SECRET,
    env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  );
};

const createSession = async (userId: string, refreshToken: string, sessionId: string) => {
  const refreshTokenHash = await hashPassword(refreshToken);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  return prisma.session.create({
    data: {
      id: sessionId,
      userId,
      refreshTokenHash,
      expiresAt,
    },
  });
};

router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const parsed = validateCredentials(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.message });
    }

    const { email, password } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const roleName = normalizeRole(email);
    const role = await ensureRole(roleName);
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: { connect: { id: role.id } },
      },
      include: { role: true },
    });

    const sessionId = randomUUID();
    const refreshToken = signRefreshToken(user.id, sessionId);
    await createSession(user.id, refreshToken, sessionId);
    const accessToken = signAccessToken(user.id, user.email, user.role.name);

    return res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role.name },
    });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = validateCredentials(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.message });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const desiredRoleName = normalizeRole(email);
    if (user.role.name !== desiredRoleName) {
      const desiredRole = await ensureRole(desiredRoleName);
      await prisma.user.update({
        where: { id: user.id },
        data: { role: { connect: { id: desiredRole.id } } },
      });
      user.role = desiredRole;
    }

    const sessionId = randomUUID();
    const refreshToken = signRefreshToken(user.id, sessionId);
    await createSession(user.id, refreshToken, sessionId);
    const accessToken = signAccessToken(user.id, user.email, user.role.name);

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role.name },
    });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const parsed = validateRefresh(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.message });
    }

    const { refreshToken } = parsed.data;
    let decoded: { sub?: string; type?: string; sid?: string };
    try {
      decoded = verifyToken(refreshToken, env.REFRESH_TOKEN_SECRET) as {
        sub?: string;
        type?: string;
        sid?: string;
      };
    } catch {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    if (decoded.type !== 'refresh' || !decoded.sub) {
      return res.status(400).json({ message: 'Invalid token type' });
    }

    if (!decoded.sid) {
      return res.status(400).json({ message: 'Missing session identifier' });
    }

    const session = await prisma.session.findUnique({
      where: { id: decoded.sid },
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ message: 'Session expired' });
    }

    if (session.userId !== decoded.sub) {
      return res.status(401).json({ message: 'Session does not belong to user' });
    }

    const matches = await verifyPassword(refreshToken, session.refreshTokenHash);
    if (!matches) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { role: true },
    });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const newRefreshToken = signRefreshToken(user.id, session.id);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: await hashPassword(newRefreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    const accessToken = signAccessToken(user.id, user.email, user.role.name);
    return res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, email: user.email, role: user.role.name },
    });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const parsed = validateRefresh(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.message });
    }

    const { refreshToken } = parsed.data;
    let decoded: { sid?: string };
    try {
      decoded = verifyToken(refreshToken, env.REFRESH_TOKEN_SECRET) as { sid?: string };
    } catch {
      return res.status(200).json({ message: 'Logged out' });
    }

    if (decoded.sid) {
      const session = await prisma.session.findUnique({ where: { id: decoded.sid } });
      if (session) {
        const matches = await verifyPassword(refreshToken, session.refreshTokenHash);
        if (matches) {
          await prisma.session.delete({ where: { id: decoded.sid } });
        }
      }
    }

    return res.status(204).send();
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { role: true },
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ id: user.id, email: user.email, role: user.role.name });
  }),
);

export default router;
