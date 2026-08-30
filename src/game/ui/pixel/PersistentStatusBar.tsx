import type { GameState, ViewId } from '../../content/contracts';
import { getAttribute } from '../../engine/attributes';
import { PixelIllustration } from './PixelIllustration';
import { SegmentMeter } from './PixelUI';

export function PersistentStatusBar({ game, onNavigate }: { game: GameState; onNavigate?: (view: ViewId) => void }) {
  const entries = [
    ['体能', getAttribute(game, 'fitness')],
    ['心情', getAttribute(game, 'mood')],
    ['专业', getAttribute(game, 'professional')],
    ['知识', getAttribute(game, 'knowledge')],
    ['人脉', getAttribute(game, 'network')],
  ] as const;
  return <aside className="persistent-status" role="region" aria-label="角色状态">
    <span className="pixel-avatar"><PixelIllustration name="mascot" size={56} /></span>
    {entries.map(([label, value]) => <div className="persistent-stat" key={label}><span>{label}</span><SegmentMeter value={value} segments={6} label={`${label} ${value}`} /><strong>{Math.round(value)}</strong></div>)}
    <button className="status-detail" onClick={() => onNavigate?.('profile')}>属性详情 ▸</button>
  </aside>;
}
