import { apiRequest } from './apiClient';

export type QueueKind = 'public' | 'ranked' | 'private';

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

export const enqueue = async (queue: QueueKind, token?: string) => {
  return apiRequest<{ ticket: MatchTicket }>('/matchmaking/enqueue', { method: 'POST', token, body: { queue } });
};

export const invite = async (queue: QueueKind = 'private', token?: string) => {
  return apiRequest<{ invite: { code: string; ticketId: string } }>('/matchmaking/invite', {
    method: 'POST',
    body: { queue },
    token,
  });
};

export const acceptInvite = async (code: string, token?: string) => {
  return apiRequest<{ ticket: MatchTicket }>(`/matchmaking/invite/${code}/accept`, { method: 'POST', token });
};

export const getTicket = async (ticketId: string, token?: string) => {
  return apiRequest<{ ticket: MatchTicket }>(`/matchmaking/tickets/${ticketId}`, { token });
};

export const queueSnapshot = async () => {
  return apiRequest<{ queues: Record<QueueKind, number> }>('/matchmaking/queue');
};

export const leaderboard = async (
  scope: 'global' | 'friends',
  token?: string,
  page = 1,
  pageSize = 10,
) => {
  return apiRequest<{ leaderboard: LeaderboardEntry[] }>(
    `/matchmaking/leaderboard?scope=${scope}&page=${page}&pageSize=${pageSize}`,
    { token },
  );
};
