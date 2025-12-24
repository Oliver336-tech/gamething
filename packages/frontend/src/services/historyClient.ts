import { apiRequest } from './apiClient';
import type { LeaderboardEntry } from './matchmakingClient';

export const matchHistory = async (token?: string, page = 1, pageSize = 10) => {
  return apiRequest<{ results: any[]; page: number; pageSize: number }>(
    `/history?page=${page}&pageSize=${pageSize}`,
    { token },
  );
};

export const matchEvents = async (token?: string) => {
  return apiRequest<{ events: Array<{ matchId: string; status: string; note: string; timestamp: string }> }>(
    '/history/events',
    { token },
  );
};

export const leaderboard = async (scope: 'global' | 'friends', token?: string, page = 1, pageSize = 10) => {
  return apiRequest<{ leaderboard: LeaderboardEntry[] }>(
    `/history/leaderboard?scope=${scope}&page=${page}&pageSize=${pageSize}`,
    { token },
  );
};
