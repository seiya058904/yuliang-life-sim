# 《余量》Repository Instructions

## Scope and source of truth

- This repository is a React + TypeScript + Vite + Zustand life-simulation game.
- Treat the current source, tests, package scripts, and Git state as authoritative. Treat `docs/`, memory notes, screenshots, and codebase indexes as context only; verify them against source before relying on them.
- Preserve existing Chinese product copy, official content IDs, save compatibility, and the current Desktop-first / Landscape-only pixel-console direction. Mobile is not an independent design target: if supported, phones use landscape orientation and reuse desktop layout logic; portrait is not an officially supported scenario.
- Make the smallest change that satisfies the request. Do not add speculative features, dependencies, broad refactors, or mobile redesign work unless explicitly requested.

## Architecture

- `src/App.tsx` owns the application shell and page composition. Main UI areas are Life, Career, Shop, Wealth, Social, City, and Profile.
- `src/game/ui/` contains page components; `src/game/ui/pixel/` contains shared pixel UI primitives, icons, illustrations, and persistent status UI. Reuse these patterns before adding new ones.
- `src/game/engine/` contains the game rules and pure state transitions. The central entry point is `dispatchGameAction(state, action, content, balance)`, which returns a `GameResult`.
- `src/game/engine/simulation.ts` advances automatic time, settles activities/days/months, and stops at decision gates such as events and monthly summaries. Never silently choose for the player.
- `src/game/store/gameStore.ts` adapts the engine to Zustand, loads/migrates/saves the browser save, and exposes UI effects. `GameEffect` is presentation feedback; it is not future game state.
- `src/game/content/contracts.ts` defines content/state contracts. `src/game/content/official/` is authoritative authored content; `src/game/content/seed.ts` and the registry provide fallback/composed content. Keep IDs and contract fields synchronized.
- `src/game/content/validateContent.ts` and `scripts/validate-content.ts` enforce content integrity. Content changes must pass content validation.

## Simulation and accounting invariants

- The player plans a week; the simulation runs it automatically. Browsing pages should not consume time; actions that explicitly purchase, schedule, interact, or advance time may do so according to the engine rules.
- Event selection applies authored effects once. `pendingReward` is only a pause/acknowledgement gate; claiming it must not apply the reward again.
- Keep financial meanings separate: income, consumption, investment transfer, asset liquidation, realized gain/loss, dividends, and net-worth/valuation changes are different records.
- Use explicit semantic contract fields rather than inferring meaning from legacy values. Update fixtures, seed content, validators, unit tests, and UI/E2E paths together when a required contract field changes.
- Do not reset or overwrite a normal browser save during testing. Use a separate origin/profile or an explicit test seed; use the existing reset action only when the task requires it.

## UI and content work

- Keep the shared shell visible and consistent: branding, time/date, cash, net worth, primary navigation, simulation controls, and persistent attributes. Treat desktop and landscape as the supported UI surfaces; do not add portrait-specific layouts unless explicitly requested.
- Follow the existing black/white pixel-console system: square geometry, strong borders, semantic selected/disabled states, readable Chinese text, and no decorative SaaS cards, gradients, emoji icons, or unrequested visual polish.
- Keep controls semantic and accessible: use buttons, labels, headings, regions, keyboard focus, and explicit disabled states. Do not replace real state with display-only mock values.
- For UI, routing, interaction, responsive, or runtime changes, use a real browser flow. Never claim a browser flow passed unless it was actually run.

## Commands

```text
npm test                     # Vitest unit/component tests
npm run content:validate     # validate official/seed content contracts
npm run content:simulate     # run deterministic simulation smoke script
npm run build                # content validation + TypeScript build + Vite build
npm run dev -- --host 127.0.0.1 --port 4173
npm run e2e                  # Playwright desktop and mobile projects
```

- Use `npm test`, not Jest-only flags such as `--runInBand`.
- Run checks proportional to the change: content changes require content validation; engine/store changes require focused tests plus relevant regression tests; UI/runtime changes require the relevant tests and a real browser flow; build-impacting changes require `npm run build`.

## Git and generated files

- Inspect `git status --short --branch` before editing and keep unrelated user changes intact.
- Stage only files belonging to the current request. Do not commit, push, deploy, or alter remotes unless explicitly requested.
- Before claiming completion, inspect the final diff, run `git diff --check`, and report checks that were run or skipped.
- Generated/local-only paths include `node_modules/`, `dist/`, `test-results/`, `.playwright-cli/`, `.impeccable/`, `artifacts/`, and `.codebase-memory/`. Do not add them to feature commits unless the task explicitly requests a shareable artifact.

## Codebase memory

- The indexed project name is `yuliang-life-sim`, rooted at this repository. The graph is useful for structural discovery, not a substitute for reading current source.
- Before relying on it, check `index_status` and compare its Git HEAD with the working tree. Check coverage for cited paths; fall back to direct source inspection when coverage is partial, stale, or unavailable.
