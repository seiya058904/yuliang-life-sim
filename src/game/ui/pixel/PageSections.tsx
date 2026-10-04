import { useId, type ReactNode } from 'react';
import { useViewState } from './ViewMemory';
import { PageHeading } from './PageHeading';
import type { PixelIconName } from './PixelIcon';

/** Page-local navigation; selection never changes game or save state. */
export function PageSections({ title, description, sections, icon = 'profile', facts }: { title: string; description: string; icon?: PixelIconName; facts?: readonly { label: string; value: ReactNode }[]; sections: { id: string; label: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useViewState(`sections.${title}`, sections[0].id);
  const prefix = useId();
  const active = sections.find(section => section.id === selected) ?? sections[0];
  return <section className="page-workspace" aria-label={title}>
    <PageHeading title={title} description={description} icon={icon} facts={facts} />
    <nav className="page-sections" aria-label={`${title}分区`}>{sections.map(section => <button key={section.id} className="secondary-button" aria-current={active.id === section.id ? 'page' : undefined} aria-controls={`${prefix}-content`} onClick={() => setSelected(section.id)}>{section.label}</button>)}</nav>
    <div id={`${prefix}-content`} className="page-section-content" role="region" aria-label={`${title} · ${active.label}`}>{active.content}</div>
  </section>;
}
