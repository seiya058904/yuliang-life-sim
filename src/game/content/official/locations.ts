import type { LocationDefinition } from '../contracts';

export const officialLocations = [
  { id: 'location.central', contentStatus: 'official', name: '中央区', description: '公司、商店与公共交通最密集的区域。', tags: ['city', 'work'], region: '澄川市', transportCostMultiplier: 1 },
  { id: 'location.riverside', contentStatus: 'official', name: '临江区', description: '生活节奏较慢，住房与休闲空间更充足。', tags: ['city', 'life'], region: '澄川市', transportCostMultiplier: 1.12 },
  { id: 'location.industrial', contentStatus: 'official', name: '北部产业区', description: '仓储、物流和制造业集中的区域。', tags: ['city', 'work'], region: '澄川市', transportCostMultiplier: 1.2 },
  { id: 'location.old-town', contentStatus: 'official', name: '旧城文化区', description: '老街、展馆和小型演出空间聚集的区域，适合放慢脚步。', tags: ['city', 'life', 'leisure'], region: '澄川市', transportCostMultiplier: 1.08 },
  { id: 'location.south-residential', contentStatus: 'official', name: '南岸居住区', description: '沿江展开的生活片区，操场、江堤和早点摊构成了早晨的节奏。', tags: ['city', 'life'], region: '澄川市', transportCostMultiplier: 1.1 },
  { id: 'location.tech-park', contentStatus: 'official', name: '澄川科技园', description: '新区的产业园区，写字楼、路演厅和园区食堂组成了另一种城市节拍。', tags: ['city', 'work'], region: '澄川市', transportCostMultiplier: 1.15 },
] satisfies readonly LocationDefinition[];
