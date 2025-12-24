export type EntityId = string;

export type Stats = {
  health: number;
  attack: number;
  defense: number;
  speed: number;
};

export type Entity = {
  id: EntityId;
  name: string;
  stats: Stats;
  isPlayerControlled: boolean;
};

export type ActionType = 'attack' | 'defend' | 'wait' | 'ability';

export type ActionTarget = {
  actorId: EntityId;
  targetId?: EntityId;
};

export type Action = ActionTarget & {
  type: ActionType;
  metadata?: Record<string, unknown>;
};

export type InitiativeTrack = {
  order: EntityId[];
  currentIndex: number;
};

export type CombatLogEntry = {
  round: number;
  actorId: EntityId;
  targetId?: EntityId;
  action: ActionType;
  delta: number;
  description: string;
};

export type CombatState = {
  round: number;
  entities: Record<EntityId, Entity>;
  initiative: InitiativeTrack;
  log: CombatLogEntry[];
  rng: RngState;
};

export type RngSeed = {
  seed: number;
  modulus?: number;
  multiplier?: number;
  increment?: number;
};

export type RngState = RngSeed & {
  last: number;
};

export type SimulationConfig = {
  maxRounds: number;
};

export type SimulationResult = {
  state: CombatState;
  completed: boolean;
};

export type ActionResolution = {
  newState: CombatState;
  logEntry?: CombatLogEntry;
};
