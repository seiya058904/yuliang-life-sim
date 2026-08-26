import type { CompanyDefinition } from '../contracts';

export const officialCompanies: readonly CompanyDefinition[] = [
  { id: 'company.xinghe', contentStatus: 'official', name: '星河科技', description: '面向消费互联网的产品与运营团队。', tags: ['work', 'career'], industry: '互联网', locationId: 'location.central', jobIds: ['job.seed-office', 'job.operations-specialist', 'job.data-entry'] },
  { id: 'company.yuanwang', contentStatus: 'official', name: '远望零售', description: '覆盖线上与线下渠道的零售企业。', tags: ['work', 'career'], industry: '零售', locationId: 'location.riverside', jobIds: ['job.seed-office', 'job.customer-service', 'job.project-coordinator'] },
  { id: 'company.qiming', contentStatus: 'official', name: '启明服务', description: '为本地客户提供运营与客户服务。', tags: ['work', 'career'], industry: '服务', locationId: 'location.industrial', jobIds: ['job.seed-shop-clerk', 'job.cafe-assistant', 'job.delivery-shift'], investmentIds: ['investment.qiming-equity'] },
];
