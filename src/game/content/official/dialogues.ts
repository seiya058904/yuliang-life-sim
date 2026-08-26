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
  {
    id: 'dialogue.first-project-entry',
    contentStatus: 'official',
    name: '第一次真正的项目',
    description: '顾清邀请你从资料整理走进客户会议。',
    tags: ['career'],
    lines: [
      { id: 'opening', speakerName: '顾清', text: '这次你别只负责找资料了。' },
      { id: 'question', speakerName: '顾清', text: '客户会议你也来。' },
    ],
  },
  {
    id: 'dialogue.first-project-prep',
    contentStatus: 'official',
    name: '第一次真正的项目 · 准备',
    description: '会议前，你决定把多少时间和注意力放在这次项目上。',
    tags: ['career'],
    lines: [{ id: 'prep', speakerName: '顾清', text: '准备方式没有标准答案，关键是你知道自己为什么这样做。' }],
  },
  {
    id: 'dialogue.first-project-meeting',
    contentStatus: 'official',
    name: '第一次真正的项目 · 会议',
    description: '客户提出了一个没有准备过的问题。',
    tags: ['career'],
    lines: [{ id: 'meeting', speakerName: '顾清', text: '先别急着给结论，听听你会怎么回应。' }],
  },
  {
    id: 'dialogue.big-promotion-entry',
    contentStatus: 'official',
    name: '大促',
    description: '星桥电商宣布大型促销项目，运营团队开始重新分配工作。',
    tags: ['career'],
    lines: [
      { id: 'announcement', speakerName: '项目负责人', text: '这次大促不只是多做几张活动页，整个商品和订单节奏都会变。' },
      { id: 'choice', speakerName: '项目负责人', text: '你想加入核心项目，还是先把常规工作做好？' },
    ],
  },
  {
    id: 'dialogue.big-promotion-finish',
    contentStatus: 'official',
    name: '大促结束',
    description: '项目结束后，团队复盘这次促销带来的变化。',
    tags: ['career'],
    lines: [{ id: 'finish', speakerName: '项目负责人', text: '你这次留下的判断，已经不只是执行层面的经验了。' }],
  },
  {
    id: 'dialogue.client-poach-entry',
    contentStatus: 'official',
    name: '客户想把你挖走',
    description: '合作公司的负责人私下问你有没有考虑过换个环境。',
    tags: ['career'],
    lines: [{ id: 'question', speakerName: '合作公司负责人', text: '你有没有考虑过换个环境？' }],
  },
  {
    id: 'dialogue.employee-purchase-entry',
    contentStatus: 'official',
    name: '员工内部购买计划',
    description: '一屿生活科技开放新一批产品内部体验计划。',
    tags: ['career'],
    lines: [{ id: 'notice', speakerName: '一屿产品团队', text: '新一批产品内部体验计划开放了，你可以选择折扣购买，或者先试用一套。' }],
  },
  {
    id: 'dialogue.first-fund-purchase',
    contentStatus: 'official',
    name: '第一次买基金',
    description: '陈宇提醒你，投资是给现金安排去处，而不是寻找一个永远上涨的答案。',
    tags: ['investment', 'relationship'],
    lines: [
      { id: 'opening', speakerId: 'character.chenyu', text: '你已经开始把钱放进投资里了。先不用急着研究哪个公司会涨。' },
      { id: 'reminder', speakerId: 'character.chenyu', text: '看清楚风险、投入和现金流，再决定下一步就好。' },
    ],
  },
] satisfies readonly DialogueDefinition[];
