import type { SVGProps } from 'react';

export type PixelIconName = 'home' | 'career' | 'shop' | 'wealth' | 'social' | 'city' | 'profile' | 'cash' | 'calendar' | 'clock' | 'settings';

const paths: Record<PixelIconName, string[]> = {
  home: ['M3 10 12 3l9 7v10h-6v-6H9v6H3Z'],
  career: ['M4 7h16v13H4Z', 'M8 7V4h8v3', 'M4 12h16'],
  shop: ['M4 5h2l2 10h9l2-7H7', 'M10 19h.01M17 19h.01'],
  wealth: ['M4 19V9M10 19V4M16 19v-7M22 19H2'],
  social: ['M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 10a2.5 2.5 0 1 0 0-5', 'M2 20c0-4 2-7 6-7s6 3 6 7M14 13c4 0 7 2 7 6'],
  city: ['M3 21V8h7v13M10 21V3h11v18M6 11h1M6 15h1M14 7h2M14 11h2M14 15h2M19 7h1'],
  profile: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-5 3-7 8-7s8 2 8 7'],
  cash: ['M4 6h16v12H4Z', 'M8 12h8M12 9v6'],
  calendar: ['M4 5h16v16H4ZM8 3v4M16 3v4M4 10h16'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v6l4 2'],
  settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'],
};

export function PixelIcon({ name, size = 18, ...props }: { name: PixelIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return <svg className="pixel-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" {...props}>{paths[name].map((path, index) => <path d={path} key={index} />)}</svg>;
}
