import { useEffect, useLayoutEffect } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { glideTo, topOf, GLIDE_S, STORY_SECTIONS } from './scroll';
import { isEmbed } from '../core/env';

// Section-by-section scrolling on the story page: one gesture (wheel / trackpad swipe incl. its momentum,
// touch swipe, ↓ ↑ PageDown PageUp Space Home End) = one move to the next / previous section. There is no
// stopping in between; the sky flies to each section's target as it arrives (viewer/story/sky-sync.js).
//
// Left alone (native scrolling as before): modals, free-look globe, the intro, embeds, form fields, and any
// inner panel that can still scroll in that direction (or is marked data-lenis-prevent).
// html.story-paged (css/story.css) makes every section exactly one screen tall; a card that still does not fit
// scrolls inside itself. Fallback: a section taller than the screen gets extra stops, so nothing is unreachable.

const TOL = 30;           // px: closer than this to a stop = "already there"
const GESTURE_GAP = 180;  // ms of wheel silence that separates two gestures (trackpad momentum = one gesture)
const SWIPE_MIN = 40;     // px of touch travel for a swipe
const STEP_VH = 0.85;     // extra stops inside a tall section, as a fraction of the screen height

type Dir = 1 | -1 | 'first' | 'last';

function pagerActive(): boolean {
  const b = document.body.classList;
  return b.contains('hero-mode') && !b.contains('modal-open') && !b.contains('free-look-active')
    && !document.documentElement.classList.contains('intro-lock');
}

/** true when the event happens inside something that should keep its own scrolling in direction `dir`. */
function innerScroller(target: EventTarget | null, dir: 1 | -1): boolean {
  for (let n = target instanceof Element ? target : null; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (n.hasAttribute('data-lenis-prevent')) return true;
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
      const canMove = dir > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0;
      if (canMove) return true;
    }
  }
  return false;
}

function stops(): number[] {
  const vh = window.innerHeight;
  const max = Math.max(0, document.documentElement.scrollHeight - vh);
  const out: number[] = [];
  for (const [id] of STORY_SECTIONS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const top = topOf(el);
    const lastView = top + el.offsetHeight - vh; // scroll position that shows the section's bottom edge
    out.push(top);
    for (let y = top + vh * STEP_VH; y < lastView - TOL; y += vh * STEP_VH) out.push(y);
    if (lastView > top + TOL) out.push(lastView);
  }
  return Array.from(new Set(out.map((y) => Math.round(Math.min(Math.max(0, y), max))))).sort((a, b) => a - b);
}

export function useSectionPager(): void {
  // one section = one screen (before the viewer creates its ScrollTriggers; refresh in case it already did)
  useLayoutEffect(() => {
    if (isEmbed) return;
    document.documentElement.classList.add('story-paged');
    ScrollTrigger.refresh();
    return () => { document.documentElement.classList.remove('story-paged'); };
  }, []);

  useEffect(() => {
    if (isEmbed) return;
    let animating = false;
    let lastWheel = 0;

    const go = (dir: Dir) => {
      if (animating) return;
      const s = stops();
      if (!s.length) return;
      const y = window.scrollY;
      let target: number | undefined;
      if (dir === 'first') target = s[0];
      else if (dir === 'last') target = s[s.length - 1];
      else if (dir === 1) target = s.find((v) => v > y + TOL);
      else target = [...s].reverse().find((v) => v < y - TOL);
      if (target === undefined || Math.abs(target - y) < 2) return;

      animating = true;
      const safety = window.setTimeout(() => { animating = false; }, GLIDE_S * 1000 + 800);
      glideTo(target, () => { animating = false; window.clearTimeout(safety); });
    };

    const onWheel = (e: WheelEvent) => {
      if (!pagerActive() || e.ctrlKey) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      const now = performance.now();
      const gap = now - lastWheel;
      lastWheel = now; // also while an inner panel scrolls: its momentum must not turn into a page move
      if (innerScroller(e.target, dir)) {
        e.stopPropagation(); // native scrolling of that panel; Lenis would scroll the page instead
        return;
      }
      e.preventDefault();
      e.stopPropagation(); // Lenis must not smooth-scroll this one
      if (animating || gap < GESTURE_GAP || Math.abs(e.deltaY) < 2) return;
      go(dir);
    };

    let touch: { y: number; dy: number; native: boolean } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touch = pagerActive() && e.touches.length === 1 ? { y: e.touches[0].clientY, dy: 0, native: false } : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touch || touch.native) return;
      touch.dy = touch.y - e.touches[0].clientY;
      if (Math.abs(touch.dy) < 4) return;
      if (innerScroller(e.target, touch.dy > 0 ? 1 : -1)) { touch.native = true; return; }
      e.preventDefault();
    };
    const onTouchEnd = () => {
      if (touch && !touch.native && Math.abs(touch.dy) > SWIPE_MIN) go(touch.dy > 0 ? 1 : -1);
      touch = null;
    };

    const onKey = (e: KeyboardEvent) => {
      if (!pagerActive() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      let dir: Dir | null = null;
      switch (e.key) {
        case 'ArrowDown': case 'PageDown': dir = 1; break;
        case 'ArrowUp': case 'PageUp': dir = -1; break;
        case 'Home': dir = 'first'; break;
        case 'End': dir = 'last'; break;
        case ' ': if (t?.closest('button, a, [role="button"]')) return; dir = e.shiftKey ? -1 : 1; break;
      }
      if (dir === null) return;
      e.preventDefault();
      e.stopPropagation(); // the globe's arrow-key camera controls (viewer/sky/camera.js) are not meant for the story page
      go(dir);
    };

    const nonPassive = { capture: true, passive: false } as const;
    window.addEventListener('wheel', onWheel, nonPassive);
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onTouchMove, nonPassive);
    window.addEventListener('touchend', onTouchEnd, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('wheel', onWheel, nonPassive);
      window.removeEventListener('touchstart', onTouchStart, { capture: true });
      window.removeEventListener('touchmove', onTouchMove, nonPassive);
      window.removeEventListener('touchend', onTouchEnd, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
}
