import gsap from 'gsap';
import { $$ } from '../dom';
import { prefersReducedMotion as reduce, isEmbed } from '../../core/env';

// Page chrome motion: the header + watermark entrance when the intro reveals the page, button hover springs,
// and the slow mouse parallax of the background watermark. None of it runs in calm mode or embeds
// (css/intro.css fades the header there instead).

/** Played by the intro's reveal (core/store onReveal). */
export function playChromeEntrance() {
  if (reduce || isEmbed) return;
  gsap.timeline({ defaults: { ease: 'power3.out' } })
    .fromTo('.bg-watermark', { opacity: 0, scale: 1.08 }, { opacity: 0.035, scale: 1, duration: 1.2 }, 0)
    .fromTo('#top', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 0.1);
}

export function initMicroInteractions() {
  if (reduce || isEmbed) return;
  $$('.hero-btn, .pill-btn, .mode-tab').forEach((btn) => {
    btn.addEventListener('mouseenter', () => gsap.to(btn, { scale: 1.04, duration: 0.2, ease: 'power2.out', overwrite: 'auto' }));
    btn.addEventListener('mouseleave', () => gsap.to(btn, { scale: 1, duration: 0.25, ease: 'power2.out', overwrite: 'auto' }));
    btn.addEventListener('mousedown', () => gsap.to(btn, { scale: 0.96, duration: 0.1, overwrite: 'auto' }));
    btn.addEventListener('mouseup', () => gsap.to(btn, { scale: 1.04, duration: 0.15, overwrite: 'auto' }));
  });
  // only the watermark moves with the mouse; the hero text stays still and centred
  window.addEventListener('pointermove', (e) => {
    if (document.body.classList.contains('free-look-active')) return;
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    gsap.to('.bg-watermark', { x: nx * -25, y: ny * -15, duration: 1.2, ease: 'power2.out', overwrite: 'auto' });
  });
}
