import cors from 'cors';
import express from 'express';

import { applyAction, createCombatState, simulateRound } from '@gamething/engine';
import type { Action, CombatState, RngSeed, SimulationConfig } from '@gamething/shared';

import env from './config/env';
import adminRouter from './routes/admin';
import authRouter from './routes/auth';
import createFriendsRouter from './routes/friends';
import createHistoryRouter from './routes/history';
import createMatchmakingRouter from './routes/matchmaking';
import type { MatchmakingService } from './services/matchmaking';
import type { ProgressionService } from './services/progression';

const baseSeed: RngSeed = { seed: 1337 };

const startingEntities = [
  {
    id: 'player-1',
    name: 'Hero',
    isPlayerControlled: true,
    stats: { health: 30, attack: 8, defense: 3, speed: 6 },
  },
  {
    id: 'enemy-1',
    name: 'Goblin',
    isPlayerControlled: false,
    stats: { health: 18, attack: 5, defense: 2, speed: 4 },
  },
];

export const createBackendApp = (deps: { matchmaking: MatchmakingService; progression: ProgressionService }) => {
  let state: CombatState = createCombatState(startingEntities, baseSeed);
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', port: env.PORT });
  });

  app.post('/simulate', (req, res) => {
    const actions = (req.body?.actions ?? []) as Action[];
    const config: SimulationConfig = { maxRounds: req.body?.maxRounds ?? 10 };
    const result = simulateRound(state, actions, config);
    state = result.state;
    res.json(result);
  });

  app.use('/auth', authRouter);
  app.use('/admin', adminRouter);
  app.use('/matchmaking', createMatchmakingRouter(deps.matchmaking, deps.progression));
  app.use('/friends', createFriendsRouter());
  app.use('/history', createHistoryRouter(deps.matchmaking));

  const getState = () => state;
  const setState = (next: CombatState) => {
    state = next;
    return state;
  };

  const applyActionToState = (action: Action) => {
    const resolution = applyAction(state, action);
    state = resolution.newState;
    return state;
  };

  return { app, getState, setState, applyActionToState };
};

export type BackendApp = ReturnType<typeof createBackendApp>;
export default createBackendApp;
