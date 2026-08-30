import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const pixelClockGlyphs: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00110', '01110', '00110', '00110', '00110', '00110', '11111'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ':': ['000', '010', '010', '000', '010', '010', '000'],
  '?': ['11110', '00001', '00010', '00100', '00100', '00000', '00100'],
};

export function PixelClock({ value, size = 'hero', className = '', ...props }: { value: string; size?: 'hero' | 'compact'; className?: string } & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>) {
  return <span className={['pixel-clock', `pixel-clock-${size}`, className].filter(Boolean).join(' ')} aria-label={value} {...props}>
    <span className="sr-only">{value}</span>
    <span className="pixel-clock-glyphs" aria-hidden="true">
      {Array.from(value).map((character, index) => {
        const rows = pixelClockGlyphs[character] ?? pixelClockGlyphs['?'];
        const columns = rows[0].length;
        return <span className={`pixel-clock-glyph${character === ':' ? ' pixel-clock-separator' : ''}`} style={{ '--pixel-clock-columns': columns } as CSSProperties} key={`${character}-${index}`}>
          {rows.flatMap((row, rowIndex) => Array.from(row).map((cell, columnIndex) => <i className={cell === '1' ? 'filled' : undefined} key={`${rowIndex}-${columnIndex}`} />))}
        </span>;
      })}
    </span>
  </span>;
}

export function SegmentMeter({ value, max = 100, segments = 8, label }: { value: number; max?: number; segments?: number; label?: string }) {
  const filled = Math.round(Math.max(0, Math.min(1, value / max)) * segments);
  return <span className="segment-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>{Array.from({ length: segments }, (_, index) => <i className={index < filled ? 'filled' : ''} key={index} />)}</span>;
}

export function PixelPanel({ children, className = '', ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  return <section className={`pixel-panel ${className}`.trim()} {...props}>{children}</section>;
}
