// Environment flags shared by the whole UI (React layer and viewer).

const params = new URLSearchParams(window.location.search);

// Motion preference. The OS setting (Windows "Animation effects", macOS "Reduce motion") reaches the page as
// prefers-reduced-motion. It can be overridden per browser with ?motion=full | reduced, remembered in localStorage
// (?motion=auto goes back to the OS setting).
function readMotionOverride(): 'full' | 'reduced' | null {
  try {
    const p = params.get('motion');
    if (p === 'full' || p === 'reduced') localStorage.setItem('spx_motion', p);
    else if (p === 'auto') localStorage.removeItem('spx_motion');
    const v = localStorage.getItem('spx_motion');
    return v === 'full' || v === 'reduced' ? v : null;
  } catch {
    return null;
  }
}

const override = readMotionOverride();

/** OS asks for less motion (before any override). */
export const osReducedMotion: boolean =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Calm mode: no travelling, zooming or blurring motion, only fades. The intro and story still play
 * (gently), they never disappear.
 */
export const prefersReducedMotion: boolean = override ? override === 'reduced' : osReducedMotion;

document.documentElement.classList.toggle('reduce-motion', prefersReducedMotion);

/** True when the page runs inside an <iframe> embed (?embed=true / #embed=1): no intro, no chrome. */
export const isEmbed: boolean =
  params.get('embed') === 'true' ||
  params.get('embed') === '1' ||
  window.location.hash.indexOf('embed=1') > -1;
