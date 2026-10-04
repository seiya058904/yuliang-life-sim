import type { ReactNode } from 'react';
import { PixelIcon, type PixelIconName } from './PixelIcon';

/** One arrival rhythm for every part of the same life, with live context below the title. */
export function PageHeading({ title, description, icon, facts, actions }: {
  title: string; description: string; icon: PixelIconName;
  facts?: readonly { label: string; value: ReactNode }[]; actions?: ReactNode;
}) {
  return <header className="page-heading">
    <div className="page-heading-title"><PixelIcon name={icon} size={32} /><h1>{title}</h1></div>
    <p>{description}</p>
    {facts && <dl className="page-heading-facts">{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
    {actions && <div className="page-heading-actions">{actions}</div>}
  </header>;
}
