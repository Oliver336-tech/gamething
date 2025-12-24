import { createServer } from 'http';

import { createBackendApp } from './app';
import env from './config/env';
import { RealtimeGameServer } from './realtime/server';
import { MatchmakingService } from './services/matchmaking';
import { ProgressionService } from './services/progression';

const progression = new ProgressionService();
const matchmaking = new MatchmakingService(progression);
const { app } = createBackendApp({ matchmaking, progression });

const server = createServer(app);
new RealtimeGameServer(server, matchmaking);

server.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  console.log(`Realtime matchmaking ready with sandbox session.`);
});
