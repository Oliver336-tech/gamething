import type {
  Action,
  ActionResolution,
  CombatState,
  Entity,
  InitiativeTrack,
  RngSeed,
  RngState,
  SimulationConfig,
  SimulationResult,
  StatusEffect,
  StatusType,
  CharacterKit,
  CharacterId,
  BattleMode,
  GameModule,
  WorldDefinition,
} from '@gamething/shared';

const DEFAULT_MODULUS = 2 ** 31 - 1;
const DEFAULT_MULTIPLIER = 48271;
const DEFAULT_INCREMENT = 0;
const MAX_CE = 100;
const CE_TIERS = [25, 50, 75, 100];
const DEFAULT_BURST_COST = 50;
const DEFAULT_TICK_INTERVAL = 1000;
const DEFAULT_COMBO_DECAY_MS = 4500;
const DEFAULT_MAX_ROUNDS = 12;
const MOMENTUM_PER_LINK = 0.05;
const MOMENTUM_CAP = 0.75;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const normalizeConfig = (config: SimulationConfig): Required<SimulationConfig> => ({
  maxRounds: config.maxRounds ?? DEFAULT_MAX_ROUNDS,
  tickIntervalMs: config.tickIntervalMs ?? DEFAULT_TICK_INTERVAL,
  comboDecayMs: config.comboDecayMs ?? DEFAULT_COMBO_DECAY_MS,
  mode: config.mode ?? 'pve',
});

const withHealthCap = (health: number, maxHealth?: number): number => {
  if (!maxHealth) return Math.max(health, 0);
  return clamp(health, 0, maxHealth);
};

export const createRngState = (seed: RngSeed): RngState => ({
  seed: seed.seed,
  modulus: seed.modulus ?? DEFAULT_MODULUS,
  multiplier: seed.multiplier ?? DEFAULT_MULTIPLIER,
  increment: seed.increment ?? DEFAULT_INCREMENT,
  last: seed.seed,
});

export const nextRandom = (rng: RngState): { state: RngState; value: number } => {
  const nextValue = (rng.multiplier * rng.last + rng.increment) % rng.modulus || rng.increment;
  const newState: RngState = { ...rng, last: nextValue };
  return { state: newState, value: nextValue / rng.modulus };
};

const statusDefaults: Record<StatusType, { maxStacks: number; basePotency: number }> = {
  Shield: { maxStacks: 5, basePotency: 5 },
  Burn: { maxStacks: 5, basePotency: 4 },
  Regen: { maxStacks: 5, basePotency: 4 },
  Vulnerable: { maxStacks: 4, basePotency: 0.2 },
  Haste: { maxStacks: 3, basePotency: 0.1 },
  Slow: { maxStacks: 3, basePotency: 0.1 },
  Bind: { maxStacks: 1, basePotency: 1 },
  Weaken: { maxStacks: 3, basePotency: 0.1 },
  Dodge: { maxStacks: 2, basePotency: 0.25 },
  Echo: { maxStacks: 1, basePotency: 0.5 },
  Afterglow: { maxStacks: 2, basePotency: 0.2 },
};

const normalizeStatus = (status: StatusEffect): StatusEffect => {
  const defaults = statusDefaults[status.type];
  const potency = status.potency ?? defaults.basePotency;
  const stacks = clamp(status.stacks, 1, defaults.maxStacks);
  return { ...status, stacks, potency };
};

const getStatusStacks = (entity: Entity, type: StatusType): number =>
  (entity.statuses ?? [])
    .filter((status) => status.type === type)
    .reduce<number>((acc, cur: StatusEffect) => acc + cur.stacks, 0);

const getStatusPotency = (entity: Entity, type: StatusType): number =>
  (entity.statuses ?? [])
    .filter((status) => status.type === type)
    .reduce<number>(
      (acc, cur: StatusEffect) =>
        acc + (cur.potency ?? statusDefaults[type].basePotency) * cur.stacks,
      0,
    );

const mergeStatuses = (existing: StatusEffect[], incoming: StatusEffect[]): StatusEffect[] => {
  const combined = [...existing];
  for (const status of incoming) {
    const normalized = normalizeStatus(status);
    const idx = combined.findIndex((current) => current.type === normalized.type);
    if (idx >= 0) {
      const mergedStacks = clamp(
        combined[idx].stacks + normalized.stacks,
        1,
        statusDefaults[normalized.type].maxStacks,
      );
      const durationMs = Math.max(combined[idx].durationMs, normalized.durationMs);
      const potency = normalized.potency ?? combined[idx].potency;
      combined[idx] = { ...combined[idx], stacks: mergedStacks, durationMs, potency };
    } else {
      combined.push(normalized);
    }
  }
  return combined;
};

const normalizeStats = (stats: Entity['stats']): Entity['stats'] => ({
  ...stats,
  maxHealth: stats.maxHealth ?? stats.health,
});

const normalizeEntity = (entity: Entity): Entity => ({
  ...entity,
  stats: normalizeStats(entity.stats),
  statuses: entity.statuses ?? [],
  ce: entity.ce ?? { current: 0, tier: 0, tiers: CE_TIERS, burstCost: DEFAULT_BURST_COST },
  combo: entity.combo ?? { chain: [], expiresAt: 0, momentum: 0 },
  tags: entity.tags ?? [],
});

const applyHasteSlow = (entity: Entity): number => {
  const haste = getStatusStacks(entity, 'Haste');
  const slow = getStatusStacks(entity, 'Slow');
  return 1 + (haste - slow) * statusDefaults.Haste.basePotency;
};

const effectiveSpeed = (entity: Entity): number =>
  Math.max(1, Math.round(entity.stats.speed * applyHasteSlow(entity)));

export const createInitiative = (entities: Entity[]): InitiativeTrack => {
  const sorted = [...entities]
    .map((entity) => normalizeEntity(entity))
    .sort((a, b) => effectiveSpeed(b) - effectiveSpeed(a));
  return { order: sorted.map((entity) => entity.id), currentIndex: 0 };
};

export const createCombatState = (
  entities: Entity[],
  rngSeed: RngSeed,
  mode: BattleMode = 'pve',
): CombatState => {
  const normalizedEntities = entities.map((entity) => normalizeEntity(entity));
  const initiative = createInitiative(normalizedEntities);
  const stateEntities = normalizedEntities.reduce<CombatState['entities']>((acc, entity) => {
    acc[entity.id] = entity;
    return acc;
  }, {});

  return {
    round: 1,
    entities: stateEntities,
    initiative,
    log: [],
    rng: createRngState(rngSeed),
    timeMs: 0,
    mode,
  };
};

const applyDamage = (entity: Entity, damage: number): Entity => ({
  ...entity,
  stats: {
    ...entity.stats,
    health: withHealthCap(entity.stats.health - damage, entity.stats.maxHealth),
  },
});

const describeAction = (action: Action, damage: number, note?: string): string => {
  switch (action.type) {
    case 'attack':
      return `Attack hits for ${damage}`;
    case 'defend':
      return 'Defend reduces incoming damage';
    case 'wait':
      return 'Waits for an opening';
    case 'ability':
      return `Ability used for ${damage} effect`;
    case 'charge':
      return 'Charges energy';
    case 'burst':
      return `Unleashes burst for ${damage}`;
    default:
      return note ?? 'Action resolved';
  }
};

const updateChargeMeter = (
  ce: NonNullable<Entity['ce']>,
  delta: number,
): NonNullable<Entity['ce']> => {
  const nextCurrent = clamp(ce.current + delta, 0, MAX_CE);
  const tier = ce.tiers.reduce<number>(
    (acc: number, threshold: number, index: number) => (nextCurrent >= threshold ? index + 1 : acc),
    0,
  );
  return { ...ce, current: nextCurrent, tier };
};

const updateCombo = (
  combo: NonNullable<Entity['combo']>,
  actionKey: string,
  now: number,
  decayMs: number,
): NonNullable<Entity['combo']> => {
  const isExpired = now > combo.expiresAt;
  const chain = isExpired ? [actionKey] : [...combo.chain, actionKey];
  const momentum = Math.min(chain.length * MOMENTUM_PER_LINK, MOMENTUM_CAP);
  return {
    chain,
    expiresAt: now + decayMs,
    momentum,
  };
};

const applyStatusTicks = (
  entity: Entity,
  deltaMs: number,
  rng: RngState,
  round: number,
): { entity: Entity; rng: RngState; logs: CombatState['log'] } => {
  const logs: CombatState['log'] = [];
  let currentRng = rng;
  let updatedEntity: Entity = { ...entity };
  let nextStatuses: StatusEffect[] = [];

  for (const status of entity.statuses ?? []) {
    const remaining = status.durationMs - deltaMs;
    const potency = status.potency ?? statusDefaults[status.type].basePotency;
    let delta = 0;
    if (status.type === 'Burn') {
      delta = -Math.round(potency * status.stacks);
    }
    if (status.type === 'Regen') {
      delta = Math.round(potency * status.stacks);
    }
    if (status.type === 'Echo') {
      const { state: rngState, value } = nextRandom(currentRng);
      currentRng = rngState;
      const echoDamage = Math.round((potency + status.stacks) * (0.5 + value));
      delta -= echoDamage;
      logs.push({
        round,
        actorId: entity.id,
        targetId: entity.tags?.find((tag) => tag.startsWith('echo-target:'))?.split(':')[1],
        action: 'ability',
        delta: -echoDamage,
        description: 'Echo reverberates',
      });
    }
    if (delta !== 0) {
      updatedEntity = applyDamage(updatedEntity, -delta);
      logs.push({
        round,
        actorId: entity.id,
        targetId: entity.id,
        action: 'wait',
        delta,
        description: `${status.type} tick`,
      });
    }
    if (remaining > 0) {
      nextStatuses.push({ ...status, durationMs: remaining });
    }
  }

  const afterglow = nextStatuses.find((effect) => effect.type === 'Afterglow');
  if (afterglow) {
    const bonusDuration = Math.round(
      deltaMs * (afterglow.potency ?? statusDefaults.Afterglow.basePotency),
    );
    nextStatuses = nextStatuses.map((effect) =>
      ['Shield', 'Regen', 'Haste', 'Dodge'].includes(effect.type)
        ? { ...effect, durationMs: effect.durationMs + bonusDuration }
        : effect,
    );
  }

  updatedEntity = { ...updatedEntity, statuses: nextStatuses };
  return { entity: updatedEntity, rng: currentRng, logs };
};

const applyDefenseAndStatuses = (
  target: Entity,
  damage: number,
  rng: RngState,
): { target: Entity; rng: RngState; finalDamage: number } => {
  let currentRng = rng;
  const shieldMitigation = getStatusPotency(target, 'Shield');
  const vulnerableMultiplier = 1 + getStatusPotency(target, 'Vulnerable');
  const dodgeChance = getStatusPotency(target, 'Dodge');
  let finalDamage = Math.max(0, Math.round(damage * vulnerableMultiplier - shieldMitigation));

  if (dodgeChance > 0) {
    const { state: rngState, value } = nextRandom(currentRng);
    currentRng = rngState;
    if (value < dodgeChance) {
      finalDamage = 0;
    }
  }

  const updatedTarget = applyDamage(target, finalDamage);
  return { target: updatedTarget, rng: currentRng, finalDamage };
};

const applyPassives = (actor: Entity, actionType: string): StatusEffect[] => {
  const kit = CHARACTER_KITS[actor.characterId as CharacterId];
  if (!kit) return [];
  return kit.passives
    .filter((passive) => !passive.onAction || passive.onAction === actionType)
    .flatMap((passive) => (passive.effect ? [passive.effect] : []));
};

const resolveSkill = (
  actor: Entity,
  action: Action,
  mode: BattleMode,
): {
  multiplier: number;
  ceGain: number;
  statuses: StatusEffect[];
  healPercent?: number;
  prevented?: boolean;
} => {
  const kit = CHARACTER_KITS[actor.characterId as CharacterId];
  const skillKey =
    (action.metadata?.skill as string) ??
    (action.type === 'burst' ? 'burst' : action.type === 'ability' ? 'charged' : 'basic');
  if (!kit) {
    return { multiplier: 1, ceGain: action.type === 'charge' ? 18 : 8, statuses: [] };
  }

  if (kit.id === 'oliver_ascended' && mode === 'pvp' && skillKey === 'burst') {
    return { multiplier: 0, ceGain: 0, statuses: [], prevented: true };
  }

  const skill = skillKey === 'burst' ? kit.burst : kit.chargedSkill;
  const multiplier = skill.bonusMultiplier ?? (skillKey === 'burst' ? 2 : 1.25);
  const ceGain = skill.ceGain ?? (skillKey === 'burst' ? -kit.burst.burstCost! : 12);
  const statuses = skill.statusApplies ?? [];
  return { multiplier, ceGain, statuses, healPercent: skill.healPercent };
};

const applyHealing = (entity: Entity, healPercent?: number): Entity => {
  if (!healPercent || !entity.stats.maxHealth) return entity;
  const amount = Math.round(entity.stats.maxHealth * healPercent);
  const nextHealth = withHealthCap(entity.stats.health + amount, entity.stats.maxHealth);
  return {
    ...entity,
    stats: { ...entity.stats, health: nextHealth },
  };
};

export const applyAction = (
  state: CombatState,
  action: Action,
  config: SimulationConfig = { maxRounds: DEFAULT_MAX_ROUNDS },
): ActionResolution => {
  const normalizedConfig = normalizeConfig(config);
  const actor = state.entities[action.actorId];
  const targetId = action.targetId ?? action.actorId;
  const target = state.entities[targetId];

  if (!actor || !target || actor.stats.health <= 0) {
    return { newState: state };
  }

  const actorBound = getStatusStacks(actor, 'Bind') > 0;
  const effectiveAction: Action =
    actorBound && action.type !== 'wait' ? { ...action, type: 'wait' } : action;

  const { state: updatedRng, value } = nextRandom(state.rng);
  const variance = 0.85 + value * 0.3;
  let rngState = updatedRng;

  const skillResult = resolveSkill(actor, effectiveAction, normalizedConfig.mode);
  if (skillResult.prevented) {
    const logEntry = {
      round: state.round,
      actorId: actor.id,
      targetId: target.id,
      action: effectiveAction.type,
      delta: 0,
      description: 'Skill prevented by PvP rules',
    };
    return {
      newState: { ...state, rng: rngState, log: [...state.log, logEntry] },
      logEntry,
    };
  }

  const passives = applyPassives(actor, effectiveAction.type);
  const incomingStatuses = mergeStatuses(skillResult.statuses, passives);

  const combo = updateCombo(
    actor.combo ?? { chain: [], expiresAt: 0, momentum: 0 },
    `${effectiveAction.type}:${action.metadata?.skill ?? 'basic'}`,
    state.timeMs ?? 0,
    normalizedConfig.comboDecayMs ?? DEFAULT_COMBO_DECAY_MS,
  );
  const requiresBurst = effectiveAction.type === 'burst';
  const burstCost = actor.ce?.burstCost ?? DEFAULT_BURST_COST;

  if (requiresBurst && (actor.ce?.current ?? 0) < burstCost) {
    const logEntry = {
      round: state.round,
      actorId: actor.id,
      targetId: target.id,
      action: effectiveAction.type,
      delta: 0,
      description: 'Burst failed (insufficient CE)',
    };
    return {
      newState: { ...state, rng: rngState, log: [...state.log, logEntry] },
      logEntry,
    };
  }

  const ceBase =
    effectiveAction.type === 'charge'
      ? 18
      : effectiveAction.type === 'wait' || effectiveAction.type === 'defend'
        ? 6
        : skillResult.ceGain;
  const ceGain = ceBase + Math.round(combo.momentum * 10);
  const updatedCharge = updateChargeMeter(actor.ce!, ceGain);

  const weakenedAttack =
    actor.stats.attack * (1 - getStatusPotency(actor, 'Weaken')) * (1 + combo.momentum);

  let baseDamage = 0;
  const isOffensive =
    effectiveAction.type === 'attack' ||
    effectiveAction.type === 'ability' ||
    effectiveAction.type === 'burst';
  if (isOffensive) {
    baseDamage = Math.max(
      0,
      Math.round(weakenedAttack * skillResult.multiplier * variance - target.stats.defense * 0.35),
    );
  }

  const attackDescriptionNote =
    effectiveAction.type === 'charge' ? 'Charges up momentum and CE' : undefined;

  let updatedTarget = target;
  let finalDamage = 0;

  if (baseDamage > 0) {
    const damageResult = applyDefenseAndStatuses(target, baseDamage, rngState);
    updatedTarget = damageResult.target;
    rngState = damageResult.rng;
    finalDamage = damageResult.finalDamage;
  }

  const healedActor = applyHealing(actor, skillResult.healPercent);
  const nextActorStatuses = mergeStatuses(healedActor.statuses ?? [], incomingStatuses);

  const nextEntities = {
    ...state.entities,
    [updatedTarget.id]: { ...updatedTarget },
    [actor.id]: { ...healedActor, ce: updatedCharge, combo, statuses: nextActorStatuses },
  };

  const logEntry = {
    round: state.round,
    actorId: actor.id,
    targetId: updatedTarget.id,
    action: effectiveAction.type,
    delta: -finalDamage,
    description: describeAction(effectiveAction, finalDamage, attackDescriptionNote),
  };

  return {
    newState: {
      ...state,
      entities: nextEntities,
      rng: rngState,
      log: [...state.log, logEntry],
    },
    logEntry,
  };
};

export const advanceTurn = (state: CombatState, config: SimulationConfig): CombatState => {
  const normalizedConfig = normalizeConfig(config);
  const nextIndex = (state.initiative.currentIndex + 1) % state.initiative.order.length;
  const completedRound = nextIndex === 0 ? state.round + 1 : state.round;
  const reOrdered = createInitiative(Object.values(state.entities));

  return {
    ...state,
    round: completedRound,
    initiative: {
      ...reOrdered,
      currentIndex: nextIndex,
    },
    mode: normalizedConfig.mode,
  };
};

const advanceTime = (
  state: CombatState,
  deltaMs: number,
): { state: CombatState; rng: RngState } => {
  let rngState = state.rng;
  let log = [...state.log];
  const updatedEntities = Object.values(state.entities).reduce<CombatState['entities']>(
    (acc, entity) => {
      const tickResult = applyStatusTicks(entity, deltaMs, rngState, state.round);
      rngState = tickResult.rng;
      log = [...log, ...tickResult.logs];
      acc[entity.id] = tickResult.entity;
      return acc;
    },
    {},
  );

  return {
    state: {
      ...state,
      entities: updatedEntities,
      rng: rngState,
      log,
      timeMs: (state.timeMs ?? 0) + deltaMs,
    },
    rng: rngState,
  };
};

export const simulateRound = (
  state: CombatState,
  actions: Action[],
  config: SimulationConfig,
): SimulationResult => {
  const normalizedConfig = normalizeConfig(config);
  let currentState: CombatState = { ...state, mode: normalizedConfig.mode };
  let completed = false;

  for (const action of actions) {
    const advanced = advanceTime(
      currentState,
      normalizedConfig.tickIntervalMs ?? DEFAULT_TICK_INTERVAL,
    );
    currentState = advanced.state;
    const resolution = applyAction(currentState, action, normalizedConfig);
    currentState = advanceTurn(resolution.newState, normalizedConfig);

    const entities = Object.values(currentState.entities) as Entity[];
    const actorsAlive = entities.some(
      (entity) => entity.stats.health > 0 && entity.isPlayerControlled,
    );
    const enemiesAlive = entities.some(
      (entity) => entity.stats.health > 0 && !entity.isPlayerControlled,
    );

    if (!actorsAlive || !enemiesAlive || currentState.round > normalizedConfig.maxRounds) {
      completed = true;
      break;
    }
  }

  return { state: currentState, completed };
};

const kit = (
  id: CharacterId,
  kitData: Partial<CharacterKit>,
  overrides: Partial<CharacterKit> = {},
): CharacterKit => ({
  id,
  title: kitData.title ?? 'Adventurer',
  description: kitData.description ?? '',
  baseStats: kitData.baseStats ?? { health: 100, attack: 10, defense: 5, speed: 10 },
  passives: kitData.passives ?? [],
  chargedSkill: kitData.chargedSkill ?? {
    name: 'Technique',
    description: 'Generic charged attack',
    ceGain: 14,
    bonusMultiplier: 1.3,
  },
  burst: kitData.burst ?? {
    name: 'Burst',
    description: 'Generic burst',
    bonusMultiplier: 2,
    ceGain: -DEFAULT_BURST_COST,
    burstCost: DEFAULT_BURST_COST,
  },
  ...overrides,
});

export const CHARACTER_KITS: Record<CharacterId, CharacterKit> = {
  sophia: kit('sophia', {
    title: 'Radiant Duelist',
    description: 'Focuses on regen and afterglow windows.',
    baseStats: { health: 120, maxHealth: 120, attack: 16, defense: 8, speed: 12 },
    passives: [
      {
        name: 'Glow Within',
        description: 'Gain Afterglow on ability use to extend buffs.',
        onAction: 'ability',
        effect: { type: 'Afterglow', durationMs: 5000, stacks: 1 },
      },
    ],
    chargedSkill: {
      name: 'Radiant Thrust',
      description: 'Heals lightly and applies Afterglow.',
      bonusMultiplier: 1.2,
      healPercent: 0.08,
      statusApplies: [{ type: 'Afterglow', durationMs: 6000, stacks: 1 }],
      ceGain: 14,
    },
    burst: {
      name: 'Sunrise Bloom',
      description: 'High damage burst that applies Regen to allies.',
      bonusMultiplier: 2.1,
      statusApplies: [{ type: 'Regen', durationMs: 6000, stacks: 2 }],
      burstCost: 45,
      ceGain: -45,
    },
  }),
  endrit: kit('endrit', {
    title: 'Flamecaller',
    description: 'Stacking burn specialist.',
    baseStats: { health: 110, maxHealth: 110, attack: 18, defense: 6, speed: 11 },
    passives: [
      {
        name: 'Kindled Fury',
        description: 'Basic actions add Burn.',
        onAction: 'attack',
        effect: { type: 'Burn', durationMs: 6000, stacks: 1 },
      },
    ],
    chargedSkill: {
      name: 'Pyroclast',
      description: 'Amplifies burn stacks.',
      statusApplies: [{ type: 'Burn', durationMs: 8000, stacks: 2, potency: 5 }],
      bonusMultiplier: 1.35,
    },
    burst: {
      name: 'Inferno Gate',
      description: 'Big burst plus Vulnerable.',
      statusApplies: [{ type: 'Vulnerable', durationMs: 5000, stacks: 1 }],
      bonusMultiplier: 2.3,
      burstCost: 50,
      ceGain: -50,
    },
  }),
  grace: kit('grace', {
    title: 'Bulwark Captain',
    description: 'Specializes in shielding allies.',
    baseStats: { health: 140, maxHealth: 140, attack: 12, defense: 12, speed: 9 },
    passives: [
      {
        name: 'Guard Formation',
        description: 'Applies Shield on defend.',
        onAction: 'defend',
        effect: { type: 'Shield', durationMs: 7000, stacks: 2, potency: 8 },
      },
    ],
    chargedSkill: {
      name: 'Bulwark Bash',
      description: 'Adds Shield and Weaken.',
      statusApplies: [
        { type: 'Shield', durationMs: 6000, stacks: 1, potency: 10 },
        { type: 'Weaken', durationMs: 5000, stacks: 1 },
      ],
      bonusMultiplier: 1.15,
    },
    burst: {
      name: 'Aegis Wall',
      description: 'Damage plus large shield.',
      statusApplies: [{ type: 'Shield', durationMs: 8000, stacks: 3, potency: 12 }],
      bonusMultiplier: 2,
      burstCost: 45,
      ceGain: -45,
    },
  }),
  nona: kit('nona', {
    title: 'Tempo Gambler',
    description: 'Lives on momentum and dodge.',
    baseStats: { health: 105, maxHealth: 105, attack: 17, defense: 7, speed: 14 },
    passives: [
      {
        name: 'Shadowstep',
        description: 'Gains Dodge when chaining combos.',
        onAction: 'attack',
        effect: { type: 'Dodge', durationMs: 4000, stacks: 1, potency: 0.2 },
      },
    ],
    chargedSkill: {
      name: 'Slipstrike',
      description: 'High momentum attack.',
      bonusMultiplier: 1.4,
      statusApplies: [{ type: 'Dodge', durationMs: 5000, stacks: 1 }],
    },
    burst: {
      name: 'Phantom Waltz',
      description: 'Echo-enabled spin.',
      bonusMultiplier: 1.9,
      statusApplies: [{ type: 'Echo', durationMs: 5000, stacks: 1, potency: 0.6 }],
      burstCost: 40,
      ceGain: -40,
    },
  }),
  grandma: kit('grandma', {
    title: 'Hearthkeeper',
    description: 'Sustains allies with Afterglow and Regen.',
    baseStats: { health: 150, maxHealth: 150, attack: 10, defense: 10, speed: 8 },
    passives: [
      {
        name: 'Comfort Food',
        description: 'Applies Regen on ability.',
        onAction: 'ability',
        effect: { type: 'Regen', durationMs: 6000, stacks: 1 },
      },
    ],
    chargedSkill: {
      name: 'Warm Hug',
      description: 'Heals and shields.',
      healPercent: 0.12,
      statusApplies: [{ type: 'Shield', durationMs: 6000, stacks: 1, potency: 7 }],
      bonusMultiplier: 1,
    },
    burst: {
      name: 'Story Time',
      description: 'Massive Regen and Afterglow.',
      bonusMultiplier: 1.3,
      statusApplies: [
        { type: 'Regen', durationMs: 8000, stacks: 2 },
        { type: 'Afterglow', durationMs: 8000, stacks: 1 },
      ],
      burstCost: 35,
      ceGain: -35,
    },
  }),
  liya: kit('liya', {
    title: 'Arc Binder',
    description: 'Locks enemies and exploits openings.',
    baseStats: { health: 115, maxHealth: 115, attack: 16, defense: 9, speed: 13 },
    passives: [
      {
        name: 'Snare',
        description: 'Bind targets hit by charged skills.',
        onAction: 'ability',
        effect: { type: 'Bind', durationMs: 4000, stacks: 1 },
      },
    ],
    chargedSkill: {
      name: 'Binding Arc',
      description: 'Applies Bind and Vulnerable.',
      statusApplies: [
        { type: 'Bind', durationMs: 5000, stacks: 1 },
        { type: 'Vulnerable', durationMs: 5000, stacks: 1 },
      ],
      bonusMultiplier: 1.25,
    },
    burst: {
      name: 'Stasis Field',
      description: 'Large Bind, small damage.',
      statusApplies: [{ type: 'Bind', durationMs: 7000, stacks: 1 }],
      bonusMultiplier: 1.6,
      burstCost: 45,
      ceGain: -45,
    },
  }),
  yohanna: kit('yohanna', {
    title: 'Resonant Oracle',
    description: 'Echoes actions and accelerates turns.',
    baseStats: { health: 108, maxHealth: 108, attack: 15, defense: 8, speed: 15 },
    passives: [
      {
        name: 'Resonance',
        description: 'Adds Echo after bursts.',
        onAction: 'burst',
        effect: { type: 'Echo', durationMs: 6000, stacks: 1 },
      },
    ],
    chargedSkill: {
      name: 'Chime',
      description: 'Fast attack with Haste.',
      statusApplies: [{ type: 'Haste', durationMs: 6000, stacks: 1 }],
      bonusMultiplier: 1.15,
    },
    burst: {
      name: 'Resonant Wave',
      description: 'Echo-enabled area pulse.',
      bonusMultiplier: 1.8,
      statusApplies: [{ type: 'Echo', durationMs: 6000, stacks: 1, potency: 0.6 }],
      burstCost: 45,
      ceGain: -45,
    },
  }),
  oliver_ascended: kit('oliver_ascended', {
    title: 'Ascended King',
    description: 'Power fantasy in PvE, limited in PvP.',
    baseStats: { health: 160, maxHealth: 160, attack: 22, defense: 12, speed: 11 },
    passives: [
      {
        name: 'Checkmate Warning',
        description: 'Burst disabled in PvP.',
        onAction: 'burst',
      },
    ],
    chargedSkill: {
      name: 'Royal Decree',
      description: 'Heavy strike that weakens foes.',
      statusApplies: [{ type: 'Weaken', durationMs: 6000, stacks: 1 }],
      bonusMultiplier: 1.45,
    },
    burst: {
      name: 'Checkmate',
      description: 'Devastating finisher (PvP disabled).',
      bonusMultiplier: 2.8,
      statusApplies: [{ type: 'Vulnerable', durationMs: 6000, stacks: 2 }],
      burstCost: 60,
      ceGain: -60,
    },
  }),
};

const makeEncounter = (
  id: string,
  name: string,
  biome: string,
  power: number,
  boss?: string,
): {
  id: string;
  name: string;
  biome: string;
  recommendedPower: number;
  boss?: string;
  enemies: string[];
} => ({
  id,
  name,
  biome,
  recommendedPower: power,
  boss,
  enemies: boss ? [boss] : [`${name} Minion A`, `${name} Minion B`],
});

export const WORLDS: WorldDefinition[] = Array.from({ length: 15 }).map((_, index) => {
  const worldIndex = index + 1;
  const encounters = [
    makeEncounter(`w${worldIndex}-1`, `Frontier ${worldIndex}-1`, 'field', 20 + worldIndex * 5),
    makeEncounter(`w${worldIndex}-2`, `Frontier ${worldIndex}-2`, 'cave', 24 + worldIndex * 6),
    makeEncounter(
      `w${worldIndex}-boss`,
      `Boss ${worldIndex}`,
      'citadel',
      30 + worldIndex * 8,
      `Boss ${worldIndex}`,
    ),
  ];

  return {
    id: `world-${worldIndex}`,
    name: `World ${worldIndex}`,
    encounters,
  };
});

export const GAME_MODULES: GameModule[] = [
  {
    id: 'boss_rush',
    name: 'Boss Rush',
    description: 'Fight all bosses back-to-back with minimal downtime.',
    encounters: WORLDS.map((world) => world.encounters[2]),
    scaling: 'fixed',
    mode: 'pve',
  },
  {
    id: 'infinite_waves',
    name: 'Infinite Waves',
    description: 'Endless scaling waves for PvE power fantasy.',
    encounters: [
      makeEncounter('infinite-1', 'Endless Threat', 'void', 40),
      makeEncounter('infinite-2', 'Endless Threat II', 'void', 55),
      makeEncounter('infinite-3', 'Endless Threat III', 'void', 70),
    ],
    scaling: 'infinite',
    mode: 'pve',
  },
  {
    id: 'playground',
    name: 'Playground',
    description: 'Sandbox to test kits without rank rules.',
    encounters: [makeEncounter('playground-1', 'Training Dummy', 'dojo', 10, 'Training Boss')],
    scaling: 'fixed',
    mode: 'sandbox',
  },
];
