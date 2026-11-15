import type { CSSProperties, ReactNode } from 'react';
import { useSectionReveal } from './useSectionReveal';

interface Props {
  id: string;
  tag?: string;
  title: string;
  desc?: string;
  /** optional inline style on the card (e.g. wider max-width) */
  cardStyle?: CSSProperties;
  /** fade the card in every time the section scrolls into view (default: only the first time) */
  replay?: boolean;
  children: ReactNode;
}

/** Shared shell of story sections 2–6: glass card + header (tag, title, description). */
export default function ShowcaseSection({ id, tag, title, desc, cardStyle, replay, children }: Props) {
  const ref = useSectionReveal<HTMLElement>(replay);
  return (
    <section className="story-section feature-section" id={id} ref={ref}>
      <div className="showcase-card glass-panel" style={cardStyle}>
        <div className="showcase-header">
          {tag && <span className="feature-tag">{tag}</span>}
          <h2>{title}</h2>
          {desc && <p className="showcase-desc">{desc}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
