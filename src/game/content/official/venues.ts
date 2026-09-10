import type { VenueDefinition } from '../contracts';

export const officialVenues = [
  { id: 'venue.yunting-cafe', contentStatus: 'official', name: '云庭咖啡', description: '商务咖啡馆，适合在一小时里把工作、联系人和生活重新摆到桌面上。', locationId: 'location.central', activityIds: ['activity.cafe-break'], priceRange: '¥58–98' },
  { id: 'venue.hengchuan-restaurant', contentStatus: 'official', name: '衡川餐厅', description: '不过分张扬的品质餐厅，适合商务晚餐和重要的朋友会面。', locationId: 'location.central', activityIds: ['activity.casual-meal'], priceRange: '¥380' },
  { id: 'venue.northshore-gallery', contentStatus: 'official', name: '北岸展馆', description: '北部产业区与文化展览交汇的空间，让一次看展也成为理解城市的方式。', locationId: 'location.industrial', activityIds: ['activity.industrial-design-exhibition'], priceRange: '¥280' },
  { id: 'venue.oldtown-cinema', contentStatus: 'official', name: '旧城影院', description: '旧城文化区的小型影院，保留普通影厅和特别放映两种节奏。', locationId: 'location.old-town', activityIds: ['activity.cinema'], priceRange: '¥68–160' },
  { id: 'venue.leaf-bookstore', contentStatus: 'official', name: '叶脉书店', description: '旧城文化区的小书店，适合把一段周末时间交给阅读和好奇心。', locationId: 'location.old-town', activityIds: ['activity.browse-bookstore'], priceRange: '¥55 起' },
  { id: 'venue.riverside-night-market', contentStatus: 'official', name: '临江夜市', description: '沿河展开的夜间市集，适合在一天结束后慢慢走一圈。', locationId: 'location.riverside', activityIds: ['activity.riverside-night-market'], priceRange: '¥96' },
  { id: 'venue.south-riverside-deck', contentStatus: 'official', name: '南岸江堤健身角', description: '江堤边的开放健身角，清晨有拉伸的人群和推婴儿车的邻居。', locationId: 'location.south-residential', activityIds: ['activity.riverside-stretch', 'activity.city-run'], priceRange: '免费' },
  { id: 'venue.techpark-lecture-hall', contentStatus: 'official', name: '科技园路演厅', description: '园区开放日向所有路人敞开的路演与公开课空间。', locationId: 'location.tech-park', activityIds: ['activity.park-open-class'], priceRange: '¥25' },
  { id: 'venue.oldtown-vinyl-bar', contentStatus: 'official', name: '旧城黑胶小馆', description: '午后放黑胶的小馆子，偶尔有人即兴弹一段。', locationId: 'location.old-town', activityIds: ['activity.browse-bookstore'], priceRange: '¥40 起' },
  { id: 'venue.huanliu-freight-cafe', contentStatus: 'official', name: '北部货运咖啡', description: '物流园边上唯一像样的咖啡馆，司机与调度在这里交接班。', locationId: 'location.industrial', activityIds: ['activity.cafe-break'], priceRange: '¥35 起' }
] satisfies readonly VenueDefinition[];
