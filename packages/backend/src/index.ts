import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import type { CombatState } from '@gamething/shared';

import env from './config/env';
import { createBackendApp } from './app';

const { app, getState, applyActionToState } = createBackendApp();

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
  socket.send(JSON.stringify({ type: 'state', payload: getState() }));

  socket.on('message', (data) => {
    try {
      const payload = JSON.parse(data.toString());
      if (payload.type === 'action') {
        const nextState = applyActionToState(payload.action);
        broadcastState(nextState);
      }
    } catch (error) {
      console.error('Invalid message received', error);
    }
  });
});

server.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
