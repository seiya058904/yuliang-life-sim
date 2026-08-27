import type { GameState } from '../../content/contracts';
import { SegmentMeter } from './PixelUI';

export function PersistentStatusBar({ game }: { game: GameState }) {
  const attributes = game.attributes;
  const entries = [
    ['体能', attributes?.fitness ?? game.ability],
    ['心情', attributes?.mood ?? 50],
    ['专业', attributes?.professional ?? game.ability],
    ['知识', attributes?.knowledge ?? game.ability],
    ['人脉', attributes?.network ?? 0],
  ] as const;
  return <aside className="persistent-status" role="region" aria-label="角色状态">
    <div className="pixel-avatar" aria-hidden="true">余</div>
    {entries.map(([label, value]) => <div className="persistent-stat" key={label}><span>{label}</span><SegmentMeter value={value} label={`${label} ${value}`} /><strong>{Math.round(value)}</strong></div>)}
    <span className="status-detail">属性详情 ▸</span>
  </aside>;
}
