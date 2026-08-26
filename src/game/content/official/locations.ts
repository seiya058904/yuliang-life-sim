import type { LocationDefinition } from '../contracts';

export const officialLocations = [
  { id: 'location.central', contentStatus: 'official', name: '中央区', description: '公司、商店与公共交通最密集的区域。', tags: ['city', 'work'], region: '澄川市', transportCostMultiplier: 1 },
  { id: 'location.riverside', contentStatus: 'official', name: '临江区', description: '生活节奏较慢，住房与休闲空间更充足。', tags: ['city', 'life'], region: '澄川市', transportCostMultiplier: 1.12 },
  { id: 'location.industrial', contentStatus: 'official', name: '北部产业区', description: '仓储、物流和制造业集中的区域。', tags: ['city', 'work'], region: '澄川市', transportCostMultiplier: 1.2 },
] satisfies readonly LocationDefinition[];
