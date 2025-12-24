import SectionCard from './SectionCard';
import { useGameStore } from '../store';

const ModesPanel = () => {
  const modules = useGameStore((state) => state.modules);
  const selectModule = useGameStore((state) => state.selectModule);
  const selectedModuleId = useGameStore((state) => state.selectedModuleId);

  return (
    <SectionCard
      title="Boss Rush, Infinite Waves & Playground"
      description="Pick a mode to load the correct deterministic server stream and rewards table."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {modules.map((module) => (
          <button
            key={module.id}
            type="button"
            onClick={() => selectModule(module.id)}
            className={`group flex h-full flex-col justify-between rounded-xl border px-3 py-3 text-left transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 ${
              selectedModuleId === module.id
                ? 'border-indigo-400 bg-indigo-500/10'
                : 'border-slate-800 bg-slate-950/60'
            }`}
            aria-pressed={selectedModuleId === module.id}
            aria-label={`${module.name} module`}
          >
            <div>
              <p className="text-base font-semibold text-slate-50">{module.name}</p>
              <p className="text-xs text-slate-400">{module.description}</p>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
              <span className="rounded-full bg-slate-800 px-2 py-1 font-semibold uppercase tracking-wide text-[11px] text-indigo-100">
                {module.mode}
              </span>
              <span className="text-emerald-200">
                {module.scaling === 'infinite' ? 'Endless' : 'Fixed'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </SectionCard>
  );
};

export default ModesPanel;
