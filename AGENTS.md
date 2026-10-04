# 《余量》Repository Guide

## Scope and source of truth

React + TypeScript + Vite + Zustand life simulation. Treat current source, tests, package scripts and Git state as authoritative; reports and screenshots provide context. Preserve Chinese product copy, authored content IDs, save compatibility and the existing black/white pixel console. Make the smallest scoped change, keep user work intact, and do not add features, dependencies, refactors or a new mobile design without authorization.

## Entry points and canonical material

- `index.html` → `src/main.tsx` → `src/App.tsx`; `src/styles.css` owns the global shell. App composes the Life, Career, Shop, Wealth, Social, City and Profile views; `src/game/ui/` and `src/game/ui/pixel/` hold extracted views and shared primitives.
- `src/game/engine/actions.ts` exposes `dispatchGameAction(state, action, content, balance)`; rules return `GameResult`. `src/game/engine/simulation.ts` advances time and pauses at decision gates.
- `src/game/store/gameStore.ts` adapts the engine to Zustand, migrations, save/recovery and UI effects. `src/game/store/canonicalSave.ts` owns canonical IndexedDB transactions.
- `src/game/content/contracts.ts` defines contracts; `src/game/content/official/` is authoritative authored content. `src/game/content/seed.ts` and `src/game/content/registry.ts` supply fallback/composed content. `src/game/content/validateContent.ts` and `scripts/validate-content.ts` enforce integrity.
- `PRODUCT.md` and `DESIGN.md` describe product and visual constraints. `docs/` keeps content guides, audits and historical handoffs. `scripts/reference/` is the canonical visual comparison baseline; documented `scripts/ui-*` tools remain useful even when absent from npm scripts.

For structural exploration, use the installed `codebase-memory` skill. Select the index matching this root, compare freshness with Git HEAD and check cited-path coverage. Read current source for stale, skipped or partial results; graph results do not replace source evidence.

## Product invariants and traps

- Players plan a week and the world runs automatically. Browsing pages consumes no time. Events, Offer notices, rewards and monthly summaries require explicit player decisions; preserve pending gates across week/month transitions and reloads.
- Event choices apply authored effects once. `pendingReward` is only an acknowledgement gate; claiming it must not apply the reward again. `GameEffect` is presentation feedback, not future state.
- Keep income, consumption, investment transfer, liquidation, realized gains, dividends and valuation changes distinct. Use explicit contracts, not legacy-value guesses; synchronize fixtures, validators and relevant tests when contracts change.
- The canonical save is the IndexedDB `saves/main` record, checked by generation/revision and written atomically in one readwrite transaction. Report success only on transaction completion. Preserve conflict/failure handling, legacy migration and unload-candidate lineage; never fall back to competing localStorage canonical writes.
- Use an isolated browser origin/profile or explicit test seed. Do not reset or overwrite a player's normal save during acceptance.
- Keep the shared shell, status and navigation visible, and controls semantic/keyboard-accessible. Desktop and landscape are the supported surfaces; phones reuse that layout and portrait is not an independent design target. Preserve square geometry, borders, readable Chinese text and selected/disabled states.

## Commands and verification

Run from the repository root using the existing npm lockfile:

```text
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
npm test
npm run test:ci
npm run content:validate
npm run content:simulate
npm run build
npm run e2e
```

`test:ci` runs Vitest without file parallelism; do not pass Jest-only flags. `build` validates content, checks TypeScript and builds `dist/` with the `/yuliang-life-sim/` Pages base. Dev runs at `/`. Set `YULIANG_E2E_SERVER=preview` for production acceptance: Playwright starts preview on port 4174 and uses the Pages subpath. Both CI workflows run these desktop release gates:

```text
npx playwright test e2e/ui-architecture.spec.ts e2e/boot-failure.spec.ts e2e/save-concurrency.spec.ts e2e/lifecycle-acceptance.spec.ts --project=desktop
```

Validate proportionally: content needs contract validation; engine/store changes need focused regressions; UI/runtime/persistence changes need real browser flows; build-impacting changes need build and asset/entry checks. Run `git diff --check` and inspect the final diff/status. Documentation-only edits need path/script/config checks. Do not change test expectations to force a pass, and report checks actually run plus remaining limitations.

## Generated files, history and delivery

`node_modules/`, `dist/`, test/browser reports, `artifacts/`, `output/`, Vite/Python caches and local tool state are ignored. Delete only identified disposable files: unique audit screenshots, long-run results, historical review ZIPs and authoring/save backups may still matter. `docs/` handoff/reference ZIPs and `scripts/reference/` are not caches. `.git-broken-20260910/` is a forensic recovery backup, and the historical `pre-rebuild-20260910` tag is a recovery anchor; retain both. Do not classify maintained capture/diagnostic tools as dead code solely from npm script membership.

`deploy-pages.yml` tests, builds, runs production browser gates and deploys `dist/` when `main` is pushed; a successful Pages deployment is delivery. Existing GitHub Releases/tags are historical archives. Do not create Releases/tags, push, merge or change remotes/deployment without explicit authorization. Stage only task-owned files, inspect the staged diff, then check exact-SHA CI/Pages after an authorized push.
