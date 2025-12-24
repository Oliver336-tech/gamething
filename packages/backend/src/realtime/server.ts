import { randomUUID } from 'crypto';
import { IncomingMessage, createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import { applyAction, createCombatState } from '@gamething/engine';
import type { Action, CombatState, Entity, RngSeed } from '@gamething/shared';

import type { MatchDescriptor, MatchmakingService } from '../services/matchmaking';

type ClientSession = {
  matchId: string;
  userId: string;
};

type MatchSession = {
  id: string;
  state: CombatState;
  clients: Map<WebSocket, ClientSession>;
  seed: RngSeed;
  createdAt: number;
};

type RealtimeMessage =
  | { type: 'join'; matchId: string; userId: string }
  | { type: 'action'; matchId: string; action: Action }
  | { type: 'sync-request'; matchId: string };

export class RealtimeGameServer {
  private readonly wss: WebSocketServer;
  private readonly sessions = new Map<string, MatchSession>();

  constructor(server: Server, private matchmaking: MatchmakingService) {
    this.wss = new WebSocketServer({ server });
    this.registerHandlers();
    this.createSandboxSession();
  }

  private registerHandlers() {
    this.wss.on('connection', (socket, req) => this.handleConnection(socket, req));
    this.matchmaking.on('match-created', (match: MatchDescriptor) => this.bootstrapMatch(match));
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const initialMatch = url.searchParams.get('matchId');
    const initialUser = url.searchParams.get('userId') ?? `guest-${randomUUID()}`;
    if (initialMatch) {
      this.joinSession(socket, initialMatch, initialUser);
    }

    socket.on('message', (data) => this.handleMessage(socket, data.toString()));
    socket.on('close', () => this.handleClose(socket));
  }

  private handleMessage(socket: WebSocket, raw: string) {
    let payload: RealtimeMessage | undefined;
    try {
      payload = JSON.parse(raw) as RealtimeMessage;
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid payload' }));
      return;
    }

    switch (payload.type) {
      case 'join':
        this.joinSession(socket, payload.matchId, payload.userId);
        break;
      case 'action':
        this.resolveAction(socket, payload.matchId, payload.action);
        break;
      case 'sync-request':
        this.syncSession(socket, payload.matchId);
        break;
      default:
        socket.send(JSON.stringify({ type: 'error', message: 'Unsupported message' }));
    }
  }

  private handleClose(socket: WebSocket) {
    for (const session of this.sessions.values()) {
      if (session.clients.has(socket)) {
        session.clients.delete(socket);
      }
    }
  }

  private joinSession(socket: WebSocket, matchId: string, userId: string) {
    const session = this.sessions.get(matchId);
    if (!session) {
      socket.send(JSON.stringify({ type: 'error', message: 'match-not-found' }));
      return;
    }
    session.clients.set(socket, { matchId, userId });
    socket.send(JSON.stringify({ type: 'state', payload: session.state, matchId }));
  }

  private syncSession(socket: WebSocket, matchId: string) {
    const session = this.sessions.get(matchId);
    if (session) {
      socket.send(JSON.stringify({ type: 'state', payload: session.state, matchId }));
    }
  }

  private resolveAction(socket: WebSocket, matchId: string, action: Action) {
    const session = this.sessions.get(matchId);
    if (!session) {
      socket.send(JSON.stringify({ type: 'error', message: 'match-not-found' }));
      return;
    }
    const client = session.clients.get(socket);
    if (!client) {
      socket.send(JSON.stringify({ type: 'error', message: 'unauthorized' }));
      return;
    }
    const allowedActors = new Set([client.userId, `player-${client.userId}`]);
    if (!allowedActors.has(action.actorId)) {
      socket.send(JSON.stringify({ type: 'error', message: 'unauthorized-actor' }));
      return;
    }
    const actor = session.state.entities[action.actorId];
    if (!actor) {
      socket.send(JSON.stringify({ type: 'error', message: 'unknown-actor' }));
      return;
    }
    const expectedActor = session.state.initiative.order[session.state.initiative.currentIndex];
    if (expectedActor !== action.actorId) {
      socket.send(JSON.stringify({ type: 'error', message: 'not-your-turn' }));
      return;
    }

    const resolution = applyAction(session.state, action);
    session.state = resolution.newState;
    this.broadcast(session, { type: 'state', payload: session.state, matchId });
  }

  private broadcast(session: MatchSession, payload: unknown) {
    const message = JSON.stringify(payload);
    session.clients.forEach((_client, socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    });
  }

  private bootstrapMatch(match: MatchDescriptor) {
    const entities: Entity[] = match.players.map((player, index) => ({
      id: `player-${player.userId}`,
      name: `Player ${index + 1}`,
      isPlayerControlled: true,
      stats: { health: 30, attack: 8, defense: 3, speed: 6 },
    }));
    const seed: RngSeed = { seed: Date.now() % 10000 };
    const state = createCombatState(entities, seed, 'pvp');
    const session: MatchSession = {
      id: match.id,
      state,
      clients: new Map(),
      seed,
      createdAt: Date.now(),
    };
    this.sessions.set(match.id, session);
  }

  private createSandboxSession() {
    const seed: RngSeed = { seed: 1337 };
    const entities: Entity[] = [
      {
        id: 'player-sandbox',
        name: 'Hero',
        isPlayerControlled: true,
        stats: { health: 30, attack: 8, defense: 3, speed: 6 },
      },
      {
        id: 'enemy-sandbox',
        name: 'Goblin',
        isPlayerControlled: false,
        stats: { health: 18, attack: 5, defense: 2, speed: 4 },
      },
    ];
    const state = createCombatState(entities, seed, 'sandbox');
    this.sessions.set('sandbox', {
      id: 'sandbox',
      clients: new Map(),
      state,
      seed,
      createdAt: Date.now(),
    });
  }
}

export const createRealtimeServer = (port: number, matchmaking: MatchmakingService) => {
  const server = createServer();
  const realtime = new RealtimeGameServer(server, matchmaking);
  server.listen(port);
  return { server, realtime };
};
