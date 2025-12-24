import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../db/client';

const requestSchema = z.object({
  email: z.string().email(),
});

export const createFriendsRouter = () => {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [{ requesterId: req.user.id }, { addresseeId: req.user.id }],
        },
        include: { requester: true, addressee: true },
      });

      const formatted = friendships.map((friendship) => ({
        id: friendship.id,
        status: friendship.status,
        requester: { id: friendship.requesterId, email: friendship.requester.email },
        addressee: { id: friendship.addresseeId, email: friendship.addressee.email },
      }));
      return res.json({ friendships: formatted });
    }),
  );

  router.get(
    '/presence',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const now = new Date();
      const sessions = await prisma.session.findMany({
        where: { expiresAt: { gt: now } },
        include: { user: true },
      });
      const presence = sessions.map((session) => ({
        userId: session.userId,
        email: session.user.email,
        online: true,
      }));
      return res.json({ presence });
    }),
  );

  router.post(
    '/request',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success || !req.user) {
        return res.status(400).json({ message: 'Invalid payload' });
      }

      const target = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (!target) return res.status(404).json({ message: 'User not found' });
      if (target.id === req.user.id) return res.status(400).json({ message: 'Cannot friend yourself' });

      const existing = await prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: req.user.id, addresseeId: target.id },
            { requesterId: target.id, addresseeId: req.user.id },
          ],
        },
      });
      if (existing) {
        return res.status(409).json({ message: 'Friend request already exists' });
      }

      const friendship = await prisma.friendship.create({
        data: {
          requesterId: req.user.id,
          addresseeId: target.id,
          status: 'pending',
        },
      });

      return res.status(201).json({ friendship });
    }),
  );

  router.post(
    '/:id/accept',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const friendship = await prisma.friendship.findUnique({ where: { id: req.params.id } });
      if (!friendship) return res.status(404).json({ message: 'Friendship not found' });
      if (friendship.addresseeId !== req.user.id) return res.status(403).json({ message: 'Not allowed' });

      const updated = await prisma.friendship.update({
        where: { id: req.params.id },
        data: { status: 'accepted' },
      });
      return res.json({ friendship: updated });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const friendship = await prisma.friendship.findUnique({ where: { id: req.params.id } });
      if (!friendship) return res.status(404).json({ message: 'Friendship not found' });
      if (![friendship.requesterId, friendship.addresseeId].includes(req.user.id)) {
        return res.status(403).json({ message: 'Not allowed' });
      }
      await prisma.friendship.delete({ where: { id: req.params.id } });
      return res.status(204).send();
    }),
  );

  return router;
};

export default createFriendsRouter;
