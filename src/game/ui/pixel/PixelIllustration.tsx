import type { SVGProps } from 'react';

export type PixelIllustrationName =
  | 'mascot' | 'life' | 'sleep' | 'work' | 'book' | 'coin' | 'controller' | 'users'
  | 'suitcase' | 'house' | 'cash' | 'chart' | 'bag' | 'mail' | 'flag' | 'tag';

/**
 * Chunky monochrome rect-based scenes on a 16×16 pixel grid.
 * Ink is currentColor; interior details knock out via --il-knock so the
 * same asset works on dark panels (ink white) and inverted light panels
 * (ink near-black, --il-knock set to the light surface by CSS).
 */
type Cell = [x: number, y: number, w: number, h: number, knock?: 0 | 1];

const scenes: Record<PixelIllustrationName, readonly Cell[]> = {
  mascot: [
    [7, 0, 2, 2], [6, 1, 4, 1],
    [3, 3, 10, 9],
    [5, 6, 2, 2, 1], [9, 6, 2, 2, 1],
    [6, 10, 4, 1, 1],
    [1, 6, 2, 2], [13, 6, 2, 2],
    [4, 13, 8, 3],
  ],
  life: [
    [2, 2, 9, 7], [3, 3, 7, 5, 1], [5, 5, 2, 2],
    [5, 9, 3, 2],
    [1, 11, 14, 2],
    [2, 13, 2, 3], [12, 13, 2, 3],
    [12, 7, 3, 4], [12, 6, 1, 1],
  ],
  sleep: [
    [1, 12, 14, 3], [1, 11, 14, 1, 1],
    [2, 9, 4, 2],
    [7, 8, 3, 3], [9, 6, 3, 2],
    [11, 2, 4, 1], [12, 4, 2, 1], [10, 5, 2, 1],
  ],
  work: [
    [6, 1, 4, 2], [7, 2, 2, 1, 1],
    [2, 4, 12, 10],
    [7, 8, 2, 2, 1],
    [2, 6, 12, 1, 1],
  ],
  book: [
    [5, 2, 6, 2], [9, 2, 1, 1, 1],
    [4, 5, 9, 2],
    [3, 8, 11, 2],
    [2, 11, 13, 2],
    [1, 14, 15, 1],
  ],
  coin: [
    [4, 11, 8, 2], [5, 8, 8, 2], [4, 5, 8, 2],
    [6, 6, 2, 1, 1], [8, 9, 2, 1, 1], [6, 12, 2, 1, 1],
    [12, 1, 3, 2], [9, 2, 2, 2],
  ],
  controller: [
    [1, 6, 5, 6], [10, 6, 5, 6], [5, 7, 6, 4],
    [3, 7, 1, 4, 1], [2, 8, 3, 1, 1],
    [12, 7, 1, 1, 1], [13, 9, 1, 1, 1], [11, 9, 1, 1, 1],
  ],
  users: [
    [3, 2, 4, 4], [2, 8, 6, 6],
    [9, 3, 4, 4], [8, 9, 6, 5],
    [4, 4, 1, 1, 1], [10, 5, 1, 1, 1],
  ],
  suitcase: [
    [6, 1, 4, 2], [7, 2, 2, 1, 1],
    [3, 3, 10, 12],
    [5, 3, 1, 12, 1], [10, 3, 1, 12, 1],
    [3, 9, 10, 1, 1],
  ],
  house: [
    [7, 0, 2, 1], [6, 1, 4, 1], [5, 2, 6, 1], [4, 3, 8, 1], [3, 4, 10, 2],
    [4, 6, 8, 9],
    [6, 7, 4, 2, 1], [6, 11, 4, 4, 1],
  ],
  cash: [
    [1, 3, 14, 10],
    [2, 4, 12, 8, 1],
    [6, 5, 4, 6], [7, 7, 2, 2, 1],
    [3, 4, 1, 1, 1], [12, 4, 1, 1, 1], [3, 11, 1, 1, 1], [12, 11, 1, 1, 1],
  ],
  chart: [
    [1, 14, 14, 1],
    [2, 9, 3, 5], [7, 5, 3, 9], [12, 7, 2, 7],
    [8, 3, 1, 1], [9, 2, 1, 1], [10, 1, 2, 1],
  ],
  bag: [
    [4, 3, 2, 3], [10, 3, 2, 3], [5, 4, 6, 1, 1],
    [2, 6, 12, 10],
    [5, 9, 2, 2, 1], [9, 9, 2, 2, 1], [7, 13, 2, 1, 1],
  ],
  mail: [
    [1, 3, 14, 10],
    [2, 4, 12, 4, 1],
    [2, 4, 3, 1], [5, 5, 3, 1], [8, 6, 3, 1],
    [11, 10, 3, 2], [12, 11, 1, 1, 1],
  ],
  flag: [
    [3, 1, 2, 14],
    [5, 2, 9, 4], [7, 6, 7, 3],
    [9, 3, 2, 2, 1],
  ],
  tag: [
    [1, 4, 9, 9], [3, 6, 2, 2, 1],
    [12, 2, 2, 2], [14, 5, 1, 1], [11, 6, 2, 2], [13, 9, 1, 1],
  ],
};

export function PixelIllustration({ name, size = 64, ...props }: { name: PixelIllustrationName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      className={`pixel-illustration il-${name}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {scenes[name].map(([x, y, w, h, knock], index) => (
        <rect key={index} x={x} y={y} width={w} height={h} fill={knock ? 'var(--il-knock, #090909)' : 'currentColor'} />
      ))}
    </svg>
  );
}
