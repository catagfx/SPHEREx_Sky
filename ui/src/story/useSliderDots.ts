import { useEffect } from 'react';

/**
 * A slider with a dot for every step on its line (css/story.css reads --t, the pixel distance between two dots):
 * the same slider as the explorer's Band / Pass / Date sliders. Re-measured on resize and when the card is fitted.
 */
export function useSliderDots(id: string, steps: number) {
  useEffect(() => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    const set = () => {
      const w = el.offsetWidth;
      if (w > 40) el.style.setProperty('--t', ((w - 20) / steps).toFixed(3) + 'px');
    };
    set();
    window.addEventListener('resize', set);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    document.fonts?.ready.then(set);
    return () => { window.removeEventListener('resize', set); ro.disconnect(); };
  }, [id, steps]);
}
