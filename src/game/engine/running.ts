import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, GameState } from '../content/contracts';
import { planEditIssues, reconcileStateWithEmployment } from './planning';
import { defaultJobSchedule } from './schedule';

export function applyDueEmployment(state: GameState, content: ContentRegistry): void {
  const previous = state.employment;
  if (!previous?.pendingJobId || previous.pendingEffectiveDay === undefined || state.time.day < previous.pendingEffectiveDay) return;
  const job = content.jobs.find(job => job.id === previous.pendingJobId);
  if (!job) return;
  state.employmentHistory = [...(state.employmentHistory ?? []), { jobId: previous.jobId, companyId: previous.companyId, startedDay: previous.startedDay, endedDay: previous.pendingEffectiveDay - 1, finalPay: (previous.basePay ?? 0) + (previous.salaryAdjustment ?? 0), reason: '换岗' }];
  state.currentJobId = job.id;
  state.employment = { jobId: job.id, startedDay: previous.pendingEffectiveDay, companyId: previous.pendingCompanyId, basePay: previous.pendingBasePay ?? job.basePay, salaryAdjustment: 0, negotiationStage: 0, schedule: defaultJobSchedule(job), effectiveWeek: state.calendar.week };
  reconcileStateWithEmployment(state);
}

/** The only engine entry into running, including automatic continuation. */
export function enterRunning(state: GameState, content: ContentRegistry, balance: BalanceConfig): string | undefined {
  if (state.pendingEventId) { state.simulationMode = 'event'; return '请先处理当前事件'; }
  if (state.pendingReward) { state.simulationMode = 'reward'; return '请先确认奖励'; }
  if (state.pendingMonthlySummary) { state.simulationMode = 'monthly_summary'; return '请先确认月结'; }
  // The notice points at one application, but the player may resolve that
  // Offer through any terminal action (accept / decline / withdraw) while the
  // gate is up. The gate must describe live state, not a stale id, so a
  // handled Offer never leaves a ghost blocker behind.
  if (state.pendingOfferApplicationId) {
    const application = (state.applications ?? []).find((entry) => entry.applicationId === state.pendingOfferApplicationId);
    if (!application || application.status !== 'offer') state.pendingOfferApplicationId = undefined;
    else { state.simulationMode = 'paused'; return '请先处理新的 Offer 通知'; }
  }
  applyDueEmployment(state, content);
  const issues = planEditIssues(state, state.weeklyPlan, content, balance);
  state.planIssues = issues;
  if (issues.length) {
    state.simulationMode = 'planning';
    state.planNotice = '本周剩余计划需要调整';
    return issues[0].message;
  }
  state.simulationMode = 'running';
  return undefined;
}
