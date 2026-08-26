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
] satisfies readonly DialogueDefinition[];
