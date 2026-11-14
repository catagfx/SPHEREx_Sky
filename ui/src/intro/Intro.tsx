import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getState, subscribe, reveal } from '../core/store';
import { prefersReducedMotion } from '../core/env';
import Warp from './Warp';
import type { WarpState } from './Warp';

gsap.registerPlugin(ScrollTrigger);

// Intro (styles: css/intro.css). Flying stars, then a scroll-gated title screen over the live sky:
//   1. dark cover with a GLSL star field flying at warp speed, decelerating (Warp.tsx; calm mode: still stars)
//   2. when the sky scene is ready: a last surge of the stars while the cover fades into the sky,
//      then SPHEREx SKY is typed over the sky (calm mode: letters fade in), then a "scroll" cue appears
//   3. the title stays until the FIRST scroll gesture (wheel, swipe, ↓ / PageDown / Space, Esc / Enter, or a click
//      on the cue), which is consumed by the intro: title + cue fade out together (EXIT_FADE), then after EXIT_GAP
//      the header + hero + the rest of the page appear (story/Hero.tsx) and scrolling is unlocked.
//      Never auto-dismissed: the visitor decides when to go on (tests/intro.mjs checks it).
// Page scrolling is locked while the title is shown, so that first gesture never moves the page.
// "calm" = calm mode (core/env.ts: Tools > Reduce motion or ?motion=reduced).

const calm = prefersReducedMotion;
const TITLE_TEXT = 'SPHEREx SKY';
const TITLE = Array.from(TITLE_TEXT.replace(' ', ' ')); // a no-break space keeps its width as an inline-block letter
const TYPE_STEP = 0.13;   // seconds per typed letter
const MIN_MS = 2800;      // the flying stars are shown at least this long (from page load)
const SAFETY_MS = 7000;   // show the title anyway if the sky scene never reports ready
const QUIET_MS = 350;     // trackpad momentum: keep eating wheel events until they stop for this long
const EXIT_FADE = 0.6;    // seconds: title + "scroll" cue fade out together, all at once
const EXIT_GAP = 0.5;     // seconds between the text being gone and the header / page appearing
const SCROLL_KEYS = new Set(['ArrowDown', 'PageDown', ' ', 'Spacebar', 'End']);
const SKIP_KEYS = new Set(['Escape', 'Enter']);  // also work while the stars are still flying

function showErrorBanner(msg: string): void {
  const el = document.createElement('div');
  el.className = 'ui-error-banner';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 12000);
}

function revealPage(): void {
  reveal();
  const e = getState().error;
  if (e) showErrorBanner(e);
}

type Phase = 'loading' | 'title' | 'exiting' | 'done';

export default function Intro({ onDone }: { onDone: () => void }) {
  const { sceneReady, error } = useSyncExternalStore(subscribe, getState, getState);
  const [minElapsed, setMinElapsed] = useState(false);
  const [forced, setForced] = useState(false);
  const [coverOn, setCoverOn] = useState(true);
  const [webgl, setWebgl] = useState(true);
  const onUnsupported = useCallback(() => setWebgl(false), []);
  // shared with the shader every frame: warp 1 = hyperspace streaks, 0 = star points; speed 0 = still (calm)
  const warp = useRef<WarpState>(calm ? { warp: 0, fade: 0, speed: 0 } : { warp: 1, fade: 0, speed: 1 }).current;

  const coverRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const cueRef = useRef<HTMLButtonElement>(null);
  const phase = useRef<Phase>('loading');
  const entrance = useRef<gsap.core.Timeline | null>(null);
  const lastWheel = useRef(0);
  const unlockRef = useRef<() => void>(() => {});

  // The static dark cover from index.html hands over to this one (same background).
  useLayoutEffect(() => {
    document.getElementById('ui-boot')?.remove();
  }, []);

  // 1. stars fade in flying at warp speed, then decelerate (calm: still stars just fade in).
  useLayoutEffect(() => {
    const tl = gsap.timeline();
    tl.to(warp, { fade: 1, duration: calm ? 1.2 : 0.9, ease: 'power2.out' }, 0);
    if (!calm) tl.to(warp, { warp: 0.05, duration: 2.4, ease: 'power3.out' }, 0.25);
    return () => { tl.kill(); };
  }, [warp]);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), Math.max(0, MIN_MS - performance.now()));
    const s = setTimeout(() => setForced(true), SAFETY_MS);
    return () => { clearTimeout(t); clearTimeout(s); };
  }, []);

  // Errors (three.js / WebGL unavailable) must not freeze the intro on the dark cover.
  const ready = minElapsed && (sceneReady || !!error || forced);

  // 3. leave: title out, page in. Scrolling unlocks once the gesture that triggered it has stopped.
  const exit = useCallback(() => {
    if (phase.current !== 'title') return;
    phase.current = 'exiting';
    entrance.current?.progress(1).kill();

    const title = titleRef.current;
    const finishUp = () => {
      const waitQuiet = () => {
        if (performance.now() - lastWheel.current < QUIET_MS) { setTimeout(waitQuiet, 80); return; }
        phase.current = 'done';
        unlockRef.current();
        onDone();
      };
      waitQuiet();
    };

    // the whole title + cue fade out together, then (after EXIT_GAP) the header and the page come in
    gsap.timeline({ onComplete: finishUp })
      .to([title, cueRef.current], { opacity: 0, duration: EXIT_FADE, ease: 'power1.inOut' }, 0)
      .call(revealPage, [], EXIT_FADE + EXIT_GAP);
  }, [onDone]);

  // Scroll lock + "first scroll" detection. Capture phase on window, so Lenis never sees these events.
  useEffect(() => {
    const html = document.documentElement;
    const prevRestore = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    html.classList.add('intro-lock');

    let touchY = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      lastWheel.current = performance.now();
      if (e.deltaY > 2) exit();
    };
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0]?.clientY ?? 0; };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (touchY - (e.touches[0]?.clientY ?? touchY) > 24) exit();
    };
    const onKey = (e: KeyboardEvent) => {
      if (SKIP_KEYS.has(e.key)) {
        e.preventDefault();
        if (phase.current === 'title') exit();
        else if (phase.current === 'loading') { phase.current = 'done'; unlockRef.current(); revealPage(); onDone(); }
        return;
      }
      if (!SCROLL_KEYS.has(e.key)) return;
      e.preventDefault();
      exit();
    };
    const opts = { capture: true, passive: false } as const;
    window.addEventListener('wheel', onWheel, opts);
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onTouchMove, opts);
    window.addEventListener('keydown', onKey, true);

    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      window.removeEventListener('wheel', onWheel, opts);
      window.removeEventListener('touchstart', onTouchStart, { capture: true });
      window.removeEventListener('touchmove', onTouchMove, opts);
      window.removeEventListener('keydown', onKey, true);
      html.classList.remove('intro-lock');
      history.scrollRestoration = prevRestore;
      ScrollTrigger.refresh(); // the scrollbar came back: re-measure every trigger
    };
    unlockRef.current = unlock;
    return unlock;
  }, [exit]);

  // 1-2. cover fades, the title appears, then the cue.
  useEffect(() => {
    if (!ready || phase.current !== 'loading') return;
    const cover = coverRef.current;
    const title = titleRef.current;
    const caret = caretRef.current;
    const cue = cueRef.current;
    if (!cover || !title || !caret || !cue) return;
    const letters = Array.from(title.querySelectorAll<HTMLElement>('span.ch'));
    // full: the stars surge (streaks stretch) while the cover fades into the sky; the title starts as they vanish
    const coverOut = calm ? 1.1 : 1.4;
    const t0 = calm ? 0.35 : 1.05;

    const tl = gsap.timeline();
    entrance.current = tl;
    if (!calm) tl.to(warp, { warp: 1.3, duration: 1.0, ease: 'power2.in' }, 0);
    tl.to(cover, { opacity: 0, duration: calm ? 1.1 : 1.2, ease: calm ? 'power2.inOut' : 'power2.in' }, calm ? 0 : 0.2)
      .call(() => setCoverOn(false), [], coverOut)
      .set(title, { autoAlpha: 1 }, t0)
      .call(() => { phase.current = 'title'; }, [], t0);

    let typed = t0;
    if (calm) {
      tl.fromTo(letters, { opacity: 0 }, { opacity: 1, duration: 0.7, stagger: 0.08, ease: 'power1.out' }, t0);
      typed = t0 + 0.7 + 0.08 * letters.length;
    } else {
      // typewriter: staggered letters + caret hopping along (minus the trailing letter-spacing)
      const spacing = parseFloat(getComputedStyle(title).fontSize) * 0.1;
      letters.forEach((l, i) => {
        const at = t0 + i * TYPE_STEP;
        tl.fromTo(l, { opacity: 0, y: 10, filter: 'blur(6px)' },
                     { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.22, ease: 'power2.out' }, at);
        tl.call(() => { gsap.set(caret, { x: l.offsetLeft + l.offsetWidth - spacing, autoAlpha: 1 }); }, [], at);
      });
      typed = t0 + letters.length * TYPE_STEP + 0.25;
      tl.set(caret, { autoAlpha: 0 }, typed + 0.5);
    }
    tl.fromTo(cue, { autoAlpha: 0, y: calm ? 0 : 12 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out' }, typed + 0.2);

    return () => { tl.kill(); };
  }, [ready, warp]);

  return (
    <>
      {coverOn && (
        <div id="load" ref={coverRef} role="status" aria-live="polite">
          {webgl ? <Warp state={warp} onUnsupported={onUnsupported} /> : <div className="intro-stars" aria-hidden="true" />}
        </div>
      )}
      <div id="introType" ref={titleRef} aria-label={TITLE_TEXT}>
        {TITLE.map((ch, i) => (
          <span key={i} className="ch" aria-hidden="true">{ch}</span>
        ))}
        <span ref={caretRef} className="intro-caret" aria-hidden="true" />
      </div>
      <button type="button" className="intro-cue" ref={cueRef} onClick={exit}>
        <span className="intro-cue-text">Scroll to explore</span>
        <span className="cue-mouse" aria-hidden="true"><span className="cue-wheel" /></span>
      </button>
    </>
  );
}

/** Used by main.tsx when there is nothing to play (embed mode, ?intro=0, deep links). */
export function skipIntro(): void {
  document.getElementById('ui-boot')?.remove();
  reveal();
}
