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
] satisfies readonly StorylineDefinition[];
