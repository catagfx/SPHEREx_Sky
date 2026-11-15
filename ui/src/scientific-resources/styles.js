// The panel's stylesheet, injected once into <head>. Vite bundles the CSS as a string (?inline), so the panel
// needs no <link> in index.html, no Vite config and no backend route: importing the module is the whole setup,
// in `npm run dev` and in the committed js/ui.bundle.js alike.
import css from './scientific-resources.css?inline';

export const STYLE_ID = 'sr-styles';

/**
 * Adds <style id="sr-styles"> once; later calls return the existing element. If that element holds other CSS
 * (an older copy left by a dev-server reload or a previous mount), its content is refreshed, never duplicated.
 */
export function ensureStyles(doc = document) {
  const existing = doc.getElementById(STYLE_ID);
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return existing;
  }
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  doc.head.appendChild(el);
  return el;
}
