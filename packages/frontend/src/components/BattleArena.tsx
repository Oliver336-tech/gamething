import { useMemo, useState } from 'react';

import SectionCard from './SectionCard';
import { useGameStore } from '../store';
import type { Entity } from '@gamething/shared';

const formatMs = (ms?: number) => `${((ms ?? 0) / 1000).toFixed(1)}s`;

const CeBar = ({ entity }: { entity: Entity | undefined }) => {
  if (!entity?.ce) return null;
  const { current, tiers, burstCost } = entity.ce;
  const pct = Math.min(100, Math.round((current / burstCost) * 100));
  return (
    <div className="flex items-center gap-2" aria-label="Charge energy bar">
      <div className="h-2 flex-1 rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-red-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-amber-100">
        {current}/{burstCost} CE
      </span>
      <div className="flex gap-1">
        {tiers.map((tier, index) => (
          <span
            key={tier}
            className={`h-2 w-2 rounded-full ${current >= tier ? 'bg-amber-300' : 'bg-slate-700'}`}
            aria-label={`Tier ${index + 1} at ${tier} CE`}
          />
        ))}
      </div>
    </div>
  );
};

const StatusPills = ({ entity }: { entity: Entity | undefined }) => {
  if (!entity?.statuses?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entity.statuses.map((status) => (
        <span
          key={`${entity.id}-${status.type}`}
          className="rounded-full bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-100"
        >
          {status.type} · {status.stacks} · {formatMs(status.durationMs)}
        </span>
      ))}
    </div>
  );
};

const ComboRow = ({ entity }: { entity: Entity | undefined }) => {
  if (!entity?.combo) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-indigo-500/20 px-2 py-1 text-xs font-semibold text-indigo-100">
        Combo
      </span>
      <div className="flex items-center gap-1">
        {entity.combo.chain.map((step, index) => (
          <span
            key={`${step}-${index}`}
            className="rounded px-2 py-1 text-xs font-semibold text-slate-900"
            style={{ backgroundColor: `hsl(${220 + index * 15}deg 70% 70%)` }}
          >
            {step}
          </span>
        ))}
      </div>
      <span className="text-xs text-slate-300">Momentum {entity.combo.momentum}</span>
    </div>
  );
};

const ActionQueue = () => {
  const queue = useGameStore((state) => state.pendingActions);
  if (queue.length === 0) return <p className="text-sm text-slate-400">No queued inputs.</p>;

  return (
    <ul className="space-y-2" aria-label="Action queue">
      {queue.map((action) => (
        <li
          key={action.issuedAt}
          className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-200"
        >
          <span className="font-semibold capitalize">{action.type}</span>
          <span className="text-xs text-slate-400">
            Target: {action.targetId ?? '—'} · {new Date(action.issuedAt).toLocaleTimeString()}
          </span>
        </li>
      ))}
    </ul>
  );
};

const BattleArena = () => {
  const timeline = useGameStore((state) => state.timeline);
  const playbackIndex = useGameStore((state) => state.playbackIndex);
  const sendAction = useGameStore((state) => state.sendAction);
  const setPlaybackIndex = useGameStore((state) => state.setPlaybackIndex);
  const connectionStatus = useGameStore((state) => state.connectionStatus);
  const recordDeterministicFrame = useGameStore((state) => state.recordDeterministicFrame);
  const deterministicFrames = useGameStore((state) => state.deterministicFrames);
  const [charging, setCharging] = useState<{ targetId?: string; startedAt: number } | null>(null);

  const snapshot = playbackIndex !== null ? timeline[playbackIndex] : timeline.at(-1);
  const state = snapshot?.state;
  const player = useMemo(
    () => Object.values(state?.entities ?? {}).find((entity) => entity.isPlayerControlled),
    [state],
  );
  const enemies = useMemo(
    () => Object.values(state?.entities ?? {}).filter((entity) => !entity.isPlayerControlled),
    [state],
  );
  const isPvPRestricted =
    state?.mode === 'pvp' && player?.characterId === 'oliver_ascended' && !!player;

  const triggerCharged = (targetId?: string) => {
    if (!player) return;
    const now = Date.now();
    const duration = charging ? now - charging.startedAt : 0;
    sendAction({ actorId: player.id, targetId, type: 'charge', metadata: { heldMs: duration } });
    setCharging(null);
  };

  const fireBurst = (targetId?: string) => {
    if (!player) return;
    sendAction({ actorId: player.id, targetId, type: 'burst' });
  };

  const handleReplayChange = (value: number) => {
    setPlaybackIndex(Number.isNaN(value) ? null : value);
  };

  const rewindLatest = () => setPlaybackIndex(Math.max(0, (timeline.length ?? 1) - 1));

  const syntheticEnd = () => {
    if (!state) return;
    const summaryState = {
      ...state,
      log: [
        ...state.log,
        {
          round: state.round,
          actorId: 'system',
          action: 'wait',
          description: 'Match ended',
          delta: 0,
        },
      ],
    };
    recordDeterministicFrame(summaryState);
  };

  return (
    <SectionCard
      title="Battle UI"
      description="Charged skills, CE, combo chains, timers, and deterministic action queue synced to server streams."
      actions={
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span className="rounded-full bg-slate-800 px-2 py-1 capitalize">{connectionStatus}</span>
          <button
            type="button"
            className="rounded-full border border-slate-700 px-2 py-1 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
            onClick={syntheticEnd}
          >
            Post-match summary
          </button>
        </div>
      }
    >
      {!state ? (
        <p className="text-sm text-slate-400">Waiting for combat data...</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div>
                <p className="text-xs text-slate-400">Round</p>
                <p className="text-lg font-semibold text-slate-100">{state.round}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Mode</p>
                <p className="text-sm font-semibold uppercase text-indigo-200">
                  {state.mode ?? 'sandbox'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Clock</p>
                <p className="text-sm font-semibold text-slate-100">{formatMs(state.timeMs)}</p>
              </div>
              <div className="flex flex-1 items-center gap-2">
                <label className="text-xs text-slate-400" htmlFor="replay">
                  Replay
                </label>
                <input
                  id="replay"
                  type="range"
                  min={0}
                  max={Math.max(0, timeline.length - 1)}
                  value={playbackIndex ?? timeline.length - 1}
                  onChange={(event) => handleReplayChange(Number(event.target.value))}
                  className="w-full accent-indigo-300"
                />
                <button
                  type="button"
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200"
                  onClick={() => setPlaybackIndex(null)}
                >
                  Live
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Player</p>
                  <p className="text-xl font-semibold text-emerald-100">{player?.name ?? '—'}</p>
                  <p className="text-sm text-slate-400">
                    HP {player?.stats.health ?? 0}/
                    {player?.stats.maxHealth ?? player?.stats.health ?? 0}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <p>SPD {player?.stats.speed ?? 0}</p>
                  <p>ATK {player?.stats.attack ?? 0}</p>
                  <p>DEF {player?.stats.defense ?? 0}</p>
                </div>
              </div>
              <div className="mt-2 space-y-2">
                <CeBar entity={player} />
                <ComboRow entity={player} />
                <StatusPills entity={player} />
              </div>
              {isPvPRestricted ? (
                <p className="mt-2 rounded-lg border border-amber-400/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
                  PvP queues disallow Oliver Ascended locally. Server will still decide the final
                  outcome.
                </p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="group rounded-lg bg-emerald-500/80 px-3 py-2 text-sm font-semibold text-emerald-900 shadow hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  disabled={!player || isPvPRestricted}
                  onMouseDown={() =>
                    setCharging({ targetId: enemies[0]?.id, startedAt: Date.now() })
                  }
                  onMouseUp={() => triggerCharged(enemies[0]?.id)}
                  onKeyDown={(event) =>
                    event.key === 'Enter' &&
                    setCharging({ targetId: enemies[0]?.id, startedAt: Date.now() })
                  }
                  onKeyUp={(event) => event.key === 'Enter' && triggerCharged(enemies[0]?.id)}
                  aria-label="Hold to charge skill"
                >
                  Hold to charge
                  {charging ? (
                    <span className="ml-2 animate-pulse text-[11px] uppercase tracking-wide text-emerald-50">
                      Charging…
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-indigo-500/80 px-3 py-2 text-sm font-semibold text-indigo-50 shadow hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  disabled={!player || (player?.ce?.current ?? 0) < (player?.ce?.burstCost ?? 0)}
                  onClick={() => fireBurst(enemies[0]?.id)}
                >
                  Burst
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Enemies</p>
              {enemies.map((enemy) => (
                <div
                  key={enemy.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{enemy.name}</p>
                      <p className="text-xs text-slate-400">
                        HP {enemy.stats.health}/{enemy.stats.maxHealth ?? enemy.stats.health}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <p>ATK {enemy.stats.attack}</p>
                      <p>DEF {enemy.stats.defense}</p>
                      <p>SPD {enemy.stats.speed}</p>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <StatusPills entity={enemy} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
                      onClick={() =>
                        sendAction({
                          actorId: player?.id ?? 'unknown',
                          targetId: enemy.id,
                          type: 'attack',
                        })
                      }
                      disabled={!player}
                    >
                      Attack
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
                      onClick={() =>
                        sendAction({
                          actorId: player?.id ?? 'unknown',
                          targetId: enemy.id,
                          type: 'ability',
                        })
                      }
                      disabled={!player}
                    >
                      Ability
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Action Queue</p>
              <ActionQueue />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-slate-400">Combat Log</p>
                <button
                  type="button"
                  className="text-xs text-indigo-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
                  onClick={rewindLatest}
                >
                  Jump to latest
                </button>
              </div>
              <div className="mt-2 space-y-2 text-xs text-slate-300">
                {state.log.length === 0 ? (
                  <p className="text-slate-500">No events yet.</p>
                ) : (
                  state.log
                    .slice(-10)
                    .reverse()
                    .map((entry) => (
                      <div
                        key={`${entry.round}-${entry.actorId}-${entry.targetId}-${entry.action}-${entry.description}`}
                        className="rounded-lg bg-slate-900/70 px-2 py-1"
                      >
                        <span className="font-semibold text-indigo-100">Round {entry.round}</span>:{' '}
                        {entry.description} ({entry.delta})
                      </div>
                    ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-emerald-500/10 via-slate-900 to-indigo-500/10 p-3">
              <p className="text-sm font-semibold text-slate-100">Post-match Summary</p>
              <p className="text-xs text-slate-300">Timeline snapshots: {timeline.length}.</p>
              <p className="text-xs text-slate-300">Deterministic frames: {deterministicFrames}</p>
              <p className="text-xs text-slate-300">Current seed: {state.rng.last}</p>
              <p className="text-xs text-slate-400">
                Replay mode: {playbackIndex !== null ? 'On' : 'Live'} · Source:{' '}
                {snapshot?.source ?? 'local'}
              </p>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

export default BattleArena;
