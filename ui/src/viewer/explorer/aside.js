import { $ } from '../dom';
import INSIGHTS from '../../data/target-insights.json';
import { st, series } from './state';

// Right-hand panel of "Watch it move" (#asN): per-target metrics + a clickable pass tracker (data in
// data/target-insights.json), the FITS photometry tracker for other targets, and the co-add SNR card.

const AXIS_ANCHOR = ['start', 'middle', 'end'];

function metricsBox({ title, items }) {
  return '<div class="metric-box"><strong>' + title + '</strong><div class="metric-grid">' +
    items.map(([label, value]) => '<div class="metric-item"><span>' + label + '</span><strong>' + value + '</strong></div>').join('') +
    '</div></div>';
}

/** Small SVG chart; each point selects that pass (window.selectFrame, see viewer/api.js). */
function trackerBox({ title, path, points, axis, hint }) {
  let svg = '<div class="metric-box"><strong>' + title + '</strong>' +
    '<svg viewBox="0 0 300 110" id="starChart" style="margin-top:6px;width:100%;height:auto;display:block;">';
  if (path) svg += '<path d="' + path + '" fill="none" stroke="#8fd3ff" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="0"/>';
  (axis || []).slice(0, 3).forEach((l, i) => {
    svg += '<text x="' + l.x + '" y="103" fill="#8e98b8" font-size="8.5" text-anchor="' + (l.anchor || AXIS_ANCHOR[i]) + '">' + l.t + '</text>';
  });
  points.forEach((pt, idx) => {
    const active = idx === st.fi;
    if (active) svg += '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="8" fill="none" stroke="#ffb86b" stroke-width="1.5" stroke-opacity="0.6"/>';
    svg += '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="' + (active ? 6 : 4) + '" fill="' + (active ? '#ffb86b' : '#4a5b7d') +
      '" stroke="#fff" stroke-width="1.5" style="cursor:pointer;" onclick="window.selectFrame(' + idx + ')"><title>' + pt.label + '</title></circle>';
    if (pt.sub) {
      svg += '<text x="' + pt.x + '" y="' + (pt.y - 9) + '" fill="' + (active ? '#ffb86b' : '#adb7d4') + '" font-size="7.5" font-weight="' +
        (active ? 'bold' : 'normal') + '" text-anchor="middle" style="pointer-events:none;">' + pt.sub + '</text>';
    }
  });
  return svg + '</svg><p class="small" style="margin:4px 0 0;color:var(--dim);">' + hint + '</p></div>';
}

function noteBox({ title, text }) {
  return '<div class="metric-box" style="margin-top:8px;"><strong>' + title + '</strong><p class="small" style="margin:4px 0 0;">' + text + '</p></div>';
}

/** Targets with extracted FITS photometry (e.g. processed IRSA jobs) but no hand-written insight. */
function photometryTracker(spectrum) {
  const n = spectrum.length;
  const points = spectrum.map((sp, idx) => ({
    x: Math.round(45 + idx * (215 / Math.max(1, n - 1))),
    y: Math.round(78 - (idx % 2) * 28),
    label: 'Pass ' + sp.pass + ' (' + sp.date + '): ' + sp.det + ' (' + sp.wl_um + ' µm) · Flux ' + sp.flux_mjy_sr + ' MJy/sr',
    sub: sp.wl_um + 'µm (' + sp.flux_mjy_sr + ' MJy)',
  }));
  return trackerBox({
    title: 'On-the-Fly Extracted FITS Photometry & Wavelengths',
    path: 'M ' + points.map((p) => p.x + ',' + p.y).join(' L '),
    points,
    axis: [
      { x: 45, t: points[0].sub, anchor: 'start' },
      { x: 260, t: points[n - 1].sub, anchor: 'end' },
    ],
    hint: 'Extracted directly from WCS-aligned Level 2 FITS cutouts. Click points to inspect pass.',
  });
}

function coaddCard() {
  const n = Math.max(2, st.FN || 3);
  const gain = Math.sqrt(n);
  return '<div class="metric-box" style="border-color:var(--cool);background:rgba(143,211,255,0.08);margin-top:10px;">' +
    '<strong style="color:var(--cool);">Per-Detector Band Co-Addition (' + n + '-Pass Stack)</strong>' +
    '<div class="metric-grid" style="margin-top:6px;">' +
    '<div class="metric-item"><span>Stacked Exposures</span><strong style="color:#fff;">' + n + ' Passes (Same Band)</strong></div>' +
    '<div class="metric-item"><span>Theoretical SNR Gain</span><strong style="color:var(--cool);">√' + n + ' ≈ ' + gain.toFixed(2) + '× (+' + Math.round((gain - 1) * 100) + '%)</strong></div>' +
    '<div class="metric-item"><span>Single-Pass SNR</span><strong style="color:#ff9898;">1.8σ (Baseline)</strong></div>' +
    '<div class="metric-item"><span>Co-Added Peak</span><strong style="color:#8fd3ff;">' + (1.8 * gain).toFixed(1) + 'σ (Enhanced)</strong></div>' +
    '</div><p class="small" style="margin:6px 0 0;">Because SPHEREx’s 6 detectors (D1–D6) cover distinct wavelength bands (0.75–5.0 µm), co-adding repeated passes within each detector band separately reduces background Poisson noise by √N.</p></div>';
}

export function renderSeriesAside() {
  const box = $('#asN');
  if (!box) return;
  const s = series();
  const insight = INSIGHTS[s.id];
  let html;
  if (insight) {
    html = metricsBox(insight.metrics) + trackerBox(insight.tracker) + (insight.note ? noteBox(insight.note) : '') + (s.aside || '');
  } else {
    html = s.aside || '';
    if (s.spectrum_points && s.spectrum_points.length >= 2) html = photometryTracker(s.spectrum_points) + html;
  }
  if ($('#coaddToggle') && $('#coaddToggle').checked) html += coaddCard();
  box.innerHTML = html;
}
