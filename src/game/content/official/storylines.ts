import type { StorylineDefinition } from '../contracts';

export const officialStorylines = [
  {
    id: 'storyline.remote-connection',
    contentStatus: 'official',
    name: '远程连接',
    description: '一次工作之外的联系，慢慢变成可以继续聊下去的关系。',
    tags: ['relationship', 'career'],
    initialStageId: 'invite',
    stages: [
      {
        id: 'invite',
        dialogueId: 'dialogue.remote-connection',
        branches: [
          { id: 'meet', text: '约个时间聊聊', nextStageId: 'follow-up', effects: [{ type: 'relation', characterId: 'character.xuke', amount: 6 }, { type: 'attribute', attribute: 'network', amount: 1 }], opportunity: { jobId: 'job.delivery-shift', companyId: 'company.qiming', route: 'referral', source: '徐可的朋友推荐', expiresInDays: 14, salaryRange: [76, 76] } },
          { id: 'wait', text: '先放一放', nextStageId: 'follow-up', effects: [{ type: 'relation', characterId: 'character.xuke', amount: 2 }] },
        ],
      },
      {
        id: 'follow-up',
        branches: [{ id: 'close', text: '把这段联系留在生活里', nextStageId: 'complete', effects: [{ type: 'relation', characterId: 'character.xuke', amount: 4 }] }],
      },
      { id: 'complete' },
    ],
  },
  {
    id: 'storyline.warehouse-to-office',
    contentStatus: 'official',
    name: '从仓库走进办公室',
    description: '从环流物流的一线工作开始，逐步接触调度与办公室岗位。',
    tags: ['career', 'logistics'],
    conditions: { type: 'current_job', jobId: 'job.huanliu-warehouse-assistant' },
    initialStageId: 'conversation',
    stages: [
      {
        id: 'conversation',
        dialogueId: 'dialogue.warehouse-office-entry',
        branches: [
          {
            id: 'interested',
            text: '有兴趣',
            nextStageId: 'internal-contact',
            effects: [{ type: 'relation', characterId: 'character.chenyu', amount: 4 }, { type: 'attribute', attribute: 'professional', amount: 1 }, { type: 'attribute', attribute: 'knowledge', amount: 1 }],
            opportunity: { jobId: 'job.huanliu-dispatch-coordinator', companyId: 'company.huanliu', route: 'internal', source: '环流物流内部调度机会', expiresInDays: 28, salaryRange: [269, 315] },
          },
          { id: 'not-now', text: '暂时没有', nextStageId: 'complete', effects: [{ type: 'relation', characterId: 'character.chenyu', amount: 1 }] },
          { id: 'learn-more', text: '我想了解工作内容', nextStageId: 'internal-contact', effects: [{ type: 'relation', characterId: 'character.chenyu', amount: 2 }] },
        ],
      },
      {
        id: 'internal-contact',
        dialogueId: 'dialogue.warehouse-office-follow-up',
        branches: [{ id: 'keep-learning', text: '先从数据整理开始', nextStageId: 'complete', effects: [{ type: 'attribute', attribute: 'knowledge', amount: 1 }] }],
      },
      { id: 'complete' },
    ],
  },
  {
    id: 'storyline.first-real-project',
    contentStatus: 'official',
    name: '第一次真正的项目',
    description: '从研究助理的资料工作走进客户会议，把分析变成可被使用的判断。',
    tags: ['career'],
    conditions: { type: 'any', conditions: [{ type: 'current_job', jobId: 'job.research-assistant' }, { type: 'current_job', jobId: 'job.business-analysis-assistant' }] },
    initialStageId: 'invite',
    stages: [
      {
        id: 'invite',
        dialogueId: 'dialogue.first-project-entry',
        branches: [
          { id: 'join', text: '参加客户会议', nextStageId: 'prepare', effects: [{ type: 'relation', characterId: 'character.guqing', amount: 3 }] },
          { id: 'listen', text: '先听听安排', nextStageId: 'prepare', effects: [{ type: 'relation', characterId: 'character.guqing', amount: 1 }] },
        ],
      },
      {
        id: 'prepare',
        dialogueId: 'dialogue.first-project-prep',
        branches: [
          { id: 'deep-prep', text: '多花 2h 准备', nextStageId: 'meeting', effects: [{ type: 'attribute', attribute: 'professional', amount: 2 }] },
          { id: 'normal-prep', text: '正常准备', nextStageId: 'meeting', effects: [{ type: 'attribute', attribute: 'knowledge', amount: 1 }] },
          { id: 'ask-guqing', text: '找顾清请教', nextStageId: 'meeting', effects: [{ type: 'relation', characterId: 'character.guqing', amount: 3 }, { type: 'attribute', attribute: 'communication', amount: 1 }] },
        ],
      },
      {
        id: 'meeting',
        dialogueId: 'dialogue.first-project-meeting',
        branches: [
          { id: 'data-judgment', text: '根据现有数据给出初步判断', nextStageId: 'complete', effects: [{ type: 'attribute', attribute: 'professional', amount: 3 }, { type: 'stat', stat: 'reputation', amount: 2 }, { type: 'relation', characterId: 'character.guqing', amount: 3 }, { type: 'cash', amount: 500 }, { type: 'set_flag', flag: 'consulting_project_completed' }] },
          { id: 'research-plan', text: '承认信息不足并提出调查方式', nextStageId: 'complete', effects: [{ type: 'attribute', attribute: 'knowledge', amount: 3 }, { type: 'stat', stat: 'reputation', amount: 2 }, { type: 'relation', characterId: 'character.guqing', amount: 3 }, { type: 'cash', amount: 500 }, { type: 'set_flag', flag: 'consulting_project_completed' }] },
          { id: 'ask-guqing', text: '请顾清补充', nextStageId: 'complete', effects: [{ type: 'attribute', attribute: 'communication', amount: 3 }, { type: 'stat', stat: 'reputation', amount: 2 }, { type: 'relation', characterId: 'character.guqing', amount: 3 }, { type: 'cash', amount: 500 }, { type: 'set_flag', flag: 'consulting_project_completed' }] },
        ],
      },
      { id: 'complete' },
    ],
  },
] satisfies readonly StorylineDefinition[];
