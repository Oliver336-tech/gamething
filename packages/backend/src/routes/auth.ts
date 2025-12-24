import { randomUUID } from 'crypto';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import env from '../config/env';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { prisma, ensureRole } from '../db/client';

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const normalizeRole = (email: string) => {
  if (env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()) {
    return 'admin';
  }
  return 'user';
};

const signAccessToken = (userId: string, email: string, role: string) => {
  return jwt.sign({ sub: userId, email, role }, env.JWT_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
};

const signRefreshToken = (userId: string, sessionId: string) => {
  return jwt.sign({ sub: userId, type: 'refresh', sid: sessionId }, env.REFRESH_TOKEN_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
};

const createSession = async (userId: string, refreshToken: string, sessionId: string) => {
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
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
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid input', issues: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const roleName = normalizeRole(email);
    const role = await ensureRole(roleName);
    const passwordHash = await bcrypt.hash(password, 10);

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
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid input', issues: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
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
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid input', issues: parsed.error.flatten() });
    }

    const { refreshToken } = parsed.data;
    let decoded: { sub: string; type: string; sid?: string };
    try {
      decoded = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET) as { sub: string; type: string; sid?: string };
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    if (decoded.type !== 'refresh') {
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

    const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!matches) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub }, include: { role: true } });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const newRefreshToken = signRefreshToken(user.id, session.id);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: await bcrypt.hash(newRefreshToken, 10),
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
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid input', issues: parsed.error.flatten() });
    }

    const { refreshToken } = parsed.data;
    let decoded: { sid?: string };
    try {
      decoded = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET) as { sid?: string };
    } catch (error) {
      return res.status(200).json({ message: 'Logged out' });
    }

    if (decoded.sid) {
      const session = await prisma.session.findUnique({ where: { id: decoded.sid } });
      if (session) {
        const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
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
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { role: true } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ id: user.id, email: user.email, role: user.role.name });
  }),
);

export default router;
