import type { HTMLAttributes, ReactNode } from 'react';

export function SegmentMeter({ value, max = 100, segments = 8, label }: { value: number; max?: number; segments?: number; label?: string }) {
  const filled = Math.round(Math.max(0, Math.min(1, value / max)) * segments);
  return <span className="segment-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>{Array.from({ length: segments }, (_, index) => <i className={index < filled ? 'filled' : ''} key={index} />)}</span>;
}

export function PixelPanel({ children, className = '', ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  return <section className={`pixel-panel ${className}`.trim()} {...props}>{children}</section>;
}
