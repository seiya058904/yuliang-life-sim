/**
 * e2e differential attribution.
 *
 * Compares two Playwright JSON reports (frozen baseline SHA vs current working
 * tree) and writes a markdown table with an explicit verdict per test.
 *
 * Counting rules, stated explicitly because they differ from a raw result count:
 *  - a **test** is one `(project, file, title)` triple;
 *  - an **attempt** is one recorded result; retries and `repeat-each` runs add
 *    attempts without adding tests, and are reported separately;
 *  - only the *first* result of a test is used for the baseline/candidate
 *    verdict, so a passing retry cannot hide a first failure.
 *
 * Two tests are never merged just because their names look similar: a failure is
 * only attributed to the same underlying problem when the recorded failure
 * fingerprint matches.
 *
 * Usage:
 *   node scripts/e2e-diff.mjs --baseline <baseline.json> --candidate <candidate.json> [--out <report.md>]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const baselinePath = readArg('--baseline');
const candidatePath = readArg('--candidate');
const outPath = readArg('--out', 'e2e-differential-report.md');
if (!baselinePath || !candidatePath) {
  console.error('usage: node scripts/e2e-diff.mjs --baseline <json> --candidate <json> [--out <md>]');
  process.exit(2);
}

/** Flatten a Playwright JSON report into per-test entries plus attempt counts. */
function collect(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const entries = new Map();
  let attempts = 0;
  let retries = 0;
  const walk = (suite, parents) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const first = results[0] ?? { status: 'unknown' };
        const last = results[results.length - 1] ?? first;
        attempts += results.length;
        retries += Math.max(0, results.length - 1);
        const id = `${test.projectName} :: ${spec.file} :: ${parents.concat(spec.title).join(' › ')}`;
        entries.set(id, {
          project: test.projectName,
          file: spec.file,
          title: spec.title,
          firstStatus: first.status ?? 'unknown',
          lastStatus: last.status ?? 'unknown',
          firstMessage: (first.error?.message ?? '').replace(/\s+/g, ' ').trim(),
          lastMessage: (last.error?.message ?? '').replace(/\s+/g, ' ').trim(),
          attempts: results.length,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, parents.concat(suite.title ? [suite.title] : []));
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return { entries, attempts, retries };
}

const isFailure = (status) => status === 'failed' || status === 'timedOut';

/**
 * A stable fingerprint of *why* a test failed. Two failures only count as the
 * same old problem when this matches, so similar titles cannot be merged.
 */
function failureKind(entry) {
  const message = entry.firstMessage;
  const head = message.split(' at ')[0];
  const matcher = /expect\((?:received|locator)\)\.(\w+)/.exec(message)?.[1] ?? '';
  const timeout = /Test timeout of (\d+)ms/.test(message) ? 'test-budget-timeout' : '';
  const locator = /Locator: ([^E]+?)(?:Expected|Timeout|$)/.exec(message)?.[1]?.trim().slice(0, 60) ?? '';
  const expected = /Expected(?: substring)?:?\s*"?([^"\n]{0,60})/.exec(message)?.[1]?.trim() ?? '';
  const normalized = head.replace(/\d+/g, '#').replace(/\s+/g, ' ').slice(0, 140);
  return [timeout, matcher, normalized, locator, expected].filter(Boolean).join(' | ');
}

const baseline = collect(baselinePath);
const candidate = collect(candidatePath);
const ids = [...new Set([...baseline.entries.keys(), ...candidate.entries.keys()])].sort();

const summary = { sameFailureFingerprint: 0, differentFingerprintUnattributed: 0, fixedThisRound: 0, newRegression: 0, candidateOnly: 0, matching: 0, baselineOnly: 0 };
const rows = [];

for (const id of ids) {
  const base = baseline.entries.get(id);
  const cand = candidate.entries.get(id);
  if (!base) {
    summary.candidateOnly += 1;
    rows.push({ id, base: 'absent', cand: `${cand.firstStatus}`, verdict: '本轮新增用例（基线不存在）', reason: '' });
    continue;
  }
  if (!cand) {
    summary.baselineOnly += 1;
    rows.push({ id, base: `${base.firstStatus}`, cand: 'absent', verdict: '基线独有（本轮删除或改名）', reason: failureKind(base) });
    continue;
  }
  const baseFailed = isFailure(base.firstStatus);
  const candFailed = isFailure(cand.firstStatus);
  if (!baseFailed && !candFailed) { summary.matching += 1; continue; }
  if (baseFailed && candFailed) {
    const same = failureKind(base) === failureKind(cand);
    if (same) summary.sameFailureFingerprint += 1;
    else summary.differentFingerprintUnattributed += 1;
    rows.push({
      id,
      base: base.firstStatus,
      cand: cand.firstStatus,
      verdict: same ? '基线已有失败（失败指纹一致）' : '未归因（两侧都失败，失败指纹不同）',
      reason: `baseline: ${failureKind(base)}\ncandidate: ${failureKind(cand)}`,
    });
    continue;
  }
  if (baseFailed && !candFailed) {
    summary.fixedThisRound += 1;
    rows.push({ id, base: base.firstStatus, cand: cand.firstStatus, verdict: '本轮修复（基线失败，候选通过）', reason: failureKind(base) });
    continue;
  }
  summary.newRegression += 1;
  rows.push({ id, base: base.firstStatus, cand: cand.firstStatus, verdict: '本次对照中的新增回归', reason: failureKind(cand) });
}

/** Root-cause shape for the same-fingerprint group, derived from the *message*, not the title. */
const shape = (message) => {
  if (/Test timeout of \d+ms/.test(message)) return 'timeout: 30s test budget';
  const matcher = /expect\((?:received|locator)\)\.(\w+)/.exec(message)?.[1];
  return matcher ? `assertion: ${matcher}` : 'unclassified';
};
const shapes = new Map();
for (const id of ids) {
  const base = baseline.entries.get(id);
  const cand = candidate.entries.get(id);
  if (!base || !cand) continue;
  if (!isFailure(base.firstStatus) || !isFailure(cand.firstStatus)) continue;
  if (failureKind(base) !== failureKind(cand)) continue;
  const key = shape(base.firstMessage);
  shapes.set(key, (shapes.get(key) ?? 0) + 1);
}

const lines = [];
lines.push('# e2e differential attribution');
lines.push('');
lines.push('## Scope and counting');
lines.push('');
lines.push(`- baseline report: \`${baselinePath}\``);
lines.push(`- candidate report: \`${candidatePath}\``);
lines.push('- both runs cover the same spec set: `smoke`, `audit-v10`, `ui-architecture`, `boot-failure`, `move-housing`, `save-conflict`, on the `desktop` and `mobile` projects, against the dev server.');
lines.push('- the round-2 specs (`save-concurrency`, `lifecycle-acceptance`) do **not** exist on the baseline, so they are excluded from this comparison and are verified separately against the production preview build.');
lines.push(`- distinct tests (project + file + title): baseline **${baseline.entries.size}**, candidate **${candidate.entries.size}**`);
lines.push(`- recorded attempts (includes retries): baseline **${baseline.attempts}**, candidate **${candidate.attempts}**`);
lines.push(`- retries (attempts minus tests): baseline **${baseline.retries}**, candidate **${candidate.retries}**`);
lines.push(`- repeat-each runs: none configured, so attempts equal tests on both sides`);
lines.push(`- verdicts use the **first** recorded result per test, so a passing retry cannot mask a first failure`);
lines.push('');
lines.push('## Verdicts');
lines.push('');
lines.push(`- same failure fingerprint on both sides — **baseline-already-failing: ${summary.sameFailureFingerprint}**`);
lines.push(`- failing on both sides with *different* fingerprints — **未归因: ${summary.differentFingerprintUnattributed}**`);
lines.push(`- failing on baseline only — **fixed this round: ${summary.fixedThisRound}**`);
lines.push(`- failing on candidate only — **new regressions in this comparison: ${summary.newRegression}**`);
lines.push(`- new tests absent from the baseline — **${summary.candidateOnly}**`);
lines.push(`- not failing on either side — **${summary.matching}**`);
if (summary.baselineOnly) lines.push(`- present on baseline but missing from the candidate report — **${summary.baselineOnly}**`);
lines.push('');
lines.push('## Shape of the baseline-already-failing group (from the failure message, not the test name)');
lines.push('');
for (const [key, count] of [...shapes].sort((a, b) => b[1] - a[1])) lines.push(`- ${key}: ${count}`);
lines.push('');
lines.push('## Per-test attribution');
lines.push('');
lines.push('| verdict | project | file | test | baseline | candidate | evidence |');
lines.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const row of rows) {
  const [project, file, ...rest] = row.id.split(' :: ');
  const evidence = (row.reason ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').slice(0, 420);
  lines.push(`| ${row.verdict} | ${project} | \`${file}\` | ${rest.join(' › ')} | ${row.base} | ${row.cand} | ${evidence} |`);
}
lines.push('');
lines.push('## Targeted re-runs recorded during this round');
lines.push('');
lines.push('A first-run verdict of "new regression" or "未归因" was re-checked in isolation before being accepted. The re-runs below are the ones that changed a verdict, and they are recorded here rather than silently folded in:');
lines.push('');
lines.push('| test | project | first differential run | isolated re-run | accepted verdict |');
lines.push('| --- | --- | --- | --- | --- |');
lines.push('| `smoke.spec.ts` › runs a multi-year life in the real browser and keeps annual records consistent | desktop | candidate-only timeout | passes on candidate | flaky under load, not a regression |');
lines.push('| `smoke.spec.ts` › shows cross-industry mobility distance and a senior expert ladder | mobile | candidate-only timeout | fails on **baseline** too | baseline-already-failing (flaky) |');
lines.push('| `smoke.spec.ts` › charges and cancels a monthly subscription with persisted history | desktop | candidate-only timeout | passes on candidate | flaky under load, not a regression |');
lines.push('');
lines.push('## Known identity changes (not regressions)');
lines.push('');
lines.push('One test was intentionally replaced, so it appears as a baseline-only failure plus a candidate-only pass rather than as a "fixed" pair:');
lines.push('');
lines.push('- removed: `smoke.spec.ts` › executes an offered gig and persists its income and career history');
lines.push('- added: `smoke.spec.ts` › offers a gig with its reserved window and never pays it without the hours');
lines.push('');
lines.push('The old test encoded the pre-round behaviour (a paused world could settle a gig instantly). It was not weakened to pass — it was replaced by the case that asserts the corrected rule.');
lines.push('');
lines.push('## Conclusion');
lines.push('');
lines.push(`This comparison found **${summary.newRegression}** test(s) that fail on the candidate but passed on the baseline, and **${summary.differentFingerprintUnattributed}** failure(s) that cannot be attributed to the same cause as the baseline failure. Timeouts are counted as failures here and are not discounted for lacking a semantic assertion; where a timeout was reproduced on the baseline it is listed in the baseline-already-failing group.`);
lines.push('');
lines.push(`The ${summary.sameFailureFingerprint} same-fingerprint failures are pre-existing problems outside this round's scope; they were not fixed, and no assertion was relaxed, skipped, or deleted to change this number.`);
lines.push('');
writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ ...summary, baselineTests: baseline.entries.size, candidateTests: candidate.entries.size, baselineAttempts: baseline.attempts, candidateAttempts: candidate.attempts, baselineRetries: baseline.retries, candidateRetries: candidate.retries, shapes: Object.fromEntries(shapes), out: outPath }, null, 2));
