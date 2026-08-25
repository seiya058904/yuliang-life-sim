# Task 2A Report: AcquisitionHint and Unified Life History

## Commit

- Implementation commit: `0adbc344f51f14912135f1bf0d780e99983ea6a6`
- Branch: `codex/yuliang-completion`
- Push: not pushed

## Scope Completed

- Made `AcquisitionHint` the canonical exported type and kept `RequirementHint` as a deprecated alias.
- Replaced career requirement hint generation with recursive `ConditionDefinition` traversal, satisfied-requirement filtering, content-aware item/capability routes, numeric current/required values, and de-duplication.
- Rendered rejected application hints as buttons in `CareerView`; clicking a hint calls the App-provided navigation callback and does not dispatch game-state mutations.
- Added canonical persisted `LifeRecordEntry` and `lifeHistory` state, initialized new saves, migrated old saves without history to `[]`, and bumped save version to 2.
- Added pure `appendLifeRecord` helper to append records while preventing duplicate IDs.
- Appended descriptive life-history records at successful action boundaries for accepted full-time/side-job offers, item purchases, housing moves/purchases, relationship interactions, event choices, business purchases, asset buys/sells, and investment buys/sells.
- Added Profile life-history rendering newest first with readable category labels, day, title, optional detail, and optional amount.
- Updated only matrix rows touched by this slice.

## RED Evidence

Focused RED command:

```powershell
npm test -- src/game/engine/careers.test.ts src/game/engine/actions.test.ts src/game/store/gameStore.test.ts src/App.test.tsx src/game/engine/lifeHistory.test.ts
```

Expected failing output observed before production edits:

- `src/game/engine/lifeHistory.test.ts`: failed to resolve `./lifeHistory`, proving the pure helper did not exist.
- `src/game/engine/careers.test.ts`: recursive hint expectation failed because existing `requirementHints` returned old `RequirementHint` objects with no `destinationView`, no numeric values, no recursive cash/relationship hints, and duplicate-prone capability IDs.
- `src/game/engine/actions.test.ts`: `career.state.lifeHistory?.at(-1)` was `undefined`, proving successful actions did not append life-history records.
- `src/game/store/gameStore.test.ts`: restored `lifeHistory` was `undefined`, proving old-save migration did not create an empty history.
- `src/App.test.tsx`: no button named `/去商店/` existed for rejected application hints, proving hints were rendered as inert text and Profile history was not reachable through the tested flow.

One test-fixture correction was made before production edits after RED: the action test was aligned to actual current content IDs `interaction.seed-lin-meal` and `investment.seed-index`, and the capability provider expectation was aligned to `item.seed-laptop`, which is the real `remote_work` provider in the registry.

## Changed Files

- `src/game/content/contracts.ts`
- `src/game/balance/config.ts`
- `src/game/engine/careers.ts`
- `src/game/engine/actions.ts`
- `src/game/engine/initialState.ts`
- `src/game/store/gameStore.ts`
- `src/game/engine/lifeHistory.ts`
- `src/game/ui/CareerView.tsx`
- `src/game/ui/LifeHistoryList.tsx`
- `src/App.tsx`
- `src/game/engine/careers.test.ts`
- `src/game/engine/actions.test.ts`
- `src/game/engine/lifeHistory.test.ts`
- `src/game/store/gameStore.test.ts`
- `src/App.test.tsx`
- `src/game/engine/conditions.test.ts`
- `src/game/engine/economy.test.ts`
- `docs/IMPLEMENTATION-COVERAGE-MATRIX.md`

## GREEN Evidence

Focused GREEN command:

```powershell
npm test -- src/game/engine/careers.test.ts src/game/engine/actions.test.ts src/game/store/gameStore.test.ts src/App.test.tsx src/game/engine/lifeHistory.test.ts
```

Result: 5 test files passed, 23 tests passed.

Required final verification:

```powershell
npm test
npm run content:validate
npm run build
```

Results:

- `npm test`: 17 test files passed, 63 tests passed.
- `npm run content:validate`: passed with 12 jobs, 28 items, 6 housing entries, 5 characters, 29 events, 4 event chains, 3 businesses, 4 assets, 1 activity, 2 investments.
- `npm run build`: passed; content validation, `tsc -b`, and Vite production build completed.
- `git diff --check`: exit 0; only CRLF normalization warnings.

## Browser E2E

Not run for this slice. Task 2A did not add a stable E2E seed/control to force a rejected application and preloaded life-history state in the browser. Next career E2E slice should add a deterministic seed or test hook, then cover:

1. Start with a rejected application requiring a missing item/capability.
2. Open Career > 我的申请.
3. Click the AcquisitionHint button.
4. Verify navigation to the expected destination view without state mutation.
5. Open Profile > 人生记录 and verify newest-first persisted records after performing a successful action.

## Self-Review

- No new dependencies.
- No second game-state source introduced; `lifeHistory` lives inside `GameState` and is persisted through the existing store.
- Financial ledger semantics remain unchanged; history records are descriptive only.
- Failed actions still return the input state and append no records.
- Matrix statuses remain conservative; no broad Phase 1 completion claim was made.

## Concerns

- The report is written after the implementation commit so it can include the actual commit hash; it is not included in `0adbc344f51f14912135f1bf0d780e99983ea6a6`.
- Capability hints route to item providers only when current content exposes one; capabilities unlocked only through future events fall back to Profile.

## Fix Round 1 - Review Important Issues

Addressed the three Important review issues:

- Recursive unmet conditions now emit concrete identity-preserving hints for every `ConditionDefinition` variant used by Task 2A, including current job, completed event, completed milestone, chain stage, flag, day, time, and player-stage conditions. Composite `all`/`any`/`not` semantics remain delegated through `conditionSatisfied` and recursive child hint collection.
- Equivalent threshold hints now de-duplicate by acquisition path and requirement identity, retaining the strongest unmet threshold for cash, lifestyle, attributes, reputation, and job experience.
- Added focused coverage for a recursive unmet `owns_item` requirement routing to Shop with the exact target item ID. The capability-provider route coverage remains in the recursive hint test.

Not changed in this round:

- The separate Minor career amount-format concern remains ledgered for final review.

### Fix Round 1 RED Evidence

RED command run before production edits:

```powershell
npm test -- src/game/engine/careers.test.ts
```

Expected RED observed:

- `collects recursive acquisition hints and de-duplicates equivalent routes`: failed because the current cash hint used threshold-embedded ID `cash:800` instead of acquisition-path identity `cash`.
- `preserves identity for unmet non-numeric condition variants instead of collapsing to a generic fallback`: failed because unmet current job, completed event, completed milestone, chain stage, flag, day, time, and player-stage conditions collapsed to generic `condition:*` hints instead of concrete source/target/value-preserving hints.
- `keeps only the strongest unmet threshold for equivalent acquisition paths`: failed because threshold-embedded IDs prevented threshold equivalence and strongest-threshold replacement.

RED also confirmed the new recursive item requirement coverage was focused and non-regressive: `routes an unmet recursive item requirement to the exact shop item` already passed, proving the route existed while adding the missing coverage requested by review.

### Fix Round 1 Implementation

Changed files:

- `src/game/engine/careers.ts`
- `src/game/engine/careers.test.ts`

Implementation notes:

- Replaced threshold-embedded cash and lifestyle requirement IDs with stable acquisition-path IDs so `dedupeHints` can retain the strongest unmet numeric requirement.
- Added explicit hint mappings for unmet non-numeric condition variants with concrete `requirementId`, `destinationView`, `targetId`, and numeric values where applicable.
- Added identity helpers for `not` conditions and source/target preservation without changing ledger or action semantics.
- Removed the obsolete generic fallback from the now-exhaustive `conditionHints` switch after `npm run build` exposed it as a TypeScript `never` error.

### Fix Round 1 GREEN Evidence

Focused GREEN:

```powershell
npm test -- src/game/engine/careers.test.ts
```

Result: 1 test file passed, 10 tests passed.

Required verification:

```powershell
npm test
npm run content:validate
npm run build
```

Results:

- `npm test`: 17 test files passed, 66 tests passed.
- `npm run content:validate`: passed with 12 jobs, 28 items, 6 housing entries, 5 characters, 29 events, 4 event chains, 3 businesses, 4 assets, 1 activity, 2 investments.
- `npm run build`: passed; content validation, `tsc -b`, and Vite production build completed.
- `git diff --check`: exit 0; only CRLF normalization warnings.

### Fix Round 1 Concerns

- The recursive item requirement test passed during RED because existing production behavior already routed `owns_item` to Shop; the review gap was missing focused coverage, not a failing route.
- The Minor career amount-format concern was intentionally not changed in this round.

## Fix Round 2 - Direction-Aware Deadline De-Dupe

Addressed the remaining Important finding:

- `dedupeHints` now selects the strongest unmet numeric threshold by requirement direction. Existing lower-bound requirements keep the largest unmet `requiredValue`; `day_at_most` keeps the smallest unmet `requiredValue`, because the earlier deadline is stricter.

Kept scoped:

- Changed only career hint logic/tests plus this report.
- Did not address separately ledgered Minor items.

### Fix Round 2 RED Evidence

Focused RED command before production edits:

```powershell
npm test -- src/game/engine/careers.test.ts
```

Expected RED observed:

- `keeps the earliest unmet deadline for equivalent day-at-most requirements` failed.
- Received one `day_at_most` hint with `currentValue: 12` and `requiredValue: 10`.
- Expected the single retained hint to have `requiredValue: 6`, proving the old numeric-largest selection was wrong for deadline upper bounds.
- Other career tests in the focused file continued to pass during RED, including the lower-bound strongest-threshold regression coverage from Fix Round 1.

### Fix Round 2 Implementation

Changed files:

- `src/game/engine/careers.ts`
- `src/game/engine/careers.test.ts`

Implementation notes:

- Added a focused regression test with two unmet `day_at_most` requirements.
- Replaced the inline numeric comparison in `dedupeHints` with `strongerHint`.
- `strongerHint` treats `day_at_most` as smaller-is-stricter and all other numeric hints as larger-is-stricter, preserving cash, reputation, lifestyle, attribute, and job-experience lower-bound behavior.

### Fix Round 2 GREEN Evidence

Focused GREEN:

```powershell
npm test -- src/game/engine/careers.test.ts
```

Result: 1 test file passed, 11 tests passed.

Required verification:

```powershell
npm test
npm run content:validate
npm run build
```

Results:

- `npm test`: 17 test files passed, 67 tests passed.
- `npm run content:validate`: passed with 12 jobs, 28 items, 6 housing entries, 5 characters, 29 events, 4 event chains, 3 businesses, 4 assets, 1 activity, 2 investments.
- `npm run build`: passed; content validation, `tsc -b`, and Vite production build completed.
- `git diff --check`: exit 0; only CRLF normalization warnings.

### Fix Round 2 Concerns

- No separately ledgered Minor item was changed in this round.
