// Tiny shared store between the viewer (ui/src/viewer/) and the React intro / story.

export interface UIState {
  /** both sky textures are loaded (reported by viewer/sky/scene.js) */
  sceneReady: boolean;
  /** the intro has finished: page content may animate in */
  revealed: boolean;
  /** fatal scene error (WebGL unavailable) */
  error: string | null;
}

let state: UIState = { sceneReady: false, revealed: false, error: null };
const subs = new Set<() => void>();
const revealCallbacks: Array<() => void> = [];

export const getState = (): UIState => state;

export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

function set(patch: Partial<UIState>): void {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn());
}

export function sceneReady(): void {
  if (!state.sceneReady) set({ sceneReady: true });
}

export function fail(message: unknown): void {
  set({ error: String(message) });
}

// Page content (story hero, header, watermark) appears: run the viewer's callbacks first so its GSAP
// entrance can set start values, then lift the "hidden while intro" class.
export function reveal(): void {
  if (state.revealed) return;
  revealCallbacks.forEach((cb) => {
    try { cb(); } catch (e) { console.warn('reveal callback:', e); }
  });
  document.body.classList.remove('ui-intro');
  set({ revealed: true });
}

export function onReveal(cb: () => void): void {
  if (state.revealed) cb();
  else revealCallbacks.push(cb);
}
