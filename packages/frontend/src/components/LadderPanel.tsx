import SectionCard from './SectionCard';
import { useGameStore } from '../store';

const LadderPanel = () => {
  const ladder = useGameStore((state) => state.ladder);

  return (
    <SectionCard
      title="Ranked Ladder"
      description="Client enforces pick restrictions and renders the ladder using the deterministic stream; server adjudicates results."
    >
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-100">
          <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">Rank</th>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-left">Rating</th>
              <th className="px-3 py-2 text-left">Streak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
            {ladder.map((entry) => (
              <tr key={entry.rank} className="hover:bg-slate-900/70">
                <td className="px-3 py-2 font-semibold text-emerald-200">{entry.rank}</td>
                <td className="px-3 py-2">{entry.player}</td>
                <td className="px-3 py-2">{entry.rating}</td>
                <td className="px-3 py-2">{entry.streak} win</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
};

export default LadderPanel;
