import { $ } from '../dom';
import { FIELD } from '../../data';
import { st, series } from './state';
import { niceDate, frameLabel, isMultiPass, utSuffix } from './format';
import { getTargetTelemetry } from './telemetry';
import { renderSeriesAside } from './aside';
import { updateCrossmatch, currentFov } from './crossmatch';
import { render, stopPlayback } from './index';

// Mode M ("Watch it move"): one fixed patch of sky over several passes. The stars stay put, the target moves.
// SVG overlay (#mvS): trail, ring, FOV scale bar, optional Gaia/WISE sources, contamination mask, co-add HUD;
// close-up strip (#strip) with one canvas per pass.

const W = 720;
const H = 540;
let cells = [];
let picker = null; // <select> of all targets, in the mode M controls

/** Paint each close-up canvas (a crop around the target, optional ring). */
export function drawStrip() {
  const showRing = !$('#rgk') || $('#rgk').checked;
  st.FR.forEach((e, i) => {
    if (!cells[i]) return;
    const c = cells[i].querySelector('canvas');
    const g = c.getContext && c.getContext('2d');
    if (!g) return;
    c.width = c.height = 144;
    if (!e.im || !e.im.complete || !e.im.naturalWidth) {
      g.fillStyle = '#0b101d';
      g.fillRect(0, 0, 144, 144);
      return;
    }
    const iw = e.im.naturalWidth;
    const ih = e.im.naturalHeight;
    const N = series().crop || 26; // half size of the close-up, in image pixels
    const cx = Math.max(N, Math.min(iw - N, e.x * iw));
    const cy = Math.max(N, Math.min(ih - N, e.y * ih));
    g.imageSmoothingEnabled = true;
    g.drawImage(e.im, cx - N, cy - N, 2 * N, 2 * N, 0, 0, 144, 144);
    if (showRing) {
      g.strokeStyle = '#ffb86b';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(72, 72, 22, 0, 2 * Math.PI);
      g.stroke();
    }
  });
}

function buildStrip() {
  const strip = $('#strip');
  strip.innerHTML = '';
  cells = [];
  strip.style.gridTemplateColumns = 'repeat(' + Math.min(st.FN, 5) + ', 1fr)';
  const multiPass = isMultiPass(series());
  st.FR.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'cell' + (i === st.fi ? ' on' : '');
    d.innerHTML = '<canvas width="144" height="144"></canvas>' + (multiPass ? '<div class="cell-pass">Pass ' + (i + 1) + '</div>' : '') +
      '<span class="cell-date">' + frameLabel(e) + '</span>';
    d.onclick = () => { st.fi = i; renderSeries(); };
    strip.appendChild(d);
    cells.push(d);
    if (!e.im) {
      e.im = new Image();
      e.im.onload = () => drawStrip();
      e.im.src = e.u;
    } else if (e.im.complete) {
      setTimeout(drawStrip, 20);
    }
  });
  drawStrip();
}

const fx = (v) => v.toFixed(1);

function trailSvg(P) {
  const s = series();
  let out = '<polyline points="' + P.slice(0, st.fi + 1).map((p) => fx(p[0]) + ',' + fx(p[1])).join(' ') +
    '" fill="none" stroke="#ffb86b" stroke-width="2" stroke-dasharray="7 6" opacity=".85"/>';
  for (let j = 0; j < st.fi; j++) {
    out += '<circle cx="' + P[j][0] + '" cy="' + P[j][1] + '" r="4" fill="#ffb86b" opacity=".85"/><text x="' + P[j][0] + '" y="' + (P[j][1] - 14) +
      '" fill="#ffd9a8" font-size="15" text-anchor="middle">' + frameLabel(st.FR[j]) + '</text>';
  }
  if (st.fi > 0) {
    const from = '<line x1="' + P[0][0] + '" y1="' + P[0][1] + '" x2="' + P[st.fi][0] + '" y2="' + P[st.fi][1] + '"';
    // proper-motion vector (stars / brown dwarfs) or the Planet X parallax shift
    if (s.id === 'barnard' || s.id === 'wise0855' || s.id === 'epsindi') out += from + ' stroke="#8fd3ff" stroke-width="2.5"/>';
    if (s.id === 'planetx') out += from + ' stroke="#ff8f8f" stroke-width="2.5" stroke-dasharray="4 4"/>';
  }
  return out;
}

function scaleBarSvg() {
  const fov = parseFloat(currentFov()) || 0.3;
  const arcmin = +(fov * 60 * 0.2).toFixed(1);
  return '<g class="fov-scale-overlay" transform="translate(18, 514)">' +
    '<line x1="0" y1="0" x2="115" y2="0" stroke="#93d5ff" stroke-width="2"/>' +
    '<line x1="0" y1="-5" x2="0" y2="5" stroke="#93d5ff" stroke-width="2"/>' +
    '<line x1="115" y1="-5" x2="115" y2="5" stroke="#93d5ff" stroke-width="2"/>' +
    '<text x="57.5" y="-7" fill="#93d5ff" font-size="11" font-family="monospace" text-anchor="middle">' + arcmin + '′ (FOV ' + fov.toFixed(2) + '°)</text>' +
    '</g>';
}

/** Gaia DR3 (dashed circles) and AllWISE (diamonds) sources from the FITS field telemetry. */
function catalogSvg() {
  const tel = getTargetTelemetry(series());
  let out = '';
  ((tel && tel.field_sources) || []).forEach((src) => {
    const sx = src.x * W;
    const sy = src.y * H;
    if (src.catalog.indexOf('Gaia') > -1) {
      out += '<circle class="gaia-overlay-marker" cx="' + fx(sx) + '" cy="' + fx(sy) + '" r="11" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="3 2"/>' +
        '<line x1="' + fx(sx) + '" y1="' + fx(sy) + '" x2="' + fx(sx + 14) + '" y2="' + fx(sy - 10) + '" stroke="#38bdf8" stroke-width="1.5"/>' +
        '<text x="' + fx(sx) + '" y="' + fx(sy + 22) + '" fill="#38bdf8" font-size="10" font-family="monospace" text-anchor="middle">Gaia DR3 (' + src.flux_mjy_sr + ' MJy)</text>';
    } else {
      const d = 9;
      const pts = sx + ',' + (sy - d) + ' ' + (sx + d) + ',' + sy + ' ' + sx + ',' + (sy + d) + ' ' + (sx - d) + ',' + sy;
      out += '<polygon class="wise-overlay-marker" points="' + pts + '" fill="none" stroke="#f472b6" stroke-width="1.8"/>' +
        '<text x="' + fx(sx) + '" y="' + fx(sy + 21) + '" fill="#f472b6" font-size="10" font-family="monospace" text-anchor="middle">AllWISE (' + src.ra.toFixed(2) + '°)</text>';
    }
  });
  return out;
}

/** Level 2 bitmask zones: clean aperture (green) or masked / saturated core (red). */
function contaminationSvg() {
  const tel = getTargetTelemetry(series());
  let out = '';
  ((tel && tel.contam_zones) || []).forEach((z) => {
    const zx = z.x * W;
    const zy = z.y * H;
    const zr = (z.r || 24) * 1.35;
    const clean = z.code === '0x00';
    const col = clean ? '#4ade80' : '#f87171';
    out += '<circle class="contam-mask-zone" cx="' + fx(zx) + '" cy="' + fx(zy) + '" r="' + fx(zr) + '" fill="' + (clean ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.22)') +
      '" stroke="' + col + '" stroke-width="2" stroke-dasharray="5 3"/>' +
      '<text x="' + fx(zx) + '" y="' + fx(zy - zr - 6) + '" fill="' + col + '" font-size="11" font-weight="bold" font-family="monospace" text-anchor="middle">' + z.label + '</text>';
  });
  return out;
}

function updateCoaddHud() {
  const on = $('#coaddToggle') && $('#coaddToggle').checked;
  $('#mv').classList.toggle('coadded-active', on);
  let hud = $('#mvCoaddHud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'mvCoaddHud';
    hud.className = 'coadd-hud';
    $('#mv').appendChild(hud);
  }
  hud.hidden = !on;
  const n = Math.max(2, st.FN || 3);
  hud.textContent = n + '-PASS BAND STACK, SNR ×√' + n + ' (+' + Math.round((Math.sqrt(n) - 1) * 100) + '%)';
}

const checked = (sel) => !$(sel) || $(sel).checked;
const checkedIfPresent = (sel) => $(sel) && $(sel).checked;

/** Mode M part of render(). */
/** Pass slider: a dot for every pass on the line (css/explorer.css reads --t, the pixel distance between two dots). */
function setPassDots() {
  const s = $('#ms');
  if (!s) return;
  const w = s.getBoundingClientRect().width;
  if (w > 40) s.style.setProperty('--t', ((w - 20) / Math.max(1, st.FN - 1)).toFixed(3) + 'px');
}
window.addEventListener('resize', setPassDots);

export function renderSeries() {
  if (!st.FN) return;
  const s = series();
  const e = st.FR[st.fi];
  const P = st.FR.map((q) => [q.x * W, q.y * H]);
  const img = $('#mvI');
  if (img.dataset.i !== st.si + '-' + st.fi) {
    img.src = e.u;
    img.dataset.i = st.si + '-' + st.fi;
  }

  let svg = '';
  if (checked('#mk')) svg += trailSvg(P);
  if (checked('#rgk')) {
    svg += '<circle cx="' + P[st.fi][0] + '" cy="' + P[st.fi][1] + '" r="' + (s.r || 17) + '" fill="none" stroke="#ffb86b" stroke-width="2.5"/><text x="' + P[st.fi][0] +
      '" y="' + (P[st.fi][1] - 26) + '" fill="#fff" font-size="16" text-anchor="middle">' + frameLabel(e) + '</text>';
  }
  svg += scaleBarSvg();
  if (checkedIfPresent('#gaiaWiseOverlayToggle')) svg += catalogSvg();
  if (checkedIfPresent('#contamMaskToggle')) svg += contaminationSvg();
  updateCoaddHud();

  $('#mvS').innerHTML = svg;
  const when = niceDate(e.d) + utSuffix(e);
  $('#mvT').textContent = when + '  (frame ' + (st.fi + 1) + ' of ' + st.FN + ')';
  $('#ms').value = st.fi;
  setPassDots();
  $('#cap2').innerHTML = '<b>' + when + ', frame ' + (st.fi + 1) + ' of ' + st.FN + '</b><br>' + s.caption + '<br><span class="dm">' + e.b +
    (e.cov < 0.95 ? ' Dark corners are outside this image.' : '') + '</span>';
  cells.forEach((c, i) => { c.className = 'cell' + (i === st.fi ? ' on' : ''); });
  updateCrossmatch();
  renderSeriesAside();
}

/** Select target n of FIELD (resets to its first pass). */
export function setSeries(n) {
  const s = FIELD[n];
  st.si = n;
  st.FR = s.frames;
  st.FN = st.FR.length;
  st.fi = 0;
  $('#ms').max = Math.max(0, st.FN - 1);
  $('#asT').textContent = s.closeTitle;
  if (s.fov_deg && $('#cutoutFovSelect')) {
    const fv = Number(s.fov_deg).toFixed(2);
    if (fv === '0.15' || fv === '0.30' || fv === '0.50') $('#cutoutFovSelect').value = fv;
  }
  renderSeriesAside();
  picker.value = n;
  buildStrip();
  updateCrossmatch();
  render();
}

/** Jump to pass idx (strip cells, tracker points: window.selectFrame). */
export function selectFrame(idx) {
  st.fi = idx;
  renderSeries();
}

/** Data Releases: only the first `max` passes of the current target are available. */
export function capFrames(max) {
  st.FN = Math.min(max, series().frames.length);
  st.fi = Math.min(st.fi, st.FN - 1);
  $('#ms').max = Math.max(0, st.FN - 1);
  buildStrip();
  renderSeries();
}

/** A target was appended to FIELD (JSON ingest, processed IRSA job): list it in the picker. */
export function addSeriesOption(idx, label) {
  const o = document.createElement('option');
  o.value = idx;
  o.textContent = label;
  picker.appendChild(o);
}

/** Flip through passes (Play Motion). */
export function nextFrame() {
  st.fi = (st.fi + 1) % st.FN;
}

export function initSeries() {
  const row = document.createElement('span');
  row.className = 'row';
  row.style.margin = '0';
  row.style.width = 'auto';
  $('#grM').insertBefore(row, $('#grM').firstChild);

  picker = document.createElement('select');
  picker.setAttribute('aria-label', 'Choose an object');
  FIELD.forEach((s, n) => addSeriesOption(n, s.label));
  picker.onchange = function () { stopPlayback(); setSeries(+this.value); };
  row.appendChild(picker);

  $('#mM').addEventListener('click', () => requestAnimationFrame(() => requestAnimationFrame(setPassDots)));
  $('#ms').oninput = function () { st.fi = +this.value; render(); };
  $('#mk').onchange = render;
  ['#coaddToggle', '#gaiaWiseOverlayToggle', '#contamMaskToggle'].forEach((sel) => {
    if ($(sel)) $(sel).onchange = renderSeries;
  });
}
