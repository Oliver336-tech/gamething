import BattleArena from './components/BattleArena';
import LadderPanel from './components/LadderPanel';
import LobbiesPanel from './components/LobbiesPanel';
import ModesPanel from './components/ModesPanel';
import OnboardingPanel from './components/OnboardingPanel';
import AdminPanel from './components/AdminPanel';
import PlaygroundControls from './components/PlaygroundControls';
import SectionCard from './components/SectionCard';
import StoryMapPanel from './components/StoryMapPanel';
import { useDeterministicPlayback, useGameStore, useServerSynchronization } from './store';

const resolveWsUrl = (): string => {
  const env = import.meta.env;
  return typeof env.VITE_WS_URL === 'string' ? env.VITE_WS_URL : 'ws://localhost:3000';
};

const wsUrl = resolveWsUrl();

const App = () => {
  useServerSynchronization(wsUrl);
  useDeterministicPlayback();

  const identity = useGameStore((state) => state.identity);
  const connectionStatus = useGameStore((state) => state.connectionStatus);
  const oliverUnlocked = useGameStore((state) => state.oliverUnlocked);
  const modules = useGameStore((state) => state.modules);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="flex flex-col gap-3 rounded-2xl border border-slate-800/70 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-4 shadow-lg shadow-black/40 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-400">Authenticated</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-semibold text-emerald-100">{identity.name}</p>
              <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-100">
                {identity.role}
              </span>
              {oliverUnlocked ? (
                <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-100">
                  Oliver Ascended Unlocked
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-300">
              Session is replayable via deterministic timeline. Server remains authoritative; client
              enforces PvP pick restrictions locally.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-100">
              Connection: <span className="capitalize">{connectionStatus}</span>
            </span>
            <button
              type="button"
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
            >
              Manage session
            </button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <OnboardingPanel />
          <StoryMapPanel />
        </div>

        <ModesPanel />

        <BattleArena />

        <div className="grid gap-4 lg:grid-cols-2">
          <LobbiesPanel />
          <LadderPanel />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <PlaygroundControls />
          <SectionCard
            title="Admin-Only Experimental Toggles"
            description="Only visible to admins. These switches are gated on the authenticated identity and can be extended later."
            actions={<span className="text-xs text-slate-400">Module count: {modules.length}</span>}
          >
            <p className="text-sm text-slate-200">
              The Admin panel lives below the fold to keep it away from match controls. Each toggle
              is guarded by the authenticated role and participates in replay so QA can view what
              experiments were enabled during a run.
            </p>
          </SectionCard>
        </div>

        <AdminPanel />
      </div>
    </div>
  );
};

export default App;
