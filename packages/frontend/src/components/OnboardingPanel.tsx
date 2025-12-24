import { useMemo } from 'react';

import SectionCard from './SectionCard';
import { useGameStore } from '../store';

const OnboardingPanel = () => {
  const nodes = useGameStore((state) => state.storyNodes);
  const advanceStory = useGameStore((state) => state.advanceStory);
  const unlockOliver = useGameStore((state) => state.unlockOliver);
  const oliverUnlocked = useGameStore((state) => state.oliverUnlocked);

  const allCompleted = useMemo(() => nodes.every((node) => node.status === 'completed'), [nodes]);

  return (
    <SectionCard
      title="Onboarding"
      description="Finish the tutorial, then graduate to story play. Rewards include the Oliver Ascended unlock."
      actions={
        allCompleted && !oliverUnlocked ? (
          <button
            type="button"
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
            onClick={unlockOliver}
            aria-label="Unlock Oliver Ascended after completing the story"
          >
            Unlock Oliver Ascended
          </button>
        ) : null
      }
    >
      <ol className="space-y-3">
        {nodes.map((node) => (
          <li
            key={node.id}
            className="flex items-start justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-100">{node.title}</p>
              <p className="text-xs text-slate-400">{node.description}</p>
              <p className="mt-1 text-xs text-slate-500">
                Recommended Power: <span className="text-emerald-300">{node.recommendedPower}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  node.status === 'completed'
                    ? 'bg-emerald-600/50 text-emerald-50'
                    : node.status === 'in_progress'
                      ? 'bg-sky-600/40 text-sky-50'
                      : 'bg-slate-700 text-slate-200'
                }`}
              >
                {node.status.replace('_', ' ')}
              </span>
              {node.status === 'in_progress' ? (
                <button
                  type="button"
                  className="rounded-full border border-emerald-400/60 px-3 py-1 text-xs font-semibold text-emerald-50 hover:bg-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200"
                  onClick={() => advanceStory(node.id)}
                >
                  Mark complete
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {oliverUnlocked ? (
        <p className="mt-3 rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          Oliver Ascended is now unlocked and usable in PvE and sandbox. PvP queue will reject the
          pick unless server explicitly allows it.
        </p>
      ) : null}
    </SectionCard>
  );
};

export default OnboardingPanel;
