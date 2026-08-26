import type { DialogueDefinition } from '../contracts';

export const officialDialogues = [
  {
    id: 'dialogue.remote-connection',
    contentStatus: 'official',
    name: '远程连接对话',
    description: '徐可在一次工作之外的联系中，认真了解你的近况。',
    tags: ['relationship', 'career'],
    lines: [
      { id: 'opening', speakerId: 'character.xuke', text: '最近这段时间，你好像一直在处理很复杂的事情。' },
      { id: 'question', speakerId: 'character.xuke', text: '如果不只看工作，你希望接下来给生活留下什么？' },
    ],
  },
  {
    id: 'dialogue.warehouse-office-entry',
    contentStatus: 'official',
    name: '从仓库走进办公室',
    description: '陈宇注意到你在一线工作中留下的经验，问你是否愿意接触调度。',
    tags: ['career', 'logistics'],
    lines: [
      { id: 'observation', speakerId: 'character.chenyu', text: '你最近盘点和记录做得挺细。' },
      { id: 'question', speakerId: 'character.chenyu', text: '有没有想过以后做调度？' },
    ],
  },
  {
    id: 'dialogue.warehouse-office-follow-up',
    contentStatus: 'official',
    name: '调度部门的第一次接触',
    description: '你开始偶尔帮调度部门整理数据，办公室的工作不再只是想象。',
    tags: ['career', 'logistics'],
    lines: [
      { id: 'follow-up', speakerId: 'character.chenyu', text: '先从整理调度数据开始，你会更快知道自己是否喜欢这条路。' },
    ],
  },
] satisfies readonly DialogueDefinition[];
