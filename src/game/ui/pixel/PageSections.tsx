import { useId, useState, type ReactNode } from 'react';

/** Page-local navigation; selection never changes game or save state. */
export function PageSections({ title, description, sections }: { title: string; description: string; sections: { id: string; label: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useState(sections[0].id);
  const prefix = useId();
  const active = sections.find(section => section.id === selected) ?? sections[0];
  return <section className="page-workspace" aria-label={title}>
    <header className="section-heading compact"><h1>{title}</h1><p>{description}</p></header>
    <nav className="page-sections" aria-label={`${title}分区`}>{sections.map(section => <button key={section.id} className="secondary-button" aria-current={active.id === section.id ? 'page' : undefined} aria-controls={`${prefix}-content`} onClick={() => setSelected(section.id)}>{section.label}</button>)}</nav>
    <div id={`${prefix}-content`} className="page-section-content" role="region" aria-label={`${title} · ${active.label}`}>{active.content}</div>
  </section>;
}
