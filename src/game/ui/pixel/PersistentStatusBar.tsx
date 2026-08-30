import type { GameState, ViewId } from '../../content/contracts';
import { getAttribute } from '../../engine/attributes';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { PixelIllustration } from './PixelIllustration';
import { SegmentMeter } from './PixelUI';

export function PersistentStatusBar({ game, onNavigate }: { game: GameState; onNavigate?: (view: ViewId) => void }) {
  const entries = [
    ['体能', 'bolt', getAttribute(game, 'fitness')],
    ['心情', 'smile', getAttribute(game, 'mood')],
    ['专业', 'career', getAttribute(game, 'professional')],
    ['知识', 'book', getAttribute(game, 'knowledge')],
    ['人脉', 'users', getAttribute(game, 'network')],
  ] as const;
  return <aside className="persistent-status" role="region" aria-label="角色状态">
    <span className="pixel-avatar"><PixelIllustration name="mascot" size={56} /></span>
    {entries.map(([label, icon, value]) => <div className="persistent-stat" key={label}><PixelIcon name={icon as PixelIconName} size={16} data-attribute-icon={label} /><span>{label}</span><SegmentMeter value={value} segments={6} label={`${label} ${value}`} /><strong>{Math.round(value)}</strong></div>)}
    <button className="status-detail" onClick={() => onNavigate?.('profile')}>属性详情 ▸</button>
  </aside>;
}
