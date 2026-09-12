import { useState } from 'react';
import type { GameState, ViewId } from '../content/contracts';
import { contentRegistry } from '../content/registry';
import { locationForCurrentJob, locationSummary } from '../engine/locations';
import { PixelIllustration, type PixelIllustrationName } from './pixel/PixelIllustration';

const venueArt: Record<string, PixelIllustrationName> = {
  'venue.yunting-cafe': 'coffee',
  'venue.hengchuan-restaurant': 'meal',
  'venue.northshore-gallery': 'painting',
  'venue.oldtown-cinema': 'film',
  'venue.leaf-bookstore': 'book',
  'venue.riverside-night-market': 'shop',
  'venue.south-riverside-deck': 'dumbbell',
  'venue.techpark-lecture-hall': 'laptop',
  'venue.oldtown-vinyl-bar': 'record',
  'venue.huanliu-freight-cafe': 'coffee',
};

export function CityView({ game, onNavigate, onShopActivity }: { game: GameState; onNavigate: (view: ViewId) => void; onShopActivity: (category?: string, activityId?: string) => void }) {
  const [district, setDistrict] = useState('all');
  const home = contentRegistry.housing.find(entry => entry.id === game.housing.housingId);
  const jobLocation = locationForCurrentJob(game, contentRegistry);
  const locations = locationSummary(contentRegistry);
  const selected = locations.find(entry => entry.id === district);
  const venues = (contentRegistry.venues ?? []).filter(venue => district === 'all' || venue.locationId === district);
  const ambientLog = (game.ambientLog ?? []).slice(-6);
  return <section className="city-workspace" aria-label="城市与地点">
    <header className="section-heading compact"><h1>城市与地点</h1><p>在澄川市发现去处，再把活动放进本周计划。</p></header>
    <nav className="district-nav" aria-label="城市地区"><button className="secondary-button" aria-pressed={district === 'all'} onClick={() => setDistrict('all')}>全城场所</button>{locations.map(location => <button className="secondary-button" key={location.id} aria-pressed={district === location.id} onClick={() => setDistrict(location.id)}>{location.name}{location.id === home?.locationId ? ' · 居住' : location.id === jobLocation?.id ? ' · 工作' : ''}</button>)}</nav>
    {selected ? <div className="district-summary"><PixelIllustration name="city" size={64} /><div><h2>{selected.name} · {selected.region}</h2><p>{selected.description}</p><p className="muted">发展阶段 {game.locationDevelopment?.[selected.id] ?? 0}/5 · 交通系数 ×{selected.transportCostMultiplier.toFixed(2)} · 已访问 {game.locationVisits?.[selected.id] ?? 0} 次</p></div></div> : <p className="district-summary">当前居住：{locations.find(entry => entry.id === home?.locationId)?.name ?? '暂无'} · 工作地点：{jobLocation?.name ?? '暂无'}。选择地区可查看交通与访问记录。</p>}
    <section aria-label="城市场所"><div className="venue-list">{venues.map(venue => {
      const location = locations.find(entry => entry.id === venue.locationId);
      const activities = venue.activityIds.map(id => contentRegistry.activities?.find(entry => entry.id === id)).filter(entry => entry !== undefined);
      const art = venueArt[venue.id] ?? 'city';
      return <article className="venue-row" key={venue.id}>
        <PixelIllustration name={art} size={64} />
        <div className="venue-copy"><span className="muted">{location?.name} · {venue.priceRange ?? '按活动计费'}</span><h2>{venue.name}</h2><p>{venue.description}</p><p className="venue-activities">可承载：{activities.map(activity => activity.name).join('、')}</p><button className="secondary-button" onClick={() => onShopActivity(activities[0]?.category, activities[0]?.id)}>去安排活动</button></div>
      </article>;
    })}</div>{venues.length === 0 && <p className="muted">这个地区暂无可安排活动的场所。可以切换到全城场所继续浏览。</p>}</section>
    <details className="city-history" aria-label="城市见闻"><summary>城市见闻 · {ambientLog.length} 条</summary>{ambientLog.length ? <div className="item-list">{ambientLog.map(entry => <div className="item-row" key={`${entry.day}-${entry.text}`}><span>第 {entry.day} 天</span><p>{entry.text}</p></div>)}</div> : <p className="muted">城市开始运行后，这里会留下偶尔发生的见闻。</p>}</details>
    <button className="text-button" onClick={() => onNavigate('life')}>返回生活安排本周</button>
  </section>;
}
