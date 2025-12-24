import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import type { MatchmakingService } from '../services/matchmaking';
import type { ProgressionService } from '../services/progression';

const enqueueSchema = z.object({
  queue: z.enum(['public', 'ranked', 'private']).default('public'),
});

const inviteSchema = z.object({
  queue: z.enum(['public', 'ranked', 'private']).default('private'),
});

export const createMatchmakingRouter = (matchmaking: MatchmakingService, progression: ProgressionService) => {
  const router = Router();

  router.use(authenticate);

  router.post(
    '/enqueue',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const parsed = enqueueSchema.safeParse(req.body);
      if (!parsed.success || !req.user) {
        return res.status(400).json({ message: 'Invalid payload' });
      }
      const ticket = matchmaking.enqueue(req.user.id, parsed.data.queue);
      return res.status(202).json({ ticket });
    }),
  );

  router.get(
    '/queue',
    asyncHandler(async (_req, res) => {
      return res.json({ queues: matchmaking.getQueueSnapshot() });
    }),
  );

  router.get(
    '/tickets/:ticketId',
    asyncHandler(async (req, res) => {
      const ticket = matchmaking.getTicket(req.params.ticketId);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
      return res.json({ ticket });
    }),
  );

  router.post(
    '/invite',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const parsed = inviteSchema.safeParse(req.body);
      if (!parsed.success || !req.user) {
        return res.status(400).json({ message: 'Invalid payload' });
      }
      const invite = matchmaking.invite(req.user.id, parsed.data.queue);
      return res.status(201).json({ invite });
    }),
  );

  router.post(
    '/invite/:code/accept',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const ticket = matchmaking.acceptInvite(req.user.id, req.params.code);
      if (!ticket) {
        return res.status(404).json({ message: 'Invite not found' });
      }
      return res.status(200).json({ ticket });
    }),
  );

  router.get(
    '/leaderboard',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const scope = req.query.scope === 'friends' ? 'friends' : 'global';
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const leaderboard = await matchmaking.leaderboard(scope, req.user.id, page, pageSize);
      return res.json({ leaderboard, scope, page, pageSize, season: progression.getSeasonSnapshot() });
    }),
  );

  return router;
};

export default createMatchmakingRouter;
