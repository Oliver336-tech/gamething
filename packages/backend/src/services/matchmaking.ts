import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import { prisma } from '../db/client';
import type { ProgressionService } from './progression';

export type QueueKind = 'public' | 'ranked' | 'private';

export type MatchPlayer = {
  userId: string;
  mmr: number;
};

export type MatchDescriptor = {
  id: string;
  players: MatchPlayer[];
  queue: QueueKind;
  ticketIds: string[];
};

export type MatchTicket = {
  id: string;
  userId: string;
  queue: QueueKind;
  status: 'queued' | 'matched' | 'expired';
  matchId?: string;
};

export type LeaderboardEntry = {
  userId: string;
  score: number;
  rank?: number | null;
  email?: string;
};

const DEFAULT_MMR = 1200;
const K_FACTOR = 32;

export class MatchmakingService extends EventEmitter {
  private readonly ratings = new Map<string, number>();
  private readonly queues: Record<QueueKind, MatchPlayer[]> = {
    public: [],
    ranked: [],
    private: [],
  };
  private readonly tickets = new Map<string, MatchTicket>();
  private readonly invites = new Map<
    string,
    { hostId: string; inviteeId?: string; queue: QueueKind; ticketId: string }
  >();

  constructor(private progression: ProgressionService) {
    super();
  }

  enqueue(userId: string, queue: QueueKind): MatchTicket {
    const ticket: MatchTicket = {
      id: randomUUID(),
      userId,
      queue,
      status: 'queued',
    };
    this.tickets.set(ticket.id, ticket);
    this.queues[queue].push({ userId, mmr: this.getRating(userId) });
    this.tryMatch(queue);
    return ticket;
  }

  invite(hostId: string, queue: QueueKind): { code: string; ticketId: string } {
    const ticket = this.enqueue(hostId, queue);
    const code = randomUUID();
    this.invites.set(code, { hostId, queue, ticketId: ticket.id });
    return { code, ticketId: ticket.id };
  }

  acceptInvite(inviteeId: string, code: string): MatchTicket | null {
    const invite = this.invites.get(code);
    if (!invite) {
      return null;
    }
    invite.inviteeId = inviteeId;
    this.invites.set(code, invite);
    const ticket = this.enqueue(inviteeId, invite.queue);
    this.tryMatch('private', invite);
    this.invites.delete(code);
    return ticket;
  }

  getTicket(ticketId: string): MatchTicket | undefined {
    return this.tickets.get(ticketId);
  }

  getQueueSnapshot() {
    return {
      public: this.queues.public.length,
      ranked: this.queues.ranked.length,
      private: this.queues.private.length,
    };
  }

  async recordResult(matchId: string, winnerId?: string) {
    const matchRecords = await prisma.match.findMany({ where: { id: { startsWith: `${matchId}-` } } });
    await prisma.match.updateMany({
      where: { id: { startsWith: `${matchId}-` } },
      data: { status: 'completed', winnerId },
    });
    if (winnerId) {
      await this.progression.addTrophies(winnerId, 25);
      this.bumpRatings(matchRecords.map((m) => m.participantId), winnerId);
    }
  }

  async leaderboard(scope: 'global' | 'friends', userId: string, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;
    if (scope === 'friends') {
      const friends = await prisma.friendship.findMany({
        where: {
          status: 'accepted',
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
      });
      const friendIds = friends.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
      const ids = [...new Set([userId, ...friendIds])];
      const entries = await prisma.leaderboardEntry.findMany({
        where: { userId: { in: ids } },
        skip,
        take: pageSize,
        orderBy: { score: 'desc' },
        include: { user: true },
      });
      return entries.map((entry) => ({
        userId: entry.userId,
        score: entry.score,
        rank: entry.rank,
        email: entry.user.email,
      }));
    }

    const entries = await prisma.leaderboardEntry.findMany({
      skip,
      take: pageSize,
      orderBy: { score: 'desc' },
      include: { user: true },
    });
    return entries.map((entry) => ({
      userId: entry.userId,
      score: entry.score,
      rank: entry.rank,
      email: entry.user.email,
    }));
  }

  private bumpRatings(playerIds: string[], winnerId: string) {
    const players = playerIds.map((id) => ({ id, mmr: this.getRating(id) }));
    const winner = players.find((p) => p.id === winnerId);
    if (!winner) return;

    for (const player of players) {
      const expected =
        1 / (1 + 10 ** ((winner.mmr - player.mmr) / 400));
      const score = player.id === winnerId ? 1 : 0;
      const next = Math.round(player.mmr + K_FACTOR * (score - expected));
      this.ratings.set(player.id, next);
    }
  }

  private async tryMatch(queue: QueueKind, invite?: { hostId: string; inviteeId?: string; ticketId: string; queue: QueueKind }) {
    const pool = this.queues[queue];
    if (queue === 'private' && invite?.inviteeId) {
      this.queues.private = this.queues.private.filter(
        (entry) => entry.userId !== invite.hostId && entry.userId !== invite.inviteeId,
      );
      const players: MatchPlayer[] = [
        { userId: invite.hostId, mmr: this.getRating(invite.hostId) },
        { userId: invite.inviteeId, mmr: this.getRating(invite.inviteeId) },
      ];
      this.createMatch(players, queue, [invite.ticketId, this.findTicketId(invite.inviteeId, queue)]);
      return;
    }

    while (pool.length >= 2) {
      const players = pool.splice(0, 2);
      const ticketIds = players.map((p) => this.findTicketId(p.userId, queue)).filter(Boolean) as string[];
      this.createMatch(players, queue, ticketIds);
    }
  }

  private findTicketId(userId: string, queue: QueueKind): string | undefined {
    const entry = Array.from(this.tickets.values()).find(
      (ticket) => ticket.userId === userId && ticket.queue === queue && ticket.status === 'queued',
    );
    return entry?.id;
  }

  private getRating(userId: string): number {
    return this.ratings.get(userId) ?? DEFAULT_MMR;
  }

  private async createMatch(players: MatchPlayer[], queue: QueueKind, ticketIds: string[]) {
    const matchId = randomUUID();
    for (const ticketId of ticketIds) {
      const ticket = this.tickets.get(ticketId);
      if (ticket) {
        ticket.status = 'matched';
        ticket.matchId = matchId;
        this.tickets.set(ticketId, ticket);
      }
    }

    await Promise.all(
      players.map((player) =>
        prisma.match.create({
          data: {
            id: `${matchId}-${player.userId}`,
            participantId: player.userId,
            status: 'matched',
          },
        }),
      ),
    );

    const descriptor: MatchDescriptor = { id: matchId, players, queue, ticketIds };
    this.emit('match-created', descriptor);
  }
}
