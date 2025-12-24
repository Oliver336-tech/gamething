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
} from '@gamething/shared';

const DEFAULT_MODULUS = 2 ** 31 - 1;
const DEFAULT_MULTIPLIER = 48271;
const DEFAULT_INCREMENT = 0;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const createRngState = (seed: RngSeed): RngState => ({
  seed: seed.seed,
  modulus: seed.modulus ?? DEFAULT_MODULUS,
  multiplier: seed.multiplier ?? DEFAULT_MULTIPLIER,
  increment: seed.increment ?? DEFAULT_INCREMENT,
  last: seed.seed,
});

export const nextRandom = (
  rng: RngState,
): {
  state: RngState;
  value: number;
} => {
  const nextValue =
    (rng.multiplier * rng.last + rng.increment) % rng.modulus || rng.increment;
  const newState: RngState = { ...rng, last: nextValue };
  return { state: newState, value: nextValue / rng.modulus };
};

export const createInitiative = (entities: Entity[]): InitiativeTrack => {
  const sorted = [...entities].sort((a, b) => b.stats.speed - a.stats.speed);
  return { order: sorted.map((entity) => entity.id), currentIndex: 0 };
};

export const createCombatState = (
  entities: Entity[],
  rngSeed: RngSeed,
): CombatState => {
  const initiative = createInitiative(entities);
  const stateEntities = entities.reduce<CombatState['entities']>((acc, entity) => {
    acc[entity.id] = entity;
    return acc;
  }, {});

  return {
    round: 1,
    entities: stateEntities,
    initiative,
    log: [],
    rng: createRngState(rngSeed),
  };
};

const applyDamage = (currentHealth: number, damage: number): number =>
  clamp(currentHealth - damage, 0, currentHealth);

const describeAction = (action: Action, damage: number): string => {
  switch (action.type) {
    case 'attack':
      return `Attack hits for ${damage}`;
    case 'defend':
      return 'Defend reduces incoming damage';
    case 'wait':
      return 'Waits for an opening';
    case 'ability':
      return `Ability used for ${damage} effect`;
    default:
      return 'Action resolved';
  }
};

export const applyAction = (state: CombatState, action: Action): ActionResolution => {
  const actor = state.entities[action.actorId];
  const targetId = action.targetId ?? action.actorId;
  const target = state.entities[targetId];

  if (!actor || !target) {
    return { newState: state };
  }

  const { state: updatedRng, value } = nextRandom(state.rng);
  const variance = 0.5 + value; // 0.5 - 1.5 multiplier

  let damage = 0;
  if (action.type === 'attack' || action.type === 'ability') {
    const rawDamage = actor.stats.attack * variance - target.stats.defense * 0.5;
    damage = Math.max(0, Math.round(rawDamage));
  }

  const reducedDamage = action.type === 'defend' ? 0 : damage;
  const nextHealth = applyDamage(target.stats.health, reducedDamage);

  const nextEntities = {
    ...state.entities,
    [target.id]: {
      ...target,
      stats: {
        ...target.stats,
        health: nextHealth,
      },
    },
  };

  const logEntry = {
    round: state.round,
    actorId: actor.id,
    targetId: target.id,
    action: action.type,
    delta: -reducedDamage,
    description: describeAction(action, reducedDamage),
  };

  return {
    newState: {
      ...state,
      entities: nextEntities,
      rng: updatedRng,
      log: [...state.log, logEntry],
    },
    logEntry,
  };
};

export const advanceTurn = (state: CombatState): CombatState => {
  const nextIndex = (state.initiative.currentIndex + 1) % state.initiative.order.length;
  const completedRound = nextIndex === 0 ? state.round + 1 : state.round;

  return {
    ...state,
    round: completedRound,
    initiative: {
      ...state.initiative,
      currentIndex: nextIndex,
    },
  };
};

export const simulateRound = (
  state: CombatState,
  actions: Action[],
  config: SimulationConfig,
): SimulationResult => {
  let currentState = state;
  let completed = false;

  for (const action of actions) {
    const resolution = applyAction(currentState, action);
    currentState = advanceTurn(resolution.newState);

    const actorsAlive = Object.values(currentState.entities).some(
      (entity) => entity.stats.health > 0 && entity.isPlayerControlled,
    );
    const enemiesAlive = Object.values(currentState.entities).some(
      (entity) => entity.stats.health > 0 && !entity.isPlayerControlled,
    );

    if (!actorsAlive || !enemiesAlive || currentState.round > config.maxRounds) {
      completed = true;
      break;
    }
  }

  return { state: currentState, completed };
};
