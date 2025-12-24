export type EntityId = string;

export type Stats = {
  health: number;
  maxHealth?: number;
  attack: number;
  defense: number;
  speed: number;
};

export type StatusType =
  | 'Shield'
  | 'Burn'
  | 'Regen'
  | 'Vulnerable'
  | 'Haste'
  | 'Slow'
  | 'Bind'
  | 'Weaken'
  | 'Dodge'
  | 'Echo'
  | 'Afterglow';

export type StatusEffect = {
  type: StatusType;
  stacks: number;
  durationMs: number;
  potency?: number;
  sourceId?: EntityId;
};

export type ChargeMeter = {
  current: number;
  tier: number;
  tiers: number[];
  burstCost: number;
};

export type ComboState = {
  chain: string[];
  expiresAt: number;
  momentum: number;
};

export type BattleMode = 'pve' | 'pvp' | 'sandbox';

export type CharacterId =
  | 'sophia'
  | 'endrit'
  | 'grace'
  | 'nona'
  | 'grandma'
  | 'liya'
  | 'yohanna'
  | 'oliver_ascended';

export type Entity = {
  id: EntityId;
  name: string;
  stats: Stats;
  isPlayerControlled: boolean;
  characterId?: CharacterId;
  statuses?: StatusEffect[];
  ce?: ChargeMeter;
  combo?: ComboState;
  tags?: string[];
};

export type ActionType = 'attack' | 'defend' | 'wait' | 'ability' | 'charge' | 'burst';

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
  timeMs?: number;
  mode?: BattleMode;
};

export type RngSeed = {
  seed: number;
  modulus?: number;
  multiplier?: number;
  increment?: number;
};

export type RngState = Required<RngSeed> & {
  last: number;
};

export type SimulationConfig = {
  maxRounds: number;
  mode?: BattleMode;
  tickIntervalMs?: number;
  comboDecayMs?: number;
};

export type SimulationResult = {
  state: CombatState;
  completed: boolean;
};

export type ActionResolution = {
  newState: CombatState;
  logEntry?: CombatLogEntry;
};

export type SkillDefinition = {
  name: string;
  description: string;
  ceGain?: number;
  burstCost?: number;
  statusApplies?: StatusEffect[];
  bonusMultiplier?: number;
  healPercent?: number;
  targetAllies?: boolean;
  echoable?: boolean;
};

export type PassiveDefinition = {
  name: string;
  description: string;
  onAction?: 'attack' | 'ability' | 'burst' | 'defend';
  effect?: StatusEffect;
};

export type CharacterKit = {
  id: CharacterId;
  title: string;
  description: string;
  baseStats: Stats;
  passives: PassiveDefinition[];
  chargedSkill: SkillDefinition;
  burst: SkillDefinition;
};

export type Encounter = {
  id: string;
  name: string;
  biome: string;
  enemies: string[];
  boss?: string;
  recommendedPower: number;
};

export type WorldDefinition = {
  id: string;
  name: string;
  encounters: Encounter[];
};

export type GameModule = {
  id: 'boss_rush' | 'infinite_waves' | 'playground';
  name: string;
  description: string;
  encounters: Encounter[];
  scaling: 'fixed' | 'infinite';
  mode: BattleMode;
};
