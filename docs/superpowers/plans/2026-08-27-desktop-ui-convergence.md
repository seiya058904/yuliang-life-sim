# 《余量》Desktop UI Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the finished game and its UI logic closely match the four supplied desktop reference screens at 1448×1086 while preserving current gameplay behavior.

**Architecture:** Keep `App.tsx` as the composition shell, keep rules in the engine/store, and use the existing pixel primitives plus a small display-name resolver for presentation-only convergence. Apply shared CSS tokens and page-specific composition rules to the existing Life, Career, Shop, Settlement, and secondary page markup; do not replace the simulation with mock state.

**Tech Stack:** React, TypeScript, Vite, Zustand, Vitest, Playwright, existing pixel SVG primitives and CSS.

**Spec:** `docs/superpowers/specs/2026-08-27-desktop-ui-convergence.md`

## Global Constraints

- Reference images are visual truth; current source, tests, engine, content contracts, and save compatibility are behavioral truth.
- Preserve desktop-first and landscape-only logic; do not add a portrait-specific design.
- Preserve canonical content IDs, Chinese product copy, save compatibility, and financial ledger semantics.
- Use semantic controls and real game state; no screenshot backgrounds, gradients, emoji decoration, or display-only replacement values.
- Run `npm test`, `npm run content:validate`, `npm run content:simulate`, `npm run build`, `npm run e2e`, and `git diff --check` at the final gate; do not commit or push unless separately authorized.

---

### Task 1: Default entry behavior

**Files:**
- Modify: `src/game/store/gameStore.ts`
- Test: `src/game/store/gameStore.test.ts`
- Modify: `e2e/smoke.spec.ts`

- [x] Write the failing store test asserting a fresh seeded store starts on `activeView: 'life'`.
- [x] Run `npm test -- src/game/store/gameStore.test.ts` and verify the current `'work'` value fails the assertion.
- [x] Change only the store default and update the career E2E flow to click the Career navigation before asserting the market.
- [x] Run the focused store and app tests.

### Task 2: Shared pixel-console composition

**Files:**
- Modify: `src/styles.css`
- Modify: `src/App.tsx`
- Modify: `src/game/ui/pixel/PersistentStatusBar.tsx`
- Modify: `src/game/ui/pixel/PixelIllustration.tsx`

- [ ] Preserve existing class names and data attributes while making the 1448×1086 desktop composition use a stable top bar, navigation rail, dense content frame, inverse utility surfaces, and fixed HUD.
- [ ] Use existing `PixelIcon` and `PixelIllustration` primitives for visual anchors; add only small rect-based scenes needed by the reference composition.
- [ ] Keep time controls in the shared shell visible and accessible on non-Life pages.
- [ ] Run focused UI tests and a real browser smoke check at 1448×1086 before moving to page-specific edits.

### Task 3: Four core reference pages

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/game/ui/CareerView.tsx`
- Modify: `src/styles.css`

- [ ] Align Life with the reference Hero, white weekly forecast, seven-day planner, four inbox panels, and large bottom HUD without changing planning/dispatch actions.
- [ ] Align Career with left filters, three-column vacancy cards, distinct card art, white detail panel, requirements/meters/recruiter flow, and four support panels.
- [ ] Align Shop with six category tabs, dense three-column catalog, utility rail, selected item detail, and pagination; preserve actual purchase/schedule behavior.
- [ ] Align Settlement with the large title, finance zones, net-worth focal panel, highlights, attributes and existing acknowledge action; preserve all ledger distinctions.
- [ ] Run focused unit/component tests and browser interactions for navigation, one real shop action, and one settlement acknowledgement path.

### Task 4: Secondary pages and display layer

**Files:**
- Create: `src/game/ui/pixel/displayNames.ts`
- Test: `src/game/ui/pixel/displayNames.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/game/ui/CareerView.tsx`
- Modify: `src/styles.css`

- [ ] Add pure display resolvers that map jobs, companies, items, characters, locations, capabilities, qualifications, financial categories and known internal IDs to user-facing Chinese labels without changing domain data.
- [ ] Replace visible raw-ID fallbacks in Career, monthly settlement, history, wealth, social, city and profile surfaces with resolver output while retaining a safe humanized fallback for unknown legacy IDs.
- [ ] Give Wealth, Social, City and Profile clear pixel visual anchors and consistent panel hierarchy using existing content and state.
- [ ] Run the resolver test, app tests, and browser checks for the secondary navigation pages.

### Task 5: Final convergence and regression gate

**Files:**
- Modify: `src/styles.css` and any files required by Tasks 2–4 only
- Test: relevant existing test files and `e2e/smoke.spec.ts`

- [ ] Capture fresh 1448×1086 screenshots outside tracked generated directories and compare global frame, density, hierarchy and white-surface placement against the four references.
- [ ] Fix only confirmed mismatches; keep a short local mismatch checklist for the final report.
- [ ] Run `npm test`, `npm run content:validate`, `npm run content:simulate`, `npm run build`, `npm run e2e`, and `git diff --check`.
- [ ] Inspect `git status --short --branch` and the final diff; report any skipped or flaky browser checks and do not claim pixel-perfect equivalence beyond observed evidence.
