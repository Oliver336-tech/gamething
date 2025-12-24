import SectionCard from './SectionCard';
import { useGameStore } from '../store';

const StoryMapPanel = () => {
  const nodes = useGameStore((state) => state.storyNodes);
  const selectedModuleId = useGameStore((state) => state.selectedModuleId);
  const selectModule = useGameStore((state) => state.selectModule);

  const completion = Math.round(
    (nodes.filter((node) => node.status === 'completed').length / nodes.length) * 100,
  );

  return (
    <SectionCard
      title="Story Map"
      description="Chart where to go next. Story completion feeds the ranked ladder calibration."
      actions={
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400" htmlFor="story-module">
            Current focus
          </label>
          <select
            id="story-module"
            value={selectedModuleId}
            onChange={(event) => selectModule(event.target.value as typeof selectedModuleId)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            <option value="story">Story</option>
            <option value="boss_rush">Boss Rush</option>
            <option value="infinite_waves">Infinite Waves</option>
            <option value="playground">Playground</option>
          </select>
        </div>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="w-full rounded-full bg-slate-800">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-sky-300 to-indigo-400 transition-all"
            style={{ width: `${completion}%` }}
            role="progressbar"
            aria-valuenow={completion}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Story completion"
          />
        </div>
        <span className="text-sm text-slate-300">{completion}%</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {nodes.map((node) => (
          <div
            key={node.id}
            className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-950 p-3"
          >
            <p className="text-sm font-semibold text-slate-100">{node.title}</p>
            <p className="text-xs text-slate-400">{node.description}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Recommended</p>
            <p className="text-sm font-semibold text-emerald-200">{node.recommendedPower} Power</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              <span>{node.status.replace('_', ' ')}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

export default StoryMapPanel;
