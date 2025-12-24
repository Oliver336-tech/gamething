import { Router } from 'express';

import { prisma } from '../db/client';
import { asyncHandler } from '../lib/asyncHandler';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import type { MatchmakingService } from '../services/matchmaking';

export const createHistoryRouter = (matchmaking: MatchmakingService) => {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const page = Number(req.query.page ?? 1);
      const take = Number(req.query.pageSize ?? 10);
      const skip = (page - 1) * take;
      const matches = await prisma.match.findMany({
        where: { participantId: req.user.id },
        skip,
        take,
        orderBy: { startedAt: 'desc' },
        include: { winner: true },
      });
      return res.json({
        page,
        pageSize: take,
        results: matches.map((match: any) => ({
          id: match.id,
          status: match.status,
          startedAt: match.startedAt,
          endedAt: match.endedAt,
          winnerId: match.winnerId,
          winnerEmail: match.winner?.email,
        })),
      });
    }),
  );

  router.get(
    '/events',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const recentMatches = await prisma.match.findMany({
        where: { participantId: req.user.id },
        orderBy: { startedAt: 'desc' },
        take: 5,
      });
      const events = recentMatches.map((match: any) => ({
        matchId: match.id,
        status: match.status,
        note: match.winnerId === req.user?.id ? 'Victory' : 'Battle recorded',
        timestamp: match.startedAt,
      }));
      return res.json({ events });
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
      return res.json({ leaderboard, scope, page, pageSize });
    }),
  );

  return router;
};

export default createHistoryRouter;
