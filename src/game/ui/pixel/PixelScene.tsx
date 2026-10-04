import { memo } from 'react';
import { PixelIllustration, type PixelIllustrationName } from './PixelIllustration';

/** Integer-grid scenery belongs to the current activity. The sky follows the game clock. */
export const PixelScene = memo(function PixelScene({ illustration, hour, running, kind }: {
  illustration: PixelIllustrationName; hour: number; running: boolean; kind: string;
}) {
  const night = hour < 6 || hour >= 19;
  const outdoor = ['mountain', 'city', 'dumbbell', 'users'].includes(illustration);
  return <div className={`living-scene${running ? ' is-running' : ''}${night ? ' is-night' : ''}${outdoor ? ' is-outdoor' : ''}`} data-activity-kind={kind} aria-hidden="true">
    <svg className="living-scene-space" data-pixel-scene="true" viewBox="0 0 192 80" shapeRendering="crispEdges" fill="currentColor">
      <path d="M0 71h192v1H0zM0 76h22v1H0zm32 0h38v1H32zm49 0h12v1H81zm56 0h40v1h-40z" opacity=".4" />
      <g className="scene-window">
        <path d="M116 8h58v44h-58z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M144 8h2v44h-2zM116 29h58v2h-58z" opacity=".5" />
        <path d="M120 43h10v8h-10zm12-8h9v16h-9zm17 6h8v10h-8zm10-5h10v15h-10z" opacity={night ? '.8' : '.3'} />
        {night ? <path d="M154 14h6v2h-2v4h-4zM124 17h2v2h-2zM164 23h2v2h-2z" /> : <rect x={120 + Math.round(Math.max(0, Math.min(1, (hour - 6) / 13)) * 42)} y="16" width="6" height="6" />}
      </g>
      {outdoor ? <g opacity=".55"><path d="M12 60h18v11H12zm3-8h12v8H15zm24-10h14v29H39zm3-6h8v6h-8zM171 60h12v11h-12z" /><path d="M16 62h3v3h-3zm8 0h3v3h-3zM43 45h2v3h-2zm5 0h2v3h-2z" fill="#090909" /></g> : <g opacity=".55"><path d="M12 55h38v2H12zm3 2h2v14h-2zm30 0h2v14h-2zM24 50h8v5h-8zM16 22h20v16H16z" /><path d="M18 24h16v12H18z" fill="#090909" /><path d="M20 32h5v2h-5zm5-4h7v6h-7z" /><path d="M180 22h2v48h-2zm-6 48h14v1h-14zm1-48h12l-2-6h-8z" /></g>}
    </svg>
    <PixelIllustration name={illustration} size={80} className="living-scene-person" />
    <span className="scene-time">{night ? '夜' : '日'}</span>
  </div>;
});

export function PixelDistrict({ level = 0, variant = 0 }: { level?: number; variant?: number }) {
  return <svg className="pixel-district" data-pixel-scene="true" viewBox="0 0 64 32" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
    <path d="M0 29h64v1H0zM3 17h12v12H3zm2-4h8v4H5zM20 7h16v22H20zm3-4h10v4H23zM41 15h17v14H41zm3-4h11v4H44z" opacity=".8" />
    {Array.from({ length: 12 }, (_, i) => <rect key={i} x={i < 6 ? 23 + (i % 2) * 7 : 44 + (i % 2) * 7} y={(i < 6 ? 10 : 18) + Math.floor((i % 6) / 2) * 4} width="3" height="2" fill={i < level + variant ? 'currentColor' : 'var(--ui-surface)'} />)}
  </svg>;
}
