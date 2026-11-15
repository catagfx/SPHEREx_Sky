import { view, setSpin } from '../sky/view';
import { dir } from '../sky/scene';
import { gyro, gyroOff } from '../sky/gyro';
import { $ } from '../dom';

// The presenter's sky, shared with the room. The host sends where the globe points (at most 10 times a second,
// only when it changed, unreliable delivery: the next message replaces a lost one). Everyone else follows it
// until they move the globe themselves.

const SEND_EVERY_MS = 100;
const HEARTBEAT_MS = 2000; // a lost last message would leave followers a bit off; repeat the position now and then
const TAU = Math.PI * 2;
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Where the globe points now: galactic longitude / latitude (degrees) and field of view. */
export function getSkyState() {
  const p = Math.atan2(-Math.sin(view.ty), -Math.cos(view.ty)); // inverse of scene.js dir()
  let l = (0.5 - p / TAU) * 360;
  l = ((l % 360) + 360) % 360;
  const b = (Math.max(-1.45, Math.min(1.45, view.tp)) * 180) / Math.PI;
  return { l: +l.toFixed(2), b: +b.toFixed(2), zoom: +view.tf.toFixed(1), const: '' };
}

/** Point the globe there; the camera's own easing makes it smooth. */
export function setSkyState(s) {
  if (!s || !Number.isFinite(s.l) || !Number.isFinite(s.b) || !Number.isFinite(s.zoom)) return;
  if (gyro.on) gyroOff();
  setSpin(false);
  view.anim = null;
  const v = dir(s.l, s.b);
  view.ty += norm(Math.atan2(-v.z, -v.x) - view.ty); // the short way round
  view.tp = Math.max(-1.45, Math.min(1.45, Math.asin(v.y)));
  view.tf = Math.max(25, Math.min(100, s.zoom));
}

let seq = 0;
let lastSent = null;
let lastSentAt = 0;
let timer = null;

/** Host: start sending. `send(obj, {reliable})` comes from the session. */
export function startCasting(send) {
  stopCasting();
  seq = Math.floor(Date.now() / 100); // always above what an earlier session of this host sent
  timer = setInterval(() => {
    const s = getSkyState();
    const moved = !lastSent || Math.abs(s.l - lastSent.l) > 0.02 || Math.abs(s.b - lastSent.b) > 0.02 || Math.abs(s.zoom - lastSent.zoom) > 0.1;
    if (!moved && performance.now() - lastSentAt < HEARTBEAT_MS) return;
    lastSent = s;
    lastSentAt = performance.now();
    send({ t: 'sky', ...s, seq: ++seq }, { reliable: false });
  }, SEND_EVERY_MS);
}

/** Host: answer a late joiner with the current position (to that participant only). */
export function sendSkyTo(send, identity) {
  send({ t: 'sky', ...getSkyState(), seq: ++seq }, { reliable: true, to: [identity] });
}

export function stopCasting() {
  clearInterval(timer);
  timer = null;
  lastSent = null;
}

// ---- following ----
let following = true;
let lastSeq = -1;
let latest = null;
let onFollowChange = () => {};
let active = false; // in a room as a non-host

export const isFollowing = () => following;
export const watchFollow = (fn) => { onFollowChange = fn; };

function setFollowing(on) {
  if (following === on) return;
  following = on;
  onFollowChange(on);
}

/** A `sky` message from the presenter. */
export function receiveSky(msg) {
  if (!Number.isFinite(msg.seq) || msg.seq <= lastSeq) return; // late, out of order
  lastSeq = msg.seq;
  latest = msg;
  if (following) setSkyState(msg);
}

/** "Back to presenter". */
export function resumeFollowing() {
  setFollowing(true);
  if (latest) setSkyState(latest);
}

let bound = false;
function bindUserInput() {
  if (bound) return;
  bound = true;
  const stop = () => { if (active) setFollowing(false); };
  const canvas = $('#c');
  if (canvas) {
    canvas.addEventListener('pointerdown', stop);
    canvas.addEventListener('wheel', stop, { passive: true });
  }
  addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(e.key)) stop();
  });
}

/** Listener: begin following. */
export function startFollowing() {
  bindUserInput();
  active = true;
  following = true;
  lastSeq = -1;
  latest = null;
  onFollowChange(true);
}

export function stopFollowing() {
  active = false;
  latest = null;
  lastSeq = -1;
}
