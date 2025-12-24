import SectionCard from './SectionCard';
import { useGameStore } from '../store';

const PlaygroundControls = () => {
  const accessibility = useGameStore((state) => state.accessibility);
  const toggleAccessibility = useGameStore((state) => state.toggleAccessibility);
  const applyServerState = useGameStore((state) => state.applyServerState);
  const timeline = useGameStore((state) => state.timeline);

  const injectEcho = () => {
    const latest = timeline.at(-1)?.state;
    if (!latest) return;
    const next = {
      ...latest,
      mode: 'sandbox' as const,
      timeMs: (latest.timeMs ?? 0) + 500,
      log: [
        ...latest.log,
        {
          round: latest.round + 1,
          actorId: 'system',
          action: 'ability',
          description: 'Playground slider adjusted CE flow.',
          delta: 0,
        },
      ],
    };
    applyServerState(next);
  };

  return (
    <SectionCard
      title="Playground Controls & Accessibility"
      description="Toggle accessibility aids and inject deterministic state for safe experimentation."
      actions={
        <button
          type="button"
          onClick={injectEcho}
          className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
        >
          Inject snapshot
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">Accessibility</p>
          <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <input
              type="checkbox"
              checked={accessibility.reducedMotion}
              onChange={() => toggleAccessibility('reducedMotion')}
              className="h-4 w-4 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-100">Reduced motion</span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <input
              type="checkbox"
              checked={accessibility.highContrast}
              onChange={() => toggleAccessibility('highContrast')}
              className="h-4 w-4 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-100">High contrast</span>
          </label>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
          <p className="text-xs uppercase tracking-wide text-slate-400">Deterministic notes</p>
          <p>
            State updates are replayable via the timeline slider. Client-side injections keep the
            RNG seed in sync so the action queue remains deterministic even when the server stream
            pauses.
          </p>
        </div>
      </div>
    </SectionCard>
  );
};

export default PlaygroundControls;
