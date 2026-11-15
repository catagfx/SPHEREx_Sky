import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { STORY_SECTIONS as ITEMS, glideTo, topOf } from './scroll';

// Story navigation inside the header's scroll-progress line (index.html: #top .scroll-progress, filled by
// viewer/ui/header.js): one dot marker + name per section, placed where the line's glowing head arrives for that
// section (sections are equally tall, so section k sits at k / (n - 1) of the line). The active one follows the
// scroll; a click glides there. One system: the progress bar IS the navigation.

export default function ProgressNav() {
  const [active, setActive] = useState(ITEMS[0][0]);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('#top .scroll-progress');
    bar?.classList.add('has-nav');
    setHost(bar);
    // The active marker follows the glowing head of the line itself (its real, eased width), so a marker and its name
    // light up exactly when the line gets there, never ahead of it.
    const fill = document.getElementById('spFill');
    let raf = 0;
    let last = -1;
    const tick = () => {
      if (fill && bar) {
        const p = fill.getBoundingClientRect().width / Math.max(1, bar.getBoundingClientRect().width);
        const idx = Math.min(ITEMS.length - 1, Math.max(0, Math.floor(p * (ITEMS.length - 1) + 0.02)));
        if (idx !== last) { last = idx; setActive(ITEMS[idx][0]); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); bar?.classList.remove('has-nav'); };
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
          <svg className="sp-mark-star" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg>
          <span className="sp-mark-label">{label}</span>
        </button>
      ))}
    </nav>,
    host,
  );
}
