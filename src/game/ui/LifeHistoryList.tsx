import { useState } from 'react';
import type { LifeRecordEntry } from '../content/contracts';
import { displaySettlementHighlightLabel } from './pixel/displayNames';

const categoryLabels: Record<LifeRecordEntry['category'], string> = {
  career: '职业',
  purchase: '消费',
  service: '服务',
  activity: '活动',
  housing: '住房',
  relationship: '关系',
  event: '事件',
  business: '企业',
  asset: '资产',
  investment: '投资',
};

const money = (value: number) => `${value >= 0 ? '+' : '-'}¥${Math.abs(Math.round(value)).toLocaleString('zh-CN')}`;

/** Canonical history is permanent, but the UI must never render an unbounded list. */
const PAGE_SIZE = 40;

export function LifeHistoryList({ entries }: { entries: readonly LifeRecordEntry[] }) {
  const [filter, setFilter] = useState<'all' | LifeRecordEntry['category']>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const rows = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => filter === 'all' || entry.category === filter)
    .sort((left, right) => right.entry.day - left.entry.day || right.index - left.index);
  const filters = ['all', ...Array.from(new Set(entries.map((entry) => entry.category)))] as const;
  const visibleRows = rows.slice(0, visibleCount);

  return <section className="detail-panel life-history" aria-label="人生记录"><h2>人生记录</h2><div className="filter-row" aria-label="人生记录分类">{filters.map((category) => <button key={category} className={filter === category ? 'filter-button selected' : 'filter-button'} aria-pressed={filter === category} onClick={() => { setFilter(category); setVisibleCount(PAGE_SIZE); }}>{category === 'all' ? '全部' : categoryLabels[category]}</button>)}</div>{rows.length === 0 ? <p>当前分类还没有值得记录的人生节点。</p> : <><p className="muted">共 {rows.length} 条，已显示最近 {visibleRows.length} 条</p><div className="item-list">{visibleRows.map(({ entry }) => <div className="item-row" key={entry.id}><div><span className="job-kind">{categoryLabels[entry.category]} · 第 {entry.day} 天</span><h2>{displaySettlementHighlightLabel(entry.title)}</h2>{entry.detail && <p>{displaySettlementHighlightLabel(entry.detail)}</p>}</div>{entry.amount !== undefined && <strong>{money(entry.amount)}</strong>}</div>)}</div>{visibleRows.length < rows.length && <button className="secondary-button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>加载更多（还有 {rows.length - visibleRows.length} 条）</button>}</>}</section>;
}
