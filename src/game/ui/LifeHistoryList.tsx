import type { LifeRecordEntry } from '../content/contracts';

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

export function LifeHistoryList({ entries }: { entries: readonly LifeRecordEntry[] }) {
  const rows = entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => right.entry.day - left.entry.day || right.index - left.index);

  return <section className="detail-panel life-history" aria-label="人生记录"><h2>人生记录</h2>{rows.length === 0 ? <p>还没有值得记录的人生节点。工作、消费、搬家、关系和财富动作会在这里留下痕迹。</p> : <div className="item-list">{rows.map(({ entry }) => <div className="item-row" key={entry.id}><div><span className="job-kind">{categoryLabels[entry.category]} · 第 {entry.day} 天</span><h2>{entry.title}</h2>{entry.detail && <p>{entry.detail}</p>}</div>{entry.amount !== undefined && <strong>{money(entry.amount)}</strong>}</div>)}</div>}</section>;
}
