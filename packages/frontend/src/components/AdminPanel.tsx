import SectionCard from './SectionCard';
import { useGameStore } from '../store';

const AdminPanel = () => {
  const identity = useGameStore((state) => state.identity);
  const experiments = useGameStore((state) => state.experiments);
  const toggleExperiment = useGameStore((state) => state.toggleExperiment);

  if (identity.role !== 'admin') return null;

  return (
    <SectionCard
      title="Admin Experiments"
      description="Client-side toggles for experimental features. Server stays authoritative, but UI can opt-in previews."
    >
      <div className="space-y-3">
        {experiments.map((experiment) => {
          const inputId = `experiment-${experiment.id}`;
          return (
            <div
              key={experiment.id}
              className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <input
                id={inputId}
                type="checkbox"
                checked={experiment.enabled}
                onChange={() => toggleExperiment(experiment.id)}
                className="mt-1 h-4 w-4 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500"
              />
              <label htmlFor={inputId} className="cursor-pointer">
                <p className="text-sm font-semibold text-slate-100">{experiment.label}</p>
                <p className="text-xs text-slate-400">{experiment.description}</p>
              </label>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

export default AdminPanel;
