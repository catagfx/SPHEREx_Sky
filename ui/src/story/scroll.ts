import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { prefersReducedMotion } from '../core/env';
import { getLenis } from '../core/smooth-scroll';

gsap.registerPlugin(ScrollToPlugin);

// One way to glide the story page, shared by the section pager, the progress nav and the header buttons.
// Goes through the page's Lenis instance when there is one, so smooth scrolling never fights itself;
// reduced motion jumps instantly (the sky then cuts to the new section's target instead of flying).

/** Story sections in scroll order (same ids as Story.tsx / viewer/story/sky-sync.js), with their nav labels. */
export const STORY_SECTIONS: Array<[id: string, label: string]> = [
  ['secHero', 'Overview'],
  ['secPlanetX', 'Planet X'],
  ['secDiff', 'Difference imaging'],
  ['secBenchmarks', 'Benchmark targets'],
  ['secSpectro', 'Spectroscopy'],
  ['secCitizen', 'Citizen science'],
];

export const GLIDE_S = 1.1;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function glideTo(y: number, done?: () => void): void {
  const target = Math.max(0, Math.round(y));
  if (prefersReducedMotion) {
    window.scrollTo(0, target);
    done?.();
    return;
  }
  const lenis = getLenis();
  if (lenis) {
    lenis.scrollTo(target, { duration: GLIDE_S, easing: easeInOutCubic, lock: true, force: true, onComplete: done });
  } else {
    gsap.to(window, { scrollTo: { y: target, autoKill: false }, duration: GLIDE_S, ease: 'power3.inOut', onComplete: done });
  }
}

/** Page top of an element (document coordinates). */
export function topOf(el: Element): number {
  return el.getBoundingClientRect().top + window.scrollY;
}
