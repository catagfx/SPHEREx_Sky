import { $ } from '../dom';
import { st, series } from './state';
import { getTargetTelemetry } from './telemetry';

// The bar under the explorer's image: cutout field of view (FOV), the Level 2 contamination flag of the current
// pass, links to SIMBAD / Aladin / IRSA for the target, and the optional embedded Aladin Lite view.

/** Selected cutout FOV in degrees, as the <select> value ("0.15" | "0.30" | "0.50"). */
export function currentFov() {
  const el = $('#cutoutFovSelect');
  return el && el.value ? el.value : '0.30';
}

function flagStyle(badge, synthetic, warn) {
  badge.style.color = synthetic ? '#fde68a' : warn ? '#fbbf24' : '#4ade80';
  badge.style.borderColor = synthetic ? 'rgba(245,158,11,0.5)' : warn ? 'rgba(251,191,36,0.45)' : 'rgba(74,222,128,0.35)';
  badge.style.background = synthetic ? 'rgba(66,32,6,0.65)' : warn ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.1)';
}

export function updateCrossmatch() {
  const s = series() || {};
  const e = st.FR && st.FR[st.fi] ? st.FR[st.fi] : st.FR ? st.FR[0] : {};
  const ra = s.ra !== undefined ? Number(s.ra) : 269.4521;
  const dec = s.dec !== undefined ? Number(s.dec) : 4.6934;

  const badge = $('#contamFlagBadge');
  if (badge) {
    const tel = getTargetTelemetry(s);
    const pass = tel && tel.passes && tel.passes[st.fi] ? tel.passes[st.fi] : null;
    const flag = e && e.contam_flag ? e.contam_flag
      : pass && pass.contam_flag ? pass.contam_flag
      : s.is_synthetic ? 'SYNTHETIC DEMO' : '0x00 (CLEAN L2 SCIENCE)';
    const warn = flag.indexOf('0x02') > -1 || flag.indexOf('0x01') > -1;
    badge.textContent = s.is_synthetic ? '⚠️ SYNTHETIC SIMULATION' : 'FLAG ' + flag;
    flagStyle(badge, s.is_synthetic, warn);
  }

  const coord = encodeURIComponent(ra.toFixed(5) + ' ' + (dec >= 0 ? '+' : '') + dec.toFixed(5));
  const fov = currentFov();
  const aladinUrl = 'https://aladin.cds.unistra.fr/AladinLite/?target=' + coord + '&fov=' + encodeURIComponent(fov) + '&survey=P%2FallWISE%2Fcolor';
  const simbad = $('#xrefSimbad');
  if (simbad) simbad.href = 'https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=' + coord + '&CooFrame=FK5&CooEpoch=2000&CooEqui=2000&Radius=5&Radius.unit=arcmin';
  const aladin = $('#xrefAladin');
  if (aladin) aladin.href = aladinUrl;
  const irsa = $('#xrefIrsa');
  if (irsa) {
    irsa.href = 'https://irsa.ipac.caltech.edu/applications/finderchart/?__action=table.search&request=%7B%22startIdx%22%3A0%2C%22pageSize%22%3A100%2C%22UserTargetWorldPt%22%3A%22' +
      ra.toFixed(5) + '%3B' + dec.toFixed(5) + '%3BEQ_J2000%22%7D';
  }

  const box = $('#aladinEmbedBox');
  const frame = $('#aladinIframe');
  if (box && !box.hidden && frame) {
    if (frame.dataset.src !== aladinUrl) {
      loadAladin(frame, aladinUrl);
    }
    const readout = $('#aladinCoordReadout');
    if (readout) {
      readout.textContent = (s.name || 'Target') + ', RA ' + ra.toFixed(4) + '°, Dec ' + (dec >= 0 ? '+' : '') + dec.toFixed(4) + '°, FOV ' + fov + '°';
    }
  }
}

// The embedded view needs the CDS servers: show "loading" while it comes up, and a clear way out when it cannot
// (offline, blocked, slow) instead of an empty black frame.
let loadTimer = 0;
function setStatus(text, kind) {
  const el = $('#aladinStatus');
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind || '';
  el.hidden = !text;
}

function loadAladin(frame, url) {
  clearTimeout(loadTimer);
  frame.dataset.src = url;
  if (navigator.onLine === false) {
    setStatus('You are offline. Connect to the internet to see the live Aladin Lite view, or open it later with the Aladin button.', 'warn');
    return;
  }
  setStatus('Loading the live sky from CDS Aladin Lite...', 'load');
  frame.onload = () => { clearTimeout(loadTimer); setStatus('', ''); };
  frame.src = url;
  loadTimer = setTimeout(() => {
    setStatus('The live view is taking long or is blocked here. Use the Aladin button to open it in a new tab.', 'warn');
  }, 9000);
}

/** Zoom the cutout views to match the chosen FOV (0.15° = closer, 0.50° = wider). */
export function applyCutoutFov() {
  const fovEl = $('#cutoutFovSelect');
  if (!fovEl) return;
  const fov = parseFloat(fovEl.value) || 0.3;
  const scale = fov < 0.2 ? 1.55 : fov > 0.4 ? 0.88 : 1.0;
  ['#mvI', '#mvS', '#imA', '#imB', '#diffC'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.style.transform = scale === 1.0 ? '' : 'scale(' + scale.toFixed(2) + ')';
    el.style.transformOrigin = 'center center';
    el.style.transition = 'transform 0.25s ease';
  });
  updateCrossmatch();
}

export function initCrossmatch() {
  const toggle = $('#aladinEmbedBtn');
  if (toggle) {
    toggle.onclick = function () {
      const box = $('#aladinEmbedBox');
      if (!box) return;
      box.hidden = !box.hidden;
      this.textContent = box.hidden ? 'Toggle Live Aladin / WISE View' : 'Hide Live Aladin / WISE View';
      this.setAttribute('aria-pressed', String(!box.hidden));
      if (!box.hidden) {
        updateCrossmatch();
        const dlg = $('#chg');
        requestAnimationFrame(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
        if (dlg) dlg.scrollTop = dlg.scrollTop; // keep the dialog scroll position valid
      }
    };
  }
  const fovEl = $('#cutoutFovSelect');
  if (fovEl) fovEl.onchange = applyCutoutFov;
}
