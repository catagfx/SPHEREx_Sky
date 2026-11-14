import gsap from 'gsap';
import { $ } from '../dom';
import { prefersReducedMotion as reduce } from '../../core/env';
import { FIELD, EPOCHS, LANDMARKS } from '../../data';
import { st, series } from './state';
import { openModal, closeModal } from '../ui/modal';
import { borrowNav, restoreNav } from '../ui/header';
import { hideCardNow, showCard } from '../sky/card';
import { fly } from '../sky/camera';
import { radecToGal } from '../sky/coords';
import { initEpochs, renderEpochs, isAugust, nextEpoch } from './epochs';
import { initSeries, renderSeries, setSeries, drawStrip, nextFrame } from './series';
import { initSpectrum, renderSpectrum, nextChannel } from './spectrum';
import { initDifference, renderDifference } from './difference';
import { initCrossmatch } from './crossmatch';
import { loadTelemetry } from './telemetry';

// "See it change" (#chg): the time-domain explorer dialog. This module owns the dialog, the mode toolbar and
// the shared render(); each mode draws itself (epochs.js S/F, series.js M, spectrum.js C, difference.js D).

let lastView = null; // the visual that last played its switch-in animation

export function render() {
  const M = st.mode === 'M';
  const C = st.mode === 'C';
  const D = st.mode === 'D';
  $('#sw').hidden = M || C || D;
  $('#mv').hidden = !M;
  $('#cs').hidden = !C;
  $('#diffView').hidden = !D;
  $('#grM').hidden = !M;
  $('#grC').hidden = !C;
  $('#grD').hidden = !D;
  $('#asE').hidden = M || C || D;
  $('#asM').hidden = !(M || D);
  $('#asC').hidden = !C;
  $('#rgl').hidden = C;
  $('#mM').setAttribute('aria-pressed', M);
  $('#mC').setAttribute('aria-pressed', C);
  $('#mD').setAttribute('aria-pressed', D);

  const view = M ? $('#mv') : C ? $('#cs') : D ? $('#diffView') : $('#sw');
  if (!reduce && lastView !== view && !$('#chg').hidden) {
    lastView = view;
    gsap.fromTo(view, { opacity: 0.6, scale: 0.985 }, { opacity: 1, scale: 1, duration: 0.28, ease: 'power2.out' });
  }

  if (M || C || D) {
    $('#mS').setAttribute('aria-pressed', false);
    $('#mF').setAttribute('aria-pressed', false);
    $('#grS').hidden = $('#grF').hidden = true;
    if (M) renderSeries();
    else if (C) renderSpectrum();
    else renderDifference();
    return;
  }
  renderEpochs();
}

/** Stop every Play button (flip, motion, color scan). */
export function stopPlayback() {
  [['flip', '#fp'], ['motion', '#mp'], ['scan', '#cp']].forEach(([key, sel]) => {
    clearInterval(st.timers[key]);
    st.timers[key] = null;
    $(sel).setAttribute('aria-pressed', false);
    $(sel).textContent = 'Play';
  });
}

/**
 * Open the explorer in mode m (S, F, M, C, D). With a target id (FIELD), the field-based modes (M, C, D)
 * switch to that target first.
 */
export function openChange(m, targetId) {
  st.mode = m || 'S';
  const idx = targetId ? FIELD.findIndex((s) => s.id === targetId) : -1;
  if (idx > -1 && st.mode !== 'S' && st.mode !== 'F') setSeries(idx);
  else if (st.mode === 'M') setSeries(st.si);
  openModal($('#chg'), $('#cwrap'));
  hideCardNow();
  borrowNav(st.mode === 'C' ? 'colors' : 'change');
  render();
  $('#chx').focus();
}

/** Close the explorer (no-op when it is not open). */
export function closeChange() {
  if ($('#chg').hidden) return;
  closeModal($('#chg'), $('#cwrap'), () => {
    stopPlayback();
    restoreNav();
  });
}

function setMode(m) {
  if (m === 'F') st.cur = st.ib; // flip starts from the date shown on the right of the swipe
  st.mode = m;
  stopPlayback();
  render();
}

function bindPlay(sel, key, ms, step) {
  $(sel).onclick = function () {
    if (st.timers[key]) { stopPlayback(); return; }
    this.setAttribute('aria-pressed', true);
    this.textContent = 'Pause';
    st.timers[key] = setInterval(() => { step(); render(); }, ms);
  };
}

const COMET_SERIES = [];

/** Where the target was in pass `frame`: its "RA x°, Dec y°" note, else the catalog coordinates. */
function targetPosition(s, frame) {
  const m = frame && frame.b && /RA (-?[\d.]+)°, Dec ([+-]?[\d.]+)°/.exec(frame.b);
  if (m) return { ra: +m[1], dec: +m[2] };
  return s && s.ra !== undefined && s.dec !== undefined ? { ra: s.ra, dec: s.dec } : null;
}

/**
 * "Locate in 360° Sky": close the dialog and fly to what it shows: the selected target where it was in the
 * selected pass (modes M / C / D), or Barnard's Star landmark (swipe / flip modes).
 */
function locateInSky() {
  const s = series();
  const fieldMode = st.mode === 'M' || st.mode === 'C' || st.mode === 'D';
  const pos = fieldMode && s && COMET_SERIES.indexOf(s.id) < 0 ? targetPosition(s, st.FR[st.fi]) : null;
  if (pos) {
    const g = radecToGal(pos.ra, pos.dec);
    const name = s.name || s.label;
    closeChange();
    fly([name, g.l, g.b], 35);
    showCard(name, s.blurb || s.caption || '');
    return;
  }
  const h = LANDMARKS[5];
  closeChange();
  fly(h);
  showCard(h[3], h[4]);
}

export function initExplorer() {
  initEpochs();
  initSeries();
  initSpectrum();
  initDifference();
  initCrossmatch();

  $('#rgk').onchange = () => {
    render();
    if (st.mode === 'M') drawStrip();
  };
  $('#mS').onclick = () => setMode('S');
  $('#mF').onclick = () => setMode('F');
  $('#mM').onclick = () => setMode('M');
  $('#mD').onclick = () => setMode('D');
  $('#mC').onclick = () => setMode('C');
  bindPlay('#fp', 'flip', 900, nextEpoch);
  bindPlay('#mp', 'motion', 1100, nextFrame);
  bindPlay('#cp', 'scan', 1300, nextChannel);

  $('#chx').onclick = closeChange;
  $('#chb').onclick = () => openChange('S');
  $('#fly2').onclick = locateInSky;

  setSeries(0);
  loadTelemetry(() => { if (!$('#chg').hidden) render(); });
}
