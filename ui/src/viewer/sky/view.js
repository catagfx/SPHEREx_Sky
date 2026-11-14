import { $ } from '../dom';

// Camera state, shared by the controls, the fly-to animations, the gyro and the render loop.
// yaw / pit / fov = current (radians, radians, degrees); ty / tp / tf = where they are easing to.
export const view = {
  yaw: 0, pit: 0, fov: 75,
  ty: 0, tp: 0, tf: 75,
  spin: false,  // auto-orbit
  anim: null,   // running fly-to: { t0, dur, y0, p0, f0, y1, p1, f1, bump }
};

/** Auto-orbit on / off (Tools ▸ Auto-orbit reflects it). */
export function setSpin(on) {
  view.spin = on;
  $('#spin').setAttribute('aria-pressed', on);
}
