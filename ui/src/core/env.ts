// Environment flags shared by the whole UI (React layer and viewer).

const params = new URLSearchParams(window.location.search);

// Motion preference. Full motion is the default, whatever the OS says: Windows ships with "Animation effects"
// off on many machines, and the page is built around its motion. Calm mode is opt-in: the "Reduce motion" item in
// the Tools menu or ?motion=reduced; ?motion=auto follows the OS setting (prefers-reduced-motion), ?motion=full
// goes back to the default. The choice is remembered in localStorage.
export type MotionPref = 'full' | 'reduced' | 'auto';
const MOTION_KEY = 'spx_motion';

function readMotionPref(): MotionPref {
  const p = params.get('motion');
  const fromUrl = p === 'full' || p === 'reduced' || p === 'auto' ? p : null;
  try {
    if (fromUrl) localStorage.setItem(MOTION_KEY, fromUrl);
    const v = fromUrl ?? localStorage.getItem(MOTION_KEY);
    return v === 'reduced' || v === 'auto' ? v : 'full';
  } catch {
    return fromUrl ?? 'full';
  }
}

export const motionPref: MotionPref = readMotionPref();

/** OS asks for less motion (only used with ?motion=auto). */
export const osReducedMotion: boolean =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Calm mode: no travelling, zooming or blurring motion, only fades. The intro and story still play
 * (gently), they never disappear.
 */
export const prefersReducedMotion: boolean = motionPref === 'reduced' || (motionPref === 'auto' && osReducedMotion);

document.documentElement.classList.toggle('reduce-motion', prefersReducedMotion);

const SKIP_INTRO_ONCE = 'spx_skip_intro';

/** Switch calm mode on / off: every module reads the flag once at start, so the page reloads (without the intro). */
export function setReducedMotion(on: boolean): void {
  const value: MotionPref = on ? 'reduced' : 'full';
  const url = new URL(location.href);
  url.searchParams.delete('motion');
  try {
    localStorage.setItem(MOTION_KEY, value);
    sessionStorage.setItem(SKIP_INTRO_ONCE, '1');
  } catch {
    url.searchParams.set('motion', value); // storage blocked: carry the choice in the URL
  }
  // same URL (maybe with a #hash): replace() would only jump to the fragment, so reload
  if (url.href === location.href) location.reload();
  else location.replace(url.href);
}

/** True once after setReducedMotion() reloaded the page: the visitor already saw the intro. */
export function consumeSkipIntro(): boolean {
  try {
    const v = sessionStorage.getItem(SKIP_INTRO_ONCE) === '1';
    sessionStorage.removeItem(SKIP_INTRO_ONCE);
    return v;
  } catch {
    return false;
  }
}

/** True when the page runs inside an <iframe> embed (?embed=true / #embed=1): no intro, no chrome. */
export const isEmbed: boolean =
  params.get('embed') === 'true' ||
  params.get('embed') === '1' ||
  window.location.hash.indexOf('embed=1') > -1;
