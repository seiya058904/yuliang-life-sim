import type { AcquisitionHint, CareerExperienceId, CareerExperienceStage, GameState, JobDefinition } from '../content/contracts';
import { appendLifeRecord } from './lifeHistory';

export const CAREER_EXPERIENCE_IDS: readonly CareerExperienceId[] = ['office', 'operations', 'customer_service', 'retail', 'logistics', 'data', 'project', 'management', 'media', 'finance'];

const stageThresholds: readonly [number, CareerExperienceStage][] = [[0, '暂无'], [1, '基础'], [21, '熟悉'], [61, '扎实'], [121, '丰富']];
const qualificationByExperience: Readonly<Record<CareerExperienceId, string>> = {
  office: 'office_basics', operations: 'operations_foundation', customer_service: 'client_service_experience', retail: 'retail_operations_experience',
  logistics: 'logistics_experience', data: 'data_analysis_foundation', project: 'project_coordination', management: 'people_management_basics', media: 'media_production_experience', finance: 'investment_basics',
};
const experienceLabels: Readonly<Record<CareerExperienceId, string>> = {
  office: '办公室', operations: '运营', customer_service: '客户服务', retail: '零售', logistics: '物流', data: '数据', project: '项目', management: '管理', media: '传媒', finance: '金融',
};

export function careerExperienceStage(value: number): CareerExperienceStage {
  return [...stageThresholds].reverse().find(([threshold]) => value >= threshold)?.[1] ?? '暂无';
}

export function careerExperienceLabel(id: CareerExperienceId): string { return experienceLabels[id]; }

export function qualificationForExperience(id: CareerExperienceId): string { return qualificationByExperience[id]; }

export interface CareerExperienceResult {
  experience: Partial<Record<CareerExperienceId, number>>;
  qualificationIds: string[];
  newQualificationIds: string[];
  newStages: CareerExperienceStage[];
}

export function applyCareerExperience(state: GameState, tags: readonly CareerExperienceId[], amount: number): CareerExperienceResult {
  const before = { ...(state.careerExperience ?? {}) };
  state.careerExperience ??= {};
  state.qualifications ??= [];
  const newStages: CareerExperienceStage[] = [];
  const newQualificationIds: string[] = [];
  for (const tag of tags) {
    const current = state.careerExperience[tag] ?? 0;
    const next = current + Math.max(0, amount);
    state.careerExperience[tag] = next;
    const previousStage = careerExperienceStage(current);
    const nextStage = careerExperienceStage(next);
    if (nextStage !== previousStage) {
      newStages.push(nextStage);
      const recordId = `career-experience.${tag}.${nextStage}`;
      state.lifeHistory = appendLifeRecord(state.lifeHistory ?? [], { id: recordId, day: state.time.day, category: 'career', title: `${careerExperienceLabel(tag)}经验达到${nextStage}`, detail: `${before[tag] ?? 0} → ${next} 天`, sourceId: tag });
      state.monthlyHighlights = [...(state.monthlyHighlights ?? []).filter((entry) => entry.id !== recordId), { id: recordId, kind: 'attribute_milestone', day: state.time.day, label: `${careerExperienceLabel(tag)}经验 · ${nextStage}`, sourceId: tag }];
    }
    if (current < 1 && next >= 1 && !state.qualifications.includes(qualificationByExperience[tag])) {
      const qualificationId = qualificationByExperience[tag];
      state.qualifications.push(qualificationId);
      newQualificationIds.push(qualificationId);
      const recordId = `qualification.${qualificationId}`;
      state.lifeHistory = appendLifeRecord(state.lifeHistory ?? [], { id: recordId, day: state.time.day, category: 'career', title: `获得${qualificationId}资格`, detail: `通过${careerExperienceLabel(tag)}工作经验获得`, sourceId: qualificationId });
      state.monthlyHighlights = [...(state.monthlyHighlights ?? []).filter((entry) => entry.id !== recordId), { id: recordId, kind: 'attribute_milestone', day: state.time.day, label: `获得资格 · ${qualificationId}`, sourceId: qualificationId }];
    }
  }
  return { experience: state.careerExperience, qualificationIds: state.qualifications, newQualificationIds, newStages };
}

export function requirementForJob(job: JobDefinition, state: GameState): AcquisitionHint[] {
  const hints: AcquisitionHint[] = [];
  for (const [id, required] of Object.entries(job.experienceRequired ?? {}) as [CareerExperienceId, number][]) {
    const current = state.careerExperience?.[id] ?? 0;
    if (current < required) hints.push({ requirementId: `experience:${id}`, label: `${careerExperienceLabel(id)}经验`, actionLabel: '通过工作积累', destinationView: 'work', targetId: job.id, currentValue: current, requiredValue: required });
  }
  for (const qualificationId of job.qualificationRequired ?? []) {
    if (!state.qualifications?.includes(qualificationId)) hints.push({ requirementId: `qualification:${qualificationId}`, label: `获得${qualificationId}资格`, actionLabel: '查看职业安排', destinationView: 'work', targetId: job.id });
  }
  return hints;
}

export function careerRequirementsSatisfied(job: JobDefinition, state: GameState): boolean { return requirementForJob(job, state).length === 0; }
