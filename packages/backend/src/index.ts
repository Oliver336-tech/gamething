import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { applyAction, createCombatState, simulateRound } from '@gamething/engine';
import type { Action, CombatState, RngSeed, SimulationConfig } from '@gamething/shared';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

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

const app = express();
app.use(cors());
app.use(express.json());

let state: CombatState = createCombatState(startingEntities, baseSeed);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/simulate', (req, res) => {
  const actions = (req.body?.actions ?? []) as Action[];
  const config: SimulationConfig = { maxRounds: req.body?.maxRounds ?? 10 };
  const result = simulateRound(state, actions, config);
  state = result.state;
  res.json(result);
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

const broadcastState = (nextState: CombatState): void => {
  const message = JSON.stringify({ type: 'state', payload: nextState });
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
};

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'state', payload: state }));

  socket.on('message', (data) => {
    try {
      const payload = JSON.parse(data.toString());
      if (payload.type === 'action') {
        const resolution = applyAction(state, payload.action as Action);
        state = resolution.newState;
        broadcastState(state);
      }
    } catch (error) {
      console.error('Invalid message received', error);
    }
  });
});

server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
