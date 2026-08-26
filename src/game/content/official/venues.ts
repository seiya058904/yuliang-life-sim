import type { VenueDefinition } from '../contracts';

export const officialVenues = [
  { id: 'venue.yunting-cafe', contentStatus: 'official', name: '云庭咖啡', description: '商务咖啡馆，适合在一小时里把工作、联系人和生活重新摆到桌面上。', locationId: 'location.central', activityIds: ['activity.cafe-break'], priceRange: '¥58–98' },
  { id: 'venue.hengchuan-restaurant', contentStatus: 'official', name: '衡川餐厅', description: '不过分张扬的品质餐厅，适合商务晚餐和重要的朋友会面。', locationId: 'location.central', activityIds: ['activity.casual-meal'], priceRange: '¥380' },
  { id: 'venue.northshore-gallery', contentStatus: 'official', name: '北岸展馆', description: '北部产业区与文化展览交汇的空间，让一次看展也成为理解城市的方式。', locationId: 'location.industrial', activityIds: ['activity.industrial-design-exhibition'], priceRange: '¥280' },
  { id: 'venue.oldtown-cinema', contentStatus: 'official', name: '旧城影院', description: '旧城文化区的小型影院，保留普通影厅和特别放映两种节奏。', locationId: 'location.old-town', activityIds: ['activity.cinema'], priceRange: '¥68–160' },
  { id: 'venue.leaf-bookstore', contentStatus: 'official', name: '叶脉书店', description: '旧城文化区的小书店，适合把一段周末时间交给阅读和好奇心。', locationId: 'location.old-town', activityIds: ['activity.browse-bookstore'], priceRange: '¥55 起' },
] satisfies readonly VenueDefinition[];
