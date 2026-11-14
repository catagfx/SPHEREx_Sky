import { $ } from '../dom';
import { prefersReducedMotion as reduce } from '../../core/env';
import { dir } from './scene';
import { view, setSpin } from './view';
import { gyro, gyroOff, applyGyro } from './gyro';
import { pulseLandmark, projectLandmarks } from './landmarks';
import { updateConstellationLabels } from './constellations';
import { updateCompare } from './layers';
import { isTourOn } from '../panels/tour';

// Looking around the globe: drag / pinch / wheel / arrow keys, fly-to animations, and the render loop.

let sky = null;
const MIN_FOV = 25;
const MAX_FOV = 100;
const clampFov = (f) => Math.max(MIN_FOV, Math.min(MAX_FOV, f));
const clampPitch = (p) => Math.max(-1.45, Math.min(1.45, p));

function resize() {
  const { ren, cam, uniforms } = sky;
  ren.setSize(innerWidth, innerHeight);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  ren.getDrawingBufferSize(uniforms.res.value);
  updateCompare();
}

function initPointerControls(canvas) {
  const pointers = {};
  canvas.addEventListener('pointerdown', (e) => {
    view.anim = null;
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = [e.clientX, e.clientY];
    setSpin(false);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers[e.pointerId];
    if (!p) return;
    const ids = Object.keys(pointers);
    if (ids.length === 2) { // pinch zoom
      const o = pointers[ids.filter((i) => i != e.pointerId)[0]];
      const d0 = Math.hypot(p[0] - o[0], p[1] - o[1]);
      p[0] = e.clientX; p[1] = e.clientY;
      const d1 = Math.hypot(p[0] - o[0], p[1] - o[1]);
      view.tf = clampFov((view.tf * d0) / Math.max(d1, 1));
      return;
    }
    const k = (view.tf * Math.PI) / 180 / innerHeight;
    if (!gyro.on) {
      view.ty -= (e.clientX - p[0]) * k;
      view.tp = clampPitch(view.tp + (e.clientY - p[1]) * k);
    }
    p[0] = e.clientX; p[1] = e.clientY;
  });
  ['pointerup', 'pointercancel'].forEach((n) => canvas.addEventListener(n, (e) => { delete pointers[e.pointerId]; }));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.anim = null;
    view.tf = clampFov(view.tf + e.deltaY * 0.05);
  }, { passive: false });

  // arrow keys pan, + / - zoom (the story pager takes the arrows first while the story page is active)
  addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const s = (0.08 * view.tf) / 75;
    let used = true;
    if (e.key === 'ArrowLeft') view.ty -= s;
    else if (e.key === 'ArrowRight') view.ty += s;
    else if (e.key === 'ArrowUp') view.tp = Math.min(1.45, view.tp + s);
    else if (e.key === 'ArrowDown') view.tp = Math.max(-1.45, view.tp - s);
    else if (e.key === '+' || e.key === '=') view.tf = Math.max(MIN_FOV, view.tf - 5);
    else if (e.key === '-') view.tf = Math.min(MAX_FOV, view.tf + 5);
    else used = false;
    if (used) e.preventDefault();
  });
}

/**
 * Fly the camera to a sky position. `h` = [label, galactic l, galactic b, ...] (a landmark or an ad-hoc target),
 * `zoom` = final field of view (default 45°). Calm mode cuts there instantly.
 */
export function fly(h, zoom) {
  if (gyro.on) gyroOff();
  const v = dir(h[1], h[2]);
  let d = Math.atan2(-v.z, -v.x) - view.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest way round
  const y1 = view.yaw + d;
  const p1 = Math.asin(v.y);
  const f1 = zoom || 45;
  const dist = (Math.hypot(d * Math.cos((view.pit + p1) / 2), p1 - view.pit) * 180) / Math.PI;
  setSpin(false);
  if (reduce) {
    view.yaw = view.ty = y1;
    view.pit = view.tp = p1;
    view.fov = view.tf = f1;
    view.anim = null;
  } else {
    view.anim = {
      t0: performance.now(), dur: Math.max(700, Math.min(1700, 500 + dist * 9)),
      y0: view.yaw, p0: view.pit, f0: view.fov, y1, p1, f1, bump: Math.min(26, dist * 0.35),
    };
  }
  pulseLandmark(h);
}

/**
 * Fly directly to a saved camera pose (yaw/pit/fov) — used to return to the spot the user left when
 * closing an immersive focus view such as a selected constellation.
 */
export function flyToView(yaw, pit, fov) {
  if (gyro.on) gyroOff();
  let d = yaw - view.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const y1 = view.yaw + d;
  const dist = (Math.hypot(d * Math.cos((view.pit + pit) / 2), pit - view.pit) * 180) / Math.PI;
  if (reduce) {
    view.yaw = view.ty = y1;
    view.pit = view.tp = pit;
    view.fov = view.tf = fov;
    view.anim = null;
  } else {
    view.anim = {
      t0: performance.now(), dur: Math.max(600, Math.min(1500, 500 + dist * 8)),
      y0: view.yaw, p0: view.pit, f0: view.fov, y1, p1: pit, f1: fov, bump: Math.min(20, dist * 0.3),
    };
  }
}

/** Ease back out to the default field of view after a close-up (not during the guided tour). */
export function zoomBack() {
  if (!view.anim && view.tf < 70 && !isTourOn()) {
    view.anim = { t0: performance.now(), dur: 700, y0: view.yaw, p0: view.pit, f0: view.fov, y1: view.yaw, p1: view.pit, f1: 75, bump: 0 };
  }
}

function stepCamera(cam) {
  const a = view.anim;
  if (a) {
    const u = Math.min(1, (performance.now() - a.t0) / a.dur);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    view.yaw = view.ty = a.y0 + (a.y1 - a.y0) * e;
    view.pit = view.tp = a.p0 + (a.p1 - a.p0) * e;
    view.fov = view.tf = a.f0 + (a.f1 - a.f0) * e + a.bump * Math.sin(Math.PI * u); // slight zoom-out mid-flight
    if (u >= 1) {
      view.yaw = view.ty = a.y1;
      view.pit = view.tp = a.p1;
      view.fov = view.tf = a.f1;
      view.anim = null;
    }
  }
  if (view.spin && !reduce) view.ty -= (0.0012 * view.tf) / 75;
  const s = reduce ? 1 : 0.14;
  view.yaw += (view.ty - view.yaw) * s;
  view.pit += (view.tp - view.pit) * s;
  view.fov += (view.tf - view.fov) * (reduce ? 1 : 0.2);
  if (Math.abs(view.fov - cam.fov) > 0.01) { cam.fov = view.fov; cam.updateProjectionMatrix(); }
  if (!applyGyro(cam)) {
    cam.lookAt(-Math.cos(view.pit) * Math.cos(view.yaw), Math.sin(view.pit), -Math.cos(view.pit) * Math.sin(view.yaw));
  }
  cam.updateMatrixWorld();
}

export function initCamera(s) {
  sky = s;
  addEventListener('resize', resize);
  resize();
  initPointerControls($('#c'));
  $('#grid').onclick = function () {
    sky.grid.visible = !sky.grid.visible;
    this.setAttribute('aria-pressed', sky.grid.visible);
  };
  $('#spin').onclick = () => setSpin(!view.spin);
}

export function startRenderLoop() {
  const { ren, scene, cam } = sky;
  ren.setAnimationLoop(() => {
    const inXR = ren.xr.isPresenting;
    if (!inXR) stepCamera(cam);
    projectLandmarks(cam, inXR);
    updateConstellationLabels(cam, inXR);
    // VR module (viewer/sky/xr/index.js) ticks its hand-tracking + UI update here.
    if (inXR && typeof sky.onXRFrame === 'function') sky.onXRFrame();
    ren.render(scene, cam);
  });
}
