# Project Architecture

## Folder Structure
- `packages/frontend/`: Vite + React client with Tailwind and Zustand state management.
- `packages/backend/`: Express + WebSocket API server that brokers combat state updates.
- `packages/shared/`: Shared TypeScript contracts for entities, combat state, RNG seeds, and simulation results.
- `packages/engine/`: Deterministic, side-effect-free simulation utilities that operate only on provided inputs.
- `.github/workflows/`: Continuous integration pipelines for linting, type-checking, and building all workspaces.
- `docs/`: Project documentation and architecture notes.

## Build & Scripts
Run all workspace scripts from the repository root:

- `npm run build` – Runs `build` in each workspace.
- `npm run typecheck` – Runs `typecheck` in each workspace.
- `npm run lint` – Runs ESLint for each workspace.
- `npm run format` – Runs Prettier formatters in each workspace.
- `npm install` – Installs dependencies and configures Husky.

### Workspace Notes
- **Frontend**: `npm run dev --workspace @gamething/frontend` starts the Vite dev server. Use `VITE_WS_URL` to point at the backend WebSocket endpoint.
- **Backend**: `npm run dev --workspace @gamething/backend` starts the API server with Express and WebSocket support on port 3000 by default.
- **Engine/Shared**: Built with `tsc` only; they expose pure TypeScript modules.

## Deterministic Simulation Guidelines
- **Pure Functions Only**: Engine utilities (`packages/engine`) must not rely on ambient state, timers, or I/O. All data required for a computation must be passed as parameters, and all results returned explicitly.
- **Seeded RNG**: Use `RngSeed`/`RngState` structures to thread randomness. Random value generation should return the next `RngState` alongside the sampled value to keep sequences reproducible.
- **Stable Ordering**: When ordering entities (initiative, sorting), rely on deterministic inputs such as stats or identifiers rather than object iteration order.
- **Immutable Updates**: Treat input state as immutable. Always return new state objects rather than mutating inputs to maintain predictable behavior and testability.
- **Shared Contracts**: Types for entities, actions, combat state, and logs live in `packages/shared` and should be imported by both the backend and frontend to avoid divergence.

## TypeScript Path Mapping
`tsconfig.base.json` defines aliases for workspace imports:

- `@shared/*` → `packages/shared/src/*`
- `@engine/*` → `packages/engine/src/*`
- `@backend/*` → `packages/backend/src/*`
- `@frontend/*` → `packages/frontend/src/*`

Use these aliases to keep imports stable across packages and build outputs.

## Linting & Formatting
- ESLint and Prettier are configured at the repo root. Husky + lint-staged run formatting and linting on staged files before commit.
- CI validates linting, type-checking, and builds using GitHub Actions to ensure consistency across environments.
