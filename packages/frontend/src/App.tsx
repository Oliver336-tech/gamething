import { useEffect, useMemo } from 'react';

import type { Action } from '@gamething/shared';

import { useCombatStore, useLobbyStore, useSocialStore, useWebSocketConnection } from './store';

const wsUrl = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000';

const App = () => {
  const { state, connectionStatus, sendAction } = useCombatStore();
  const { queue, ticket, leaderboard, joinQueue, pollTicket, activeMatchId, fetchLeaderboard } = useLobbyStore();
  const { events, refreshEvents } = useSocialStore();

  const matchId = activeMatchId ?? 'sandbox';
  useWebSocketConnection(wsUrl, ticket?.userId ?? 'guest', matchId);

  useEffect(() => {
    fetchLeaderboard('global').catch(() => undefined);
    refreshEvents().catch(() => undefined);
  }, [fetchLeaderboard, refreshEvents]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (ticket?.status === 'queued') {
        pollTicket().catch(() => undefined);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [ticket, pollTicket]);

  const player = useMemo(
    () => Object.values(state?.entities ?? {}).find((entity) => entity.isPlayerControlled),
    [state],
  );
  const enemies = useMemo(
    () => Object.values(state?.entities ?? {}).filter((entity) => !entity.isPlayerControlled),
    [state],
  );

  const handleAttack = (targetId: string) => {
    if (!player) return;
    const action: Action = { actorId: player.id, targetId, type: 'attack' };
    sendAction(action);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-4xl p-6">
        <header className="flex items-center justify-between pb-6">
          <div>
            <p className="text-sm text-slate-400">Connection</p>
            <p className="text-lg font-semibold capitalize">{connectionStatus}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">Round</p>
            <p className="text-lg font-semibold">{state?.round ?? '-'}</p>
          </div>
        </header>

        <section className="mb-6 grid gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-slate-400">Queue</p>
            <p className="text-xl font-semibold capitalize">{queue}</p>
            <button
              type="button"
              className="mt-3 rounded bg-indigo-500 px-3 py-1 text-sm font-semibold text-indigo-50 shadow hover:bg-indigo-400"
              onClick={() => joinQueue(queue)}
            >
              Join {queue} queue
            </button>
            <p className="mt-2 text-xs text-slate-400">
              Ticket: {ticket?.id ?? 'none'} ({ticket?.status ?? 'idle'})
            </p>
            <p className="text-xs text-slate-400">Match: {matchId}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Leaderboard (top)</p>
            <ul className="mt-2 space-y-1 text-sm">
              {leaderboard.slice(0, 5).map((entry, idx) => (
                <li key={entry.userId} className="flex items-center justify-between rounded bg-slate-800 px-2 py-1">
                  <span>
                    #{entry.rank ?? idx + 1} {entry.email ?? entry.userId}
                  </span>
                  <span className="font-semibold">{entry.score} LP</span>
                </li>
              ))}
              {leaderboard.length === 0 && <li className="text-slate-500">No entries yet.</li>}
            </ul>
          </div>
          <div>
            <p className="text-sm text-slate-400">Recent Events</p>
            <ul className="mt-2 space-y-1 text-sm">
              {events.map((event) => (
                <li key={event.matchId} className="rounded bg-slate-800 px-2 py-1">
                  {event.note} · <span className="text-slate-400">{event.status}</span>
                </li>
              ))}
              {events.length === 0 && <li className="text-slate-500">Nothing recorded.</li>}
            </ul>
          </div>
        </section>

        <main className="grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 shadow">
            <h2 className="text-lg font-semibold">Party</h2>
            {player ? (
              <div className="mt-4 rounded bg-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-wide text-slate-400">{player.name}</p>
                    <p className="text-2xl font-bold">{player.stats.health} HP</p>
                  </div>
                  <div className="text-right text-sm text-slate-300">
                    <p>ATK {player.stats.attack}</p>
                    <p>DEF {player.stats.defense}</p>
                    <p>SPD {player.stats.speed}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Waiting for state...</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 shadow">
            <h2 className="text-lg font-semibold">Enemies</h2>
            <div className="mt-4 space-y-3">
              {enemies.length > 0 ? (
                enemies.map((enemy) => (
                  <div
                    key={enemy.id}
                    className="flex items-center justify-between rounded bg-slate-800 p-3"
                  >
                    <div>
                      <p className="text-sm uppercase tracking-wide text-slate-400">{enemy.name}</p>
                      <p className="text-2xl font-bold">{enemy.stats.health} HP</p>
                    </div>
                    <div className="text-right text-sm text-slate-300">
                      <p>ATK {enemy.stats.attack}</p>
                      <p>DEF {enemy.stats.defense}</p>
                      <p>SPD {enemy.stats.speed}</p>
                    </div>
                    <button
                      type="button"
                      className="rounded bg-emerald-500 px-3 py-1 text-sm font-semibold text-emerald-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                      onClick={() => handleAttack(enemy.id)}
                      disabled={!player || enemy.stats.health <= 0}
                    >
                      Attack
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">Waiting for enemies...</p>
              )}
            </div>
          </section>
        </main>

        <section className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4 shadow">
          <h2 className="text-lg font-semibold">Combat Log</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            {(state?.log ?? []).length === 0 && <p className="text-slate-500">No events yet.</p>}
            {state?.log.map((entry) => (
              <div key={`${entry.round}-${entry.actorId}-${entry.targetId}-${entry.action}`}>
                <span className="font-semibold">Round {entry.round}</span>: {entry.description} ({entry.delta})
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default App;
