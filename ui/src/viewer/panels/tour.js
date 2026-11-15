import { $ } from '../dom';
import { LANDMARKS, CONSTELLATIONS } from '../../data';
import { setActiveNav } from '../ui/header';
import { fly, zoomBack } from '../sky/camera';
import { gyro, gyroOff } from '../sky/gyro';
import { showCard, hideCardNow } from '../sky/card';
import { focusConstellationByName, leaveConstellationFocus } from '../sky/constellations';
import { openChange, closeChange } from '../explorer';

// Explore ▸ Guided Tour (and the hero's "Guided Audio Tour"): a narrated trip through the landmarks and the
// explorer modes. Speech synthesis reads each stop; muted, each stop lasts by its word count.
// While it runs the story page is not interactive (body.hero-mode off: no section paging, no progress nav).

const STEPS = [
  { t: 'Welcome', p: "Welcome. You are standing at the center of the whole sky, as seen by NASA's SPHEREx mission, which maps the sky in infrared light. Let's visit a few places." },
  ...LANDMARKS.map((h) => ({ h, t: h[3], p: h[5] })),
  // a few constellations, shown exactly as when you open one yourself: focus on the figure, info panel on the right
  ...['Orion', 'Cygnus', 'Scorpius', 'Sagittarius', 'Draco']
    .map((name) => CONSTELLATIONS.find((c) => c.name === name))
    .filter(Boolean)
    .map((c) => ({ c: c.name, t: c.name, p: c.info || c.name })),
  { t: 'See it change', p: "Now the part that matters most. Here are real SPHEREx images of Barnard's Star across multiple survey passes. Slide the divider to compare two observation dates.", open: 'S' },
  { t: 'Watch it move', p: "Lined up on the same patch of sky, distant background stars stay fixed while Barnard's Star drifts over 10 arcseconds per year across the detector.", open: 'M', target: 'barnard' },
  { t: 'Scan the colors', p: 'And SPHEREx sees 102 infrared colors across 6 detector bands, measuring calibrated spectral energy distributions from 0.75 to 5.0 microns.', open: 'C', target: 'barnard' },
  { t: 'That is the tour', p: 'That is the tour. Drag to explore on your own, or open the Gallery to inspect brown dwarfs, variable stars, and the Planet X search field.', close: true },
];

// on: running; i: current stop; tok: invalidates callbacks of an interrupted stop; t: pending timeout
const T = { on: false, i: 0, tok: 0, mute: false, paused: false, t: null };
const hasSpeech = () => 'speechSynthesis' in window;

export const isTourOn = () => T.on;

function say(text, tok, next) {
  if (hasSpeech()) speechSynthesis.cancel();
  clearTimeout(T.t);
  const done = () => {
    if (tok !== T.tok) return;
    T.t = setTimeout(() => { if (tok === T.tok) next(); }, 900);
  };
  if (T.mute || !hasSpeech()) {
    T.t = setTimeout(() => { if (tok === T.tok) next(); }, Math.max(4000, text.split(' ').length * 380));
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.lang = 'en-US';
  u.onend = done;
  u.onerror = done;
  speechSynthesis.speak(u);
}

function step() {
  const s = STEPS[T.i];
  if (!s) { endTour(); return; }
  const tok = ++T.tok;
  $('#tn').textContent = 'Stop ' + (T.i + 1) + ' of ' + STEPS.length;
  if (s.c) {
    hideCardNow();                              // the constellation panel on the right is the info
    focusConstellationByName(s.c);
  } else {
    leaveConstellationFocus();
    if (s.h) fly(s.h);
    showCard(s.t, s.p);
  }
  if (s.open) openChange(s.open, s.target);
  if (s.close) closeChange();
  say(s.p, tok, () => { T.i++; step(); });
}

export function endTour() {
  T.on = false;
  T.tok++;
  clearTimeout(T.t);
  if (hasSpeech()) speechSynthesis.cancel();
  $('#tour').hidden = true;
  $('#bot').hidden = false;
  document.body.classList.remove('tour-active');
  leaveConstellationFocus();
  hideCardNow();
  if (!document.body.classList.contains('free-look-active')) document.body.classList.add('hero-mode');
  zoomBack();
}

export function toggleTour() {
  if (T.on) { endTour(); return; }
  if (gyro.on) gyroOff();
  document.body.classList.remove('hero-mode');
  document.body.classList.add('tour-active');     // the sky alone, like free-look (css/story.css hides the story page)
  closeChange();
  T.on = true;
  T.i = 0;
  T.paused = false;
  setActiveNav('tour');
  $('#tpa').textContent = 'Pause';
  $('#tour').hidden = false;
  $('#bot').hidden = true;
  step();
}

export function initTour() {
  $('#tbtn').onclick = toggleTour;
  $('#tst').onclick = endTour;
  $('#tsk').onclick = () => {
    if (!T.on) return;
    T.paused = false;
    $('#tpa').textContent = 'Pause';
    T.i++;
    step();
  };
  $('#tpa').onclick = function () {
    if (T.paused) {
      T.paused = false;
      this.textContent = 'Pause';
      step();
    } else {
      T.paused = true;
      T.tok++;
      clearTimeout(T.t);
      if (hasSpeech()) speechSynthesis.cancel();
      this.textContent = 'Resume';
    }
  };
  $('#tmu').onclick = function () {
    T.mute = !T.mute;
    this.setAttribute('aria-pressed', T.mute);
    this.textContent = T.mute ? 'Voice off' : 'Mute voice';
    if (T.mute && hasSpeech()) speechSynthesis.cancel();
  };
}
