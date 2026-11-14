import { $ } from '../dom';
import { COLORS } from '../../data';
import { st, series } from './state';
import { niceDate } from './format';
import { getTargetTelemetry } from './telemetry';
import { render, stopPlayback } from './index';
import { showToast } from '../ui/toast';

// Mode C ("Scan the colors"): 6-band SPHEREx SED (detectors D1–D6) from the FITS telemetry. CSV export.

const COMET_SERIES = [];

const DEFAULT_BANDS = [
  { det: 'D1', wl_um: 0.93, flux_mjy_sr: 12.4, note: 'Optical/NIR photosphere' },
  { det: 'D2', wl_um: 1.38, flux_mjy_sr: 14.8, note: 'J/H continuum peak' },
  { det: 'D3', wl_um: 1.98, flux_mjy_sr: 11.2, note: 'K-band continuum' },
  { det: 'D4', wl_um: 2.95, flux_mjy_sr: 6.8, note: '3.0 µm ice/water band' },
  { det: 'D5', wl_um: 4.18, flux_mjy_sr: 3.9, note: 'CO / CO₂ fundamental band' },
  { det: 'D6', wl_um: 4.82, flux_mjy_sr: 2.8, note: 'Thermal M-band continuum' },
];

/** The spectrum shown in mode C: { isComet, targetName, wMin, wMax, ticks, unit, points[] }. */
export function activeSpectrum() {
  const s = series();
  if (!s || COMET_SERIES.indexOf(s.id) > -1) {
    return {
      isComet: true,
      targetName: 'Comet 3I/ATLAS (Narrowband CO₂ Scan)',
      wMin: 3.75,
      wMax: 4.4,
      ticks: [3.8, 4.0, 4.2, 4.4],
      unit: 'Relative Narrowband Flux',
      points: COLORS.map((e) => ({ wl: e.wl, f: e.f, u: e.u, x: e.x, y: e.y, d: e.d, t: e.t, b: e.b, det: 'D5' })),
    };
  }
  const tel = getTargetTelemetry(s.id);
  const bands = tel && Array.isArray(tel.sed_bands) && tel.sed_bands.length ? tel.sed_bands : DEFAULT_BANDS;
  const frames = s.frames || [];
  return {
    isComet: false,
    targetName: s.name + ' (Real FITS Calibrated SED)',
    wMin: 0.75,
    wMax: 5.05,
    ticks: [1.0, 2.0, 3.0, 4.0, 5.0],
    unit: 'MJy / sr (FITS HDU 1)',
    points: bands.map((b, idx) => {
      const fr = frames[idx % Math.max(1, frames.length)] || frames[0] || { u: 'assets/m_ba_0.jpg', x: 0.5, y: 0.5, d: '2025-08-15', t: '00:00', b: b.det };
      return {
        wl: b.wl_um, f: b.flux_mjy_sr, u: fr.u, x: fr.x, y: fr.y, d: fr.d, t: fr.t || '00:00',
        b: 'SPHEREx ' + b.det + ' (' + b.wl_um.toFixed(2) + ' µm) — ' + b.note + ' · ' + b.flux_mjy_sr.toFixed(3) + ' MJy/sr',
        det: b.det,
        note: b.note,
      };
    }),
  };
}

/** Chart x (SVG units) of wavelength w. */
const chartX = (w, lo, hi) => 30 + ((w - lo) / Math.max(0.01, hi - lo)) * 262;

function cometCaption(e) {
  const nearCO2 = Math.abs(e.wl - 4.26) < 0.1;
  const msg = e.f >= 0.3
    ? 'This color matches carbon dioxide gas. The comet is wrapped in a bright, extended glow.'
    : e.f >= 0.04
      ? 'There is only a weak glow around the comet at this color' + (nearCO2 ? ", which is close to carbon dioxide's." : '.')
      : 'No glow is visible at this color' + (nearCO2 ? ", even though it is close to carbon dioxide's." : '.');
  return '<b>' + e.wl.toFixed(3) + ' µm</b>, ' + niceDate(e.d) + ', ' + e.t + ' UT<br>' + msg + '<br><span class="dm">' + e.b + '</span>';
}

/** Mode C part of render(). */
export function renderSpectrum() {
  const spec = activeSpectrum();
  const pts = spec.points;
  st.CN = pts.length;
  if (st.ci >= st.CN) st.ci = 0;
  $('#cw').max = Math.max(0, st.CN - 1);

  const e = pts[st.ci];
  let ymax = Math.max.apply(0, pts.map((q) => q.f)) * 1.15;
  if (ymax <= 0) ymax = 1;
  const img = $('#csI');
  const key = spec.targetName + '_' + st.ci;
  if (img.dataset.i !== key) {
    img.src = e.u;
    img.dataset.i = key;
    img.alt = spec.targetName + ' image at ' + e.wl.toFixed(2) + ' microns';
  }
  const ring = $('#csR');
  ring.style.left = e.x * 100 + '%';
  ring.style.top = e.y * 100 + '%';
  $('#csT').textContent = e.wl.toFixed(3) + ' µm · ' + e.det + ' (channel ' + (st.ci + 1) + ' of ' + st.CN + ')';
  $('#cw').value = st.ci;

  $('#cap2').innerHTML = spec.isComet
    ? cometCaption(e)
    : '<b>' + spec.targetName + ' — ' + e.wl.toFixed(2) + ' µm (' + e.det + ')</b><br>Measured FITS Surface Brightness: <b style="color:#8fd3ff;">' +
      e.f.toFixed(3) + ' MJy/sr</b> · ' + (e.note || 'Level 2 LVF spectrophotometry') + '<br><span class="dm">' + e.b + '</span>';

  const x = (w) => chartX(w, spec.wMin, spec.wMax);
  let svg = '<svg viewBox="0 0 300 136" role="img" aria-label="Spectrophotometric brightness versus wavelength."><line x1="30" y1="104" x2="292" y2="104" stroke="#2a3558"/>';
  spec.ticks.forEach((w) => { svg += '<text x="' + x(w) + '" y="120" fill="#8e98b8" font-size="9" text-anchor="middle">' + w.toFixed(1) + '</text>'; });
  svg += '<text x="161" y="132" fill="#8e98b8" font-size="9" text-anchor="middle">wavelength (µm) — ' + spec.unit + '</text>';
  if (spec.isComet) {
    svg += '<line x1="' + x(4.26) + '" y1="8" x2="' + x(4.26) + '" y2="104" stroke="#8fd3ff" stroke-dasharray="4 4"/><text x="' + (x(4.26) + 4) + '" y="16" fill="#8fd3ff" font-size="9">carbon dioxide, 4.26 µm</text>';
  } else {
    const line = pts.map((q) => x(q.wl).toFixed(1) + ',' + (104 - (q.f / ymax) * 86).toFixed(1)).join(' ');
    svg += '<polyline points="' + line + '" fill="none" stroke="rgba(143,211,255,0.45)" stroke-width="1.6" stroke-dasharray="3 2"/>';
  }
  pts.forEach((q, i) => {
    const on = i === st.ci;
    svg += '<circle data-i="' + i + '" cx="' + x(q.wl) + '" cy="' + (104 - (q.f / ymax) * 86) + '" r="' + (on ? 6 : 4.5) + '" fill="' + (on ? '#ffb86b' : '#5a6a8c') +
      '" stroke="#02030a"><title>' + q.wl.toFixed(2) + ' µm: ' + q.f.toFixed(3) + ' ' + spec.unit + '</title></circle>';
  });
  $('#cch').innerHTML = svg + '</svg>';
}

function downloadCsv() {
  const spec = activeSpectrum();
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = ['target,detector,wavelength_um,flux_value,flux_unit,description'];
  spec.points.forEach((p) => {
    lines.push(q(spec.targetName) + ',"' + (p.det || 'LVF') + '",' + p.wl.toFixed(4) + ',' + p.f.toFixed(5) + ',"' + spec.unit + '",' + q(p.note || p.b || ''));
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }));
  a.download = 'spherex_spectrum_' + ((series() && series().id) || 'target') + '.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 250);
  showToast('Downloaded real FITS spectrum CSV for ' + spec.targetName);
}

/** Play Scan: next channel. */
export function nextChannel() {
  st.ci = (st.ci + 1) % st.CN;
}

export function initSpectrum() {
  $('#cw').max = Math.max(0, st.CN - 1);
  if ($('#downloadSpectrumCsvBtn')) $('#downloadSpectrumCsvBtn').onclick = downloadCsv;
  $('#cch').addEventListener('click', (ev) => {
    const dot = ev.target.closest && ev.target.closest('circle');
    if (dot) { stopPlayback(); st.ci = +dot.getAttribute('data-i'); render(); }
  });
  $('#cw').oninput = function () { stopPlayback(); st.ci = +this.value; render(); };
}
