import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { prefersReducedMotion, isEmbed } from '../core/env';

gsap.registerPlugin(ScrollTrigger, SplitText);

const instant = isEmbed;
const calm = prefersReducedMotion; // reduced motion (core/env.ts): the card only fades in

// Content that animates in one by one. Some of it (the benchmark grid) is filled by the viewer later
// (viewer/story/benchmarks.js), so it is looked up again at play time rather than at mount.
const STAGGERED = '.metric-pill, .control-row > *, .showcase-controls > .b, #storyBenchmarkGrid > *';
const clearProps = 'transform,filter,opacity,clipPath';

/**
 * Scroll-driven entrance of a showcase section (glass card + header + media + controls).
 * Hidden state is set from JS before first paint, so if JS ever fails the content stays visible.
 * Plays once; clears its inline styles afterwards so CSS hovers and the viewer's hover springs keep working.
 * Sections do not all have every part (media, controls...): empty target lists are skipped.
 */
export function useSectionReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const section = ref.current;
    const card = section?.querySelector<HTMLElement>('.showcase-card');
    if (!section || !card || instant) return;

    if (calm) {
      gsap.set(card, { opacity: 0 });
      let shown = false;
      const show = () => { if (!shown) { shown = true; gsap.to(card, { opacity: 1, duration: 0.7, ease: 'power1.out', clearProps: 'opacity' }); } };
      const st = ScrollTrigger.create({ trigger: section, start: 'top 80%', once: true, onEnter: show });
      const safety = window.setTimeout(() => { if (section.getBoundingClientRect().top < window.innerHeight * 0.9) show(); }, 1600);
      return () => { window.clearTimeout(safety); st.kill(); gsap.set(card, { clearProps: 'opacity' }); };
    }

    const q = (s: string) => Array.from(card.querySelectorAll<HTMLElement>(s));
    const title = card.querySelector<HTMLElement>('.showcase-header h2');
    const split = title ? SplitText.create(title, { type: 'words' }) : null;

    gsap.set(card, { opacity: 0, y: 70, scale: 0.97 });
    const parts = [...q('.feature-tag'), ...q('.showcase-desc'), ...q(STAGGERED)];
    if (parts.length) gsap.set(parts, { opacity: 0 });
    if (split) gsap.set(split.words, { opacity: 0, y: 34, filter: 'blur(8px)' });

    let played = false;
    const play = () => {
      if (played) return;
      played = true;
      const staggered = q(STAGGERED);
      if (staggered.length) gsap.set(staggered, { opacity: 0 }); // late children (benchmark grid) must not flash in
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      const add = (targets: Element[], from: gsap.TweenVars | null, to: gsap.TweenVars, at: number) => {
        if (!targets.length) return;
        if (from) tl.fromTo(targets, from, to, at);
        else tl.to(targets, to, at);
      };
      tl.to(card, { opacity: 1, y: 0, scale: 1, duration: 1, clearProps });
      add(q('.feature-tag'), null, { opacity: 1, duration: 0.6, clearProps }, 0.15);
      add(split?.words ?? [], null, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.85, stagger: 0.04, clearProps }, 0.25);
      add(q('.showcase-desc'), null, { opacity: 1, duration: 0.8, clearProps }, 0.55);
      add(q('.preview-media'), { clipPath: 'inset(0 100% 0 0 round 16px)' }, { clipPath: 'inset(0 0% 0 0 round 16px)', duration: 1.1, ease: 'power4.inOut', clearProps }, 0.5);
      add(q('.preview-media img'), { scale: 1.18 }, { scale: 1, duration: 1.5, clearProps }, 0.5);
      add(staggered, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, clearProps }, 0.75);
      tl.add(() => split?.revert());
    };

    const st = ScrollTrigger.create({ trigger: section, start: 'top 72%', once: true, onEnter: play });
    // Safety net: if the page loaded already scrolled past this section, never leave it hidden.
    const safety = window.setTimeout(() => {
      if (!played && section.getBoundingClientRect().top < window.innerHeight * 0.9) play();
    }, 1600);

    return () => {
      window.clearTimeout(safety);
      st.kill();
      split?.revert();
      gsap.set(card, { clearProps });
      const all = [...q('.feature-tag'), ...q('.showcase-desc'), ...q(STAGGERED)];
      if (all.length) gsap.set(all, { clearProps });
    };
  }, []);

  return ref;
}
