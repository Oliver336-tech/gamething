import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import type { Action, CombatState } from '@gamething/shared';
import {
  acceptInvite,
  enqueue,
  getTicket,
  leaderboard as leaderboardApi,
  type LeaderboardEntry,
  type MatchTicket,
  type QueueKind,
} from './services/matchmakingClient';
import {
  acceptFriendRequest,
  listFriends,
  presence as presenceApi,
  removeFriend as removeFriendApi,
  sendFriendRequest,
} from './services/friendsClient';
import { matchEvents, matchHistory } from './services/historyClient';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type CombatStore = {
  state: CombatState | null;
  connectionStatus: ConnectionStatus;
  connect: (url: string, userId?: string, matchId?: string) => void;
  sendAction: (action: Action) => void;
  matchId?: string;
  userId?: string;
};

type LobbyStore = {
  queue: QueueKind;
  ticket?: MatchTicket;
  leaderboard: LeaderboardEntry[];
  activeMatchId?: string;
  error?: string;
  setQueue: (queue: QueueKind) => void;
  joinQueue: (queue?: QueueKind, token?: string) => Promise<void>;
  pollTicket: (token?: string) => Promise<void>;
  acceptInvite: (code: string, token?: string) => Promise<void>;
  fetchLeaderboard: (scope?: 'global' | 'friends', token?: string) => Promise<void>;
};

type SocialStore = {
  friends: Array<{ id: string; status: string; requester: any; addressee: any }>;
  presence: Array<{ userId: string; email: string; online: boolean }>;
  events: Array<{ matchId: string; status: string; note: string; timestamp: string }>;
  error?: string;
  refreshFriends: (token?: string) => Promise<void>;
  refreshPresence: (token?: string) => Promise<void>;
  sendRequest: (email: string, token?: string) => Promise<void>;
  acceptRequest: (id: string, token?: string) => Promise<void>;
  removeFriend: (id: string, token?: string) => Promise<void>;
  refreshEvents: (token?: string) => Promise<void>;
};

let socket: WebSocket | null = null;

export const useCombatStore = create<CombatStore>((set) => ({
  state: null,
  connectionStatus: 'disconnected',
  connect: (url: string, userId = 'guest', matchId = 'sandbox') => {
    set({ connectionStatus: 'connecting', matchId, userId });
    socket?.close();
    socket = new WebSocket(`${url}?matchId=${matchId}&userId=${userId}`);

    socket.onopen = () => {
      socket?.send(JSON.stringify({ type: 'join', matchId, userId }));
      set({ connectionStatus: 'connected' });
    };
    socket.onclose = () => set({ connectionStatus: 'disconnected' });
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'state') {
          set({ state: payload.payload as CombatState, matchId: payload.matchId ?? matchId });
        }
      } catch (error) {
        console.error('Failed to parse message', error);
      }
    };
  },
  sendAction: (action: Action) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action }));
    }
  },
}));

export const useLobbyStore = create<LobbyStore>((set, get) => ({
  queue: 'public',
  leaderboard: [],
  setQueue: (queue) => set({ queue }),
  joinQueue: async (queue = get().queue, token?: string) => {
    try {
      const { ticket } = await enqueue(queue, token);
      set({ ticket, queue, error: undefined });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },
  pollTicket: async (token?: string) => {
    const ticketId = get().ticket?.id;
    if (!ticketId) return;
    try {
      const { ticket } = await getTicket(ticketId, token);
      set({ ticket, activeMatchId: ticket.matchId });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },
  acceptInvite: async (code: string, token?: string) => {
    try {
      const { ticket } = await acceptInvite(code, token);
      set({ ticket, error: undefined });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },
  fetchLeaderboard: async (scope: 'global' | 'friends' = 'global', token?: string) => {
    const { leaderboard } = await leaderboardApi(scope, token);
    set({ leaderboard });
  },
}));

export const useSocialStore = create<SocialStore>((set) => ({
  friends: [],
  presence: [],
  events: [],
  refreshFriends: async (token?: string) => {
    const { friendships } = await listFriends(token);
    set({ friends: friendships });
  },
  refreshPresence: async (token?: string) => {
    const { presence } = await presenceApi(token);
    set({ presence });
  },
  sendRequest: async (email: string, token?: string) => {
    await sendFriendRequest(email, token);
  },
  acceptRequest: async (id: string, token?: string) => {
    await acceptFriendRequest(id, token);
    const { friendships } = await listFriends(token);
    set({ friends: friendships });
  },
  removeFriend: async (id: string, token?: string) => {
    await removeFriendApi(id, token);
    const { friendships } = await listFriends(token);
    set({ friends: friendships });
  },
  refreshEvents: async (token?: string) => {
    const { events } = await matchEvents(token);
    set({ events });
  },
}));

export const useWebSocketConnection = (url: string, userId = 'guest', matchId = 'sandbox'): void => {
  const connectRef = useRef(useCombatStore.getState().connect);

  useEffect(() => {
    connectRef.current(url, userId, matchId);
  }, [url, userId, matchId]);
};
