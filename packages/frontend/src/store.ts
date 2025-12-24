import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import type {
  Action,
  ActionTarget,
  CombatLogEntry,
  CombatState,
  Entity,
  GameModule,
  RngState,
} from '@gamething/shared';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type TimelineEntry = {
  version: number;
  state: CombatState;
  source: 'server' | 'local';
  receivedAt: number;
};

type StoryNode = {
  id: string;
  title: string;
  description: string;
  status: 'locked' | 'in_progress' | 'completed';
  recommendedPower: number;
};

type Lobby = {
  id: string;
  name: string;
  type: 'co-op' | 'competitive';
  players: string[];
  status: 'forming' | 'ready' | 'in_match';
};

type LadderEntry = {
  rank: number;
  player: string;
  rating: number;
  streak: number;
};

type AdminExperiment = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

type BattleAction = ActionTarget & { type: Action['type']; label?: string; issuedAt: number };

type GameStore = {
  identity: {
    id: string;
    name: string;
    role: 'player' | 'admin';
    authenticated: boolean;
  };
  connectionStatus: ConnectionStatus;
  timeline: TimelineEntry[];
  playbackIndex: number | null;
  pendingActions: BattleAction[];
  lobbies: Lobby[];
  ladder: LadderEntry[];
  modules: GameModule[];
  storyNodes: StoryNode[];
  oliverUnlocked: boolean;
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
  };
  experiments: AdminExperiment[];
  selectedModuleId: GameModule['id'] | 'story';
  deterministicFrames: number;
  connect: (url: string) => void;
  applyServerState: (state: CombatState, version?: number) => void;
  sendAction: (action: Action) => void;
  enqueueAction: (action: BattleAction) => void;
  consumeAction: (action: BattleAction) => void;
  setPlaybackIndex: (index: number | null) => void;
  toggleExperiment: (id: string) => void;
  toggleAccessibility: (key: keyof GameStore['accessibility']) => void;
  advanceStory: (id: string) => void;
  selectModule: (id: GameModule['id'] | 'story') => void;
  unlockOliver: () => void;
  recordDeterministicFrame: (state: CombatState) => void;
  refreshLobbies: () => void;
};

const defaultRng: RngState = {
  seed: 42,
  last: 42,
  modulus: 2_147_483_647,
  multiplier: 48_271,
  increment: 0,
};

const createDeterministicValue = (rng: RngState): RngState => {
  const modulus = rng.modulus ?? defaultRng.modulus!;
  const multiplier = rng.multiplier ?? defaultRng.multiplier!;
  const increment = rng.increment ?? defaultRng.increment!;
  const last = (rng.last * multiplier + increment) % modulus;
  return { ...rng, last };
};

const applyDeterministicTick = (state: CombatState): CombatState => {
  const rng = createDeterministicValue(state.rng ?? defaultRng);
  const actorIndex = rng.last % state.initiative.order.length;
  const actorId = state.initiative.order[actorIndex];
  const actor = state.entities[actorId];
  const targets = Object.values(state.entities).filter((entity) => entity.id !== actorId);
  const target = targets[(rng.last + actor.stats.speed) % targets.length];
  const delta = Math.max(1, Math.round((actor.stats.attack / (target.stats.defense + 2)) * 5));
  const newLog: CombatLogEntry = {
    actorId,
    action: 'attack',
    targetId: target.id,
    delta: -delta,
    description: `${actor.name} strikes ${target.name}`,
    round: state.round,
  };
  const updatedEntities: Record<string, Entity> = {
    ...state.entities,
    [target.id]: {
      ...target,
      stats: {
        ...target.stats,
        health: Math.max(0, target.stats.health - delta),
      },
    },
  };

  return {
    ...state,
    rng,
    log: [...state.log.slice(-12), newLog],
    round: state.round + 1,
    entities: updatedEntities,
    timeMs: (state.timeMs ?? 0) + 750,
  };
};

const baseEntities: Record<string, Entity> = {
  player: {
    id: 'player',
    name: 'Nova',
    isPlayerControlled: true,
    characterId: 'sophia',
    stats: { health: 320, maxHealth: 320, attack: 40, defense: 18, speed: 12 },
    tags: ['starter'],
    statuses: [
      { type: 'Shield', durationMs: 6000, stacks: 1, sourceId: 'player' },
      { type: 'Haste', durationMs: 4000, stacks: 1 },
    ],
    ce: { current: 30, tier: 1, tiers: [20, 50, 80], burstCost: 100 },
    combo: { chain: ['A', 'B'], expiresAt: Date.now() + 5000, momentum: 25 },
  },
  ally: {
    id: 'ally',
    name: 'Eira',
    isPlayerControlled: true,
    characterId: 'endrit',
    stats: { health: 280, maxHealth: 280, attack: 35, defense: 20, speed: 14 },
    tags: ['support'],
    ce: { current: 55, tier: 2, tiers: [25, 50, 90], burstCost: 100 },
    combo: { chain: ['A', 'B', 'C'], expiresAt: Date.now() + 3000, momentum: 32 },
    statuses: [{ type: 'Regen', durationMs: 5000, stacks: 1 }],
  },
  enemy: {
    id: 'enemy',
    name: 'Iron Husk',
    isPlayerControlled: false,
    characterId: 'grandma',
    stats: { health: 360, maxHealth: 360, attack: 28, defense: 16, speed: 10 },
    statuses: [{ type: 'Burn', stacks: 2, durationMs: 4000 }],
  },
  boss: {
    id: 'boss',
    name: 'Gate Tyrant',
    isPlayerControlled: false,
    characterId: 'yohanna',
    stats: { health: 500, maxHealth: 500, attack: 48, defense: 24, speed: 8 },
    statuses: [{ type: 'Afterglow', stacks: 1, durationMs: 7000 }],
  },
};

const initialCombatState: CombatState = {
  round: 1,
  entities: baseEntities,
  initiative: {
    order: Object.keys(baseEntities),
    currentIndex: 0,
  },
  rng: defaultRng,
  log: [],
  mode: 'sandbox',
  timeMs: 0,
};

const serverModules: GameModule[] = [
  {
    id: 'boss_rush',
    name: 'Boss Rush',
    description: 'Consecutive raid bosses with no downtime.',
    encounters: [{ id: 'gatekeeper', name: 'Gatekeeper', biome: 'Citadel', enemies: ['Sentinel'] }],
    scaling: 'fixed',
    mode: 'pve',
  },
  {
    id: 'infinite_waves',
    name: 'Infinite Waves',
    description: 'Endless gauntlet with scaling rewards.',
    encounters: [
      { id: 'nightfall', name: 'Nightfall Depths', biome: 'Abyss', enemies: ['Wraith'] },
    ],
    scaling: 'infinite',
    mode: 'pve',
  },
  {
    id: 'playground',
    name: 'Playground',
    description: 'Sandbox to try kits and modifiers.',
    encounters: [{ id: 'sim', name: 'Simulation', biome: 'Holodeck', enemies: ['Echo'] }],
    scaling: 'fixed',
    mode: 'sandbox',
  },
];

const initialStoryNodes: StoryNode[] = [
  {
    id: 'prologue',
    title: 'Prologue: Awakening',
    description: 'Meet the crew and learn the charge system.',
    recommendedPower: 50,
    status: 'completed',
  },
  {
    id: 'city',
    title: 'City in Turmoil',
    description: 'Stabilize the barrier towers.',
    recommendedPower: 120,
    status: 'in_progress',
  },
  {
    id: 'citadel',
    title: 'Citadel Gates',
    description: 'Defend against the tyrant vanguard.',
    recommendedPower: 220,
    status: 'locked',
  },
  {
    id: 'finale',
    title: 'Finale: Break the Seal',
    description: 'Confront the tyrant and unlock Oliver Ascended.',
    recommendedPower: 300,
    status: 'locked',
  },
];

let socket: WebSocket | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  identity: { id: 'player-01', name: 'Nova', role: 'admin', authenticated: true },
  connectionStatus: 'disconnected',
  timeline: [{ version: 1, state: initialCombatState, source: 'local', receivedAt: Date.now() }],
  playbackIndex: null,
  pendingActions: [],
  lobbies: [
    {
      id: 'l1',
      name: 'Nightfall Squad',
      type: 'co-op',
      players: ['Nova', 'Eira'],
      status: 'forming',
    },
    { id: 'l2', name: 'Arena 3', type: 'competitive', players: ['Nova'], status: 'ready' },
  ],
  ladder: [
    { rank: 1, player: 'Kai', rating: 2410, streak: 8 },
    { rank: 2, player: 'Nova', rating: 2375, streak: 4 },
    { rank: 3, player: 'Rei', rating: 2200, streak: 2 },
  ],
  modules: serverModules,
  storyNodes: initialStoryNodes,
  oliverUnlocked: false,
  accessibility: { reducedMotion: false, highContrast: false },
  experiments: [
    {
      id: 'ce-echo',
      label: 'Echoed Charge Windows',
      description: 'Allow CE to overflow into echo casts for allies.',
      enabled: true,
    },
    {
      id: 'new-status',
      label: 'Experimental Status: Prism',
      description: 'Reflects 10% burst damage. Admin only.',
      enabled: false,
    },
  ],
  selectedModuleId: 'story',
  deterministicFrames: 0,
  connect: (url: string) => {
    set({ connectionStatus: 'connecting' });
    socket?.close();
    socket = new WebSocket(url);
    socket.onopen = () => set({ connectionStatus: 'connected' });
    socket.onclose = () => set({ connectionStatus: 'disconnected' });
    socket.onmessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;
        const payload: unknown = JSON.parse(raw);
        if (
          typeof payload === 'object' &&
          payload !== null &&
          'type' in payload &&
          (payload as { type?: unknown }).type === 'state'
        ) {
          const typedPayload = payload as { payload?: unknown; version?: number };
          if (typedPayload.payload && typeof typedPayload.version === 'number') {
            get().applyServerState(typedPayload.payload as CombatState, typedPayload.version);
          }
        }
      } catch (error) {
        console.error('Failed to parse message', error);
      }
    };
  },
  applyServerState: (state: CombatState, version?: number) => {
    const nextVersion =
      version ?? (get().timeline.length === 0 ? 1 : get().timeline.at(-1)!.version + 1);
    set((current) => ({
      timeline: [
        ...current.timeline,
        { version: nextVersion, state, source: 'server', receivedAt: Date.now() },
      ].slice(-50),
      playbackIndex: current.playbackIndex,
    }));
  },
  sendAction: (action: Action) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action }));
    }
    const queuedAction: BattleAction = { ...action, issuedAt: Date.now() };
    get().enqueueAction(queuedAction);
  },
  enqueueAction: (action: BattleAction) =>
    set((state) => ({ pendingActions: [...state.pendingActions, action].slice(-8) })),
  consumeAction: (action: BattleAction) =>
    set((state) => ({
      pendingActions: state.pendingActions.filter((item) => item.issuedAt !== action.issuedAt),
    })),
  setPlaybackIndex: (index: number | null) => set({ playbackIndex: index }),
  toggleExperiment: (id: string) =>
    set((state) => ({
      experiments: state.experiments.map((experiment) =>
        experiment.id === id ? { ...experiment, enabled: !experiment.enabled } : experiment,
      ),
    })),
  toggleAccessibility: (key) =>
    set((state) => ({
      accessibility: { ...state.accessibility, [key]: !state.accessibility[key] },
    })),
  advanceStory: (id: string) =>
    set((state) => {
      const completedNodes = state.storyNodes.map((node) =>
        node.id === id ? { ...node, status: 'completed' } : node,
      );
      const nextIndex = completedNodes.findIndex((node) => node.status === 'locked');
      if (nextIndex >= 0) {
        completedNodes[nextIndex] = { ...completedNodes[nextIndex], status: 'in_progress' };
      }
      return { storyNodes: completedNodes };
    }),
  selectModule: (id) => set({ selectedModuleId: id }),
  unlockOliver: () => set({ oliverUnlocked: true }),
  recordDeterministicFrame: (state) =>
    set((current) => ({
      deterministicFrames: current.deterministicFrames + 1,
      timeline: [
        ...current.timeline,
        {
          version: current.timeline.at(-1)?.version ? current.timeline.at(-1)!.version + 1 : 1,
          state,
          source: 'local',
          receivedAt: Date.now(),
        },
      ].slice(-50),
    })),
  refreshLobbies: () =>
    set((state) => ({
      lobbies: state.lobbies.map((lobby) =>
        lobby.status === 'forming' && lobby.players.length > 1
          ? { ...lobby, status: 'ready' }
          : lobby,
      ),
    })),
}));

export const useServerSynchronization = (url: string): void => {
  const connectRef = useRef(useGameStore.getState().connect);
  useEffect(() => {
    connectRef.current(url);
  }, [url]);
};

export const useDeterministicPlayback = (): void => {
  const lastFrameRef = useRef<number>();
  const storeRef = useRef(useGameStore.getState());

  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state) => (storeRef.current = state));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let frame = requestAnimationFrame(function loop(timestamp: number) {
      const store = storeRef.current;
      const activeTimeline = store.timeline;
      const latestState = (
        store.playbackIndex !== null ? activeTimeline[store.playbackIndex] : activeTimeline.at(-1)
      )?.state;
      if (!latestState) {
        frame = requestAnimationFrame(loop);
        return frame;
      }

      const shouldTick =
        !lastFrameRef.current ||
        timestamp - lastFrameRef.current > 900 ||
        store.connectionStatus === 'disconnected';
      if (shouldTick) {
        const nextState = applyDeterministicTick(latestState);
        storeRef.current.recordDeterministicFrame(nextState);
        lastFrameRef.current = timestamp;
      }

      frame = requestAnimationFrame(loop);
      return frame;
    });

    return () => cancelAnimationFrame(frame);
  }, []);
};
