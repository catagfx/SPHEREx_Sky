import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { prefersReducedMotion, isEmbed } from './env';

// Smooth page scrolling (Lenis), driven by the shared GSAP ticker so ScrollTrigger stays in sync.
// Off in calm mode and in embeds (native scrolling there). Modals and free-look stop / start it.

let lenis: Lenis | null = null;

export function initSmoothScroll(): void {
  if (lenis || prefersReducedMotion || isEmbed) return;
  try {
    const instance = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      anchors: true,
    });
    instance.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => instance.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis = instance;
  } catch (err) {
    console.warn('Lenis initialization notice:', err);
  }
}

/** The page's Lenis instance, or null when scrolling is native. */
export const getLenis = (): Lenis | null => lenis;
