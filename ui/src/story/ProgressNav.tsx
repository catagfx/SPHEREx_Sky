import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { STORY_SECTIONS as ITEMS, glideTo, topOf } from './scroll';

gsap.registerPlugin(ScrollTrigger);

// Story navigation inside the header's scroll-progress line (index.html: #top .scroll-progress, filled by
// viewer/ui/header.js): one star-shaped marker + name per section, placed where the line's glowing head arrives for that
// section (sections are equally tall, so section k sits at k / (n - 1) of the line). The active one follows the
// scroll; a click glides there. One system: the progress bar IS the navigation.

const STAR = 'M12 0 L14.1 9.9 L24 12 L14.1 14.1 L12 24 L9.9 14.1 L0 12 L9.9 9.9 Z';

export default function ProgressNav() {
  const [active, setActive] = useState(ITEMS[0][0]);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('#top .scroll-progress');
    bar?.classList.add('has-nav');
    setHost(bar);
    const triggers = ITEMS.map(([id]) =>
      ScrollTrigger.create({
        trigger: `#${id}`,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => { if (self.isActive) setActive(id); },
      }),
    );
    return () => { triggers.forEach((t) => t.kill()); bar?.classList.remove('has-nav'); };
  }, []);

  // body.story-at-hero: the first story step is on screen (css: the sky credit shows only there)
  useEffect(() => {
    document.body.classList.toggle('story-at-hero', active === ITEMS[0][0]);
  }, [active]);

  if (!host) return null;
  const activeIndex = ITEMS.findIndex(([id]) => id === active);
  const go = (id: string) => {
    const el = document.getElementById(id);
    if (el) glideTo(topOf(el));
  };

  return createPortal(
    <nav className="sp-nav" aria-label="Story sections">
      {ITEMS.map(([id, label], i) => (
        <button
          key={id}
          type="button"
          className={'sp-mark' + (i === activeIndex ? ' is-active' : i < activeIndex ? ' is-passed' : '')}
          style={{ left: `${(i / (ITEMS.length - 1)) * 100}%` }}
          aria-current={i === activeIndex ? 'true' : undefined}
          onClick={() => go(id)}
        >
          <svg className="sp-mark-star" viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} /></svg>
          <span className="sp-mark-label">{label}</span>
        </button>
      ))}
    </nav>,
    host,
  );
}
