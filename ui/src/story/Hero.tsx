import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getState, subscribe } from '../core/store';
import { prefersReducedMotion, isEmbed } from '../core/env';
import Constellation from './Constellation';

gsap.registerPlugin(SplitText, ScrollTrigger);

// embed: no entrance at all. calm (reduced motion, see core/env.ts): fades only, no travelling / blur.
const instant = isEmbed;
const calm = prefersReducedMotion;

// The four mission facts, discreet in the corners of the screen; each one is wired to a star of a nearby
// constellation (Constellation.tsx: SHAPES[].host). tl / tr / bl / br = corner.
interface Fact { corner: 'tl' | 'tr' | 'bl' | 'br'; title: string; sub: string }
const FACTS: Fact[] = [
  { corner: 'tl', title: '102 Bands', sub: '0.75 – 5.0 µm' },
  { corner: 'tr', title: '6-Month Cycle', sub: 'Full sky survey' },
  { corner: 'bl', title: 'Time Domain', sub: 'Dynamic motion' },
  { corner: 'br', title: 'Dual Layers', sub: 'Stars & gas/dust' },
];

// Section 1 — hero. The viewer binds its buttons by id (viewer/navigation.js, panels/help.js); styles in
// css/story.css. Motion = one GSAP timeline, played on reveal.
export default function Hero() {
  const { revealed } = useSyncExternalStore(subscribe, getState, getState);
  const rootRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const split = useRef<SplitText | null>(null);
  const played = useRef(false);
  const [linked, setLinked] = useState(instant); // constellation lines appear once the text is in place

  // Hide everything (and split the headline into masked lines/words) before first paint.
  useLayoutEffect(() => {
    if (instant) return;
    const root = rootRef.current;
    const cue = cueRef.current;
    if (!root || !cue) return;
    const q = (s: string) => Array.from(root.querySelectorAll<HTMLElement>(s));
    const facts = Array.from(skyRef.current?.querySelectorAll<HTMLElement>('.hero-fact') ?? []);
    gsap.set([...facts, ...q('.lead'), ...q('.hero-btn'), ...q('.hero-foot'), cue], { opacity: 0 });
    const h1 = root.querySelector<HTMLElement>('#ht');
    if (!h1) return;
    if (calm) { gsap.set(h1, { opacity: 0 }); return; }
    split.current = SplitText.create(h1, { type: 'lines,words', mask: 'lines' });
    gsap.set(split.current.words, { yPercent: 118, rotate: 4 });
    return () => { split.current?.revert(); };
  }, []);

  // Scroll exit: the hero content dissolves as the first card arrives. fromTo + immediateRender:false so the
  // entrance below (which owns opacity at scroll 0) is never fought. The hero text is static otherwise
  // (no mouse parallax), only opacity / filter are scrubbed here.
  useLayoutEffect(() => {
    if (instant || calm) return;
    const root = rootRef.current;
    const cue = cueRef.current;
    if (!root || !cue) return;
    const ctx = gsap.context(() => {
      const trigger = { trigger: '#secHero', start: 'top top', scrub: true };
      gsap.fromTo(root, { opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(10px)', ease: 'none', immediateRender: false, scrollTrigger: { ...trigger, end: '75% top' } });
      if (skyRef.current) gsap.fromTo(skyRef.current, { opacity: 1 }, { opacity: 0, ease: 'none', immediateRender: false, scrollTrigger: { ...trigger, end: '60% top' } });
      gsap.fromTo(cue, { opacity: 1, y: 0 }, { opacity: 0, y: 24, ease: 'none', immediateRender: false, scrollTrigger: { ...trigger, end: '25% top' } });
    });
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (instant || !revealed || played.current) return;
    const root = rootRef.current;
    const cue = cueRef.current;
    const words = split.current?.words;
    if (!root || !cue || (!calm && !words)) return;
    played.current = true;
    const q = (s: string) => Array.from(root.querySelectorAll<HTMLElement>(s));
    const facts = Array.from(skyRef.current?.querySelectorAll<HTMLElement>('.hero-fact') ?? []);
    // once an entrance ends, drop inline styles so CSS hover + the hover springs (viewer/ui/chrome.js) work
    const clear = { clearProps: 'transform,filter,opacity' };

    if (calm) {
      const ctx = gsap.context(() => {
        gsap.timeline({ defaults: { ease: 'power1.out', duration: 0.8, ...clear } })
          .to(q('#ht'), { opacity: 1, duration: 1 }, 0.1)
          .to(q('.lead'), { opacity: 1 }, 0.5)
          .to(q('.hero-btn'), { opacity: 1, stagger: 0.06 }, 0.7)
          .to(q('.hero-foot'), { opacity: 1 }, 0.9)
          .to(cue, { opacity: 1 }, 1.0)
          .call(() => setLinked(true), [], 1.0)
          .to(facts, { opacity: 1, stagger: 0.1 }, 1.3);
      }, rootRef);
      return () => ctx.revert();
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to(words ?? [], { yPercent: 0, rotate: 0, duration: 1.05, ease: 'expo.out', stagger: 0.09 }, 0.2)
        .fromTo(q('.lead'), { y: 24, opacity: 0, filter: 'blur(8px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.9, ...clear }, 0.95)
        .fromTo(q('.hero-btn'), { y: 22, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.8)', stagger: 0.08, ...clear }, 1.15)
        .fromTo(q('.hero-foot'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ...clear }, 1.5)
        .fromTo(cue, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ...clear }, 1.8)
        .call(() => setLinked(true), [], 1.6)                                   // the sky draws itself...
        .fromTo(facts, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ...clear }, 2.4); // ...then the facts

    }, rootRef);
    return () => ctx.revert();
  }, [revealed]);

  return (
    <section className="story-section hero-section" id="secHero">
      <div className="hero-sky" ref={skyRef}>
        <Constellation stage={skyRef} content={rootRef} active={linked} />
        {FACTS.map((f) => (
          <div className={`hero-fact fact-${f.corner}`} data-host={f.corner} key={f.corner}>
            <span className="fact-k">{f.title}</span>
            <span className="fact-v">{f.sub}</span>
          </div>
        ))}
      </div>

      <div className="hero-content" id="hc" ref={rootRef}>
        <h1 id="ht" className="hero-headline">Revealing the hidden universe</h1>
        <p className="lead">
          Mapping the entire sky across 102 infrared colors every six months. Unveiling shifting outer solar system planets, cold brown dwarfs, erupting comas, and the living dynamic heartbeat of our cosmos.
        </p>

        <div className="cta">
          <button className="hero-btn secondary" id="btnExploreStory"><span>Explore Discovery Story</span></button>
          <button className="hero-btn secondary" id="btnFreeLook"><span>Free-Look 360° Globe</span></button>
          <button className="hero-btn secondary" id="h1"><span>Open All-Sky Workbench</span></button>
          <button className="hero-btn secondary" id="h3"><span>Guided Audio Tour</span></button>
        </div>

        <div className="hero-foot">
          <div className="hero-foot-row">
            <span>Level 2 Quick Release Data: NASA/JPL-Caltech &amp; IPAC IRSA</span>
            <button className="link-btn" id="hw3">Methodology &amp; Limits</button>
          </div>
          <p className="hero-foot-credit">
            Whole sky in infrared, from NASA's SPHEREx all-sky maps: stars &amp; galaxies, and dust &amp; gas. Credit: NASA/JPL-Caltech &amp; NASA/IPAC IRSA.
          </p>
        </div>
      </div>

      <div className="scroll-cue" id="scrollCue" ref={cueRef}>
        <span className="cue-text">Scroll to explore</span>
        <div className="cue-mouse"><div className="cue-wheel" /></div>
      </div>
    </section>
  );
}
