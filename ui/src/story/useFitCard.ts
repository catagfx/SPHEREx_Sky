import { useLayoutEffect, useRef } from 'react';

/**
 * A card that never scrolls: on screens too short for its content, the content (the returned ref's element) is
 * scaled down (CSS zoom) until it fits the card exactly. Re-fitted on resize, once the fonts are loaded and when
 * the pager makes the section a fixed-height screen (html.story-paged).
 */
export function useFitCard<T extends HTMLElement>() {
  const fitRef = useRef<T>(null);
  useLayoutEffect(() => {
    const el = fitRef.current;
    const card = el?.closest('.showcase-card') as HTMLElement | null;
    if (!el || !card) return;
    let raf = 0;
    const fits = () => card.scrollHeight <= card.clientHeight + 1;
    const fit = () => {
      el.style.zoom = '1';
      if (window.innerWidth <= 760) return; // phones: the card scrolls inside itself, nothing is scaled down
      if (fits()) return;
      let lo = 0.4, hi = 1;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        el.style.zoom = String(mid);
        if (fits()) lo = mid; else hi = mid;
      }
      el.style.zoom = String(lo);
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    fit();
    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule);
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const section = card.closest('section');
    const ro = section ? new ResizeObserver(schedule) : null;
    if (section) ro?.observe(section);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', schedule); mo.disconnect(); ro?.disconnect(); };
  }, []);
  return fitRef;
}
