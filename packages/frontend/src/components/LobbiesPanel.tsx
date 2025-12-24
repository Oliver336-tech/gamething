import SectionCard from './SectionCard';
import { useGameStore } from '../store';

const LobbiesPanel = () => {
  const lobbies = useGameStore((state) => state.lobbies);
  const refreshLobbies = useGameStore((state) => state.refreshLobbies);

  return (
    <SectionCard
      title="Co-op & Competitive Lobbies"
      description="Join fireteams or head to head arenas. Client reflects lobby state but server remains authoritative."
      actions={
        <button
          type="button"
          onClick={refreshLobbies}
          className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
        >
          Refresh
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {lobbies.map((lobby) => (
          <div
            key={lobby.id}
            className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 shadow-inner"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-50">{lobby.name}</p>
                <p className="text-xs text-slate-400">{lobby.type.toUpperCase()}</p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  lobby.status === 'ready'
                    ? 'bg-emerald-500/30 text-emerald-50'
                    : lobby.status === 'in_match'
                      ? 'bg-indigo-500/30 text-indigo-50'
                      : 'bg-slate-700 text-slate-200'
                }`}
              >
                {lobby.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-300">Players: {lobby.players.join(', ')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
              >
                Join
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
              >
                Spectate
              </button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

export default LobbiesPanel;
