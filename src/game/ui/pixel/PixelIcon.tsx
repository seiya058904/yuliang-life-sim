import type { SVGProps } from 'react';

export type PixelIconName =
  | 'home' | 'career' | 'shop' | 'wealth' | 'social' | 'city' | 'profile' | 'cash' | 'calendar' | 'clock' | 'settings'
  | 'sleep' | 'book' | 'controller' | 'users' | 'house' | 'bag' | 'chart' | 'mail' | 'alert' | 'tag'
  | 'plane' | 'cup' | 'target' | 'spark' | 'user';

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
  sleep: ['M3 20h18M4 13h12v7M16 13v7M6 15h4'],
  book: ['M5 4h9l5 5v11H8l-3 -3Z', 'M14 4v5h5', 'M8 13h6M8 16h4'],
  controller: ['M7 8h10l3 9h-4l-2-3h-4l-2 3H4Z', 'M8 11h3M9.5 9.5v3M15 10h.01M16.5 12h.01'],
  users: ['M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 10a2.5 2.5 0 1 0 0-5', 'M2 20c0-4 2-7 6-7s6 3 6 7M14 13c4 0 7 2 7 6'],
  house: ['M12 3 3 11h3v9h12v-9h3Z', 'M10 20v-6h4v6'],
  bag: ['M5 8h14l-1 13H6Z', 'M8 8V6a4 4 0 0 1 8 0v2', 'M9 12h.01M15 12h.01'],
  chart: ['M3 21h18', 'M6 21v-8M11 21V7M16 21v-11M21 21V4'],
  mail: ['M3 5h18v14H3Z', 'M3 6l9 7 9-7'],
  alert: ['M12 3 2 21h20Z', 'M12 10v5M12 18h.01'],
  tag: ['M3 3h8l10 10-8 8L3 11Z', 'M8 8h.01'],
  plane: ['M22 3 10 12l-7-3 19-6Z', 'M10 12l2 8 3-6'],
  cup: ['M5 4h12v6a6 6 0 0 1-12 0Z', 'M17 5h3a3 3 0 0 1-3 5', 'M4 20h14'],
  target: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M12 11v1h1'],
  spark: ['M12 2v6M12 16v6M2 12h6M16 12h6', 'M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-5 3-7 8-7s8 2 8 7'],
};

export function PixelIcon({ name, size = 18, ...props }: { name: PixelIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const geometry = paths[name] ?? paths.settings;
  return <svg className="pixel-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" {...props}>{geometry.map((path, index) => <path d={path} key={index} />)}</svg>;
}
