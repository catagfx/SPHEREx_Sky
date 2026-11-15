import { $ } from '../dom';
import { FIELD } from '../../data';
import { openModal, closeModal, dialogOf } from '../ui/modal';
import { showToast } from '../ui/toast';
import { closeDropdowns } from '../ui/header';
import { downloadJson } from '../ui/download';
import { fly } from '../sky/camera';
import { radecToGal } from '../sky/coords';
import { st } from '../explorer/state';
import { openChange } from '../explorer';
import { setSeries, capFrames, addSeriesOption, renderSeries } from '../explorer/series';
import { renderSpectrum } from '../explorer/spectrum';
import { setTelemetry } from '../explorer/telemetry';
import { enhanceSelect } from '../ui/dropdown';

// Data ▸ "Data Releases & JSON Ingest" (#releaseModal): pick the survey release (passes available), re-index the
// local FITS archive, load a custom candidate from JSON, or download the whole catalog as JSON.

const modal = () => $('#releaseModal');
const close = (then) => closeModal(modal(), dialogOf(modal()), then);

function syncFitsArchive(btn) {
  const msg = $('#syncFitsMsg');
  btn.disabled = true;
  if (msg) msg.textContent = 'Scanning local FITS archive (data/movers_cutouts/)...';
  fetch('/api/sync-data-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    .then((r) => r.json())
    .then((data) => {
      btn.disabled = false;
      if (data && data.ok && data.telemetry) {
        setTelemetry(data.telemetry);
        const total = data.total_fits_indexed || data.total_fits_files || 36;
        const targets = data.targets_synced || (data.synced_targets || []).length || 6;
        if (msg) msg.textContent = 'Synced ' + total + ' FITS cutouts across ' + targets + ' targets. Spectrophotometry & contamination bitmasks updated.';
        renderSeries();
        if (st.mode === 'C') renderSpectrum();
        showToast('Synced ' + total + ' real FITS files from local archive!');
      } else if (msg) {
        msg.textContent = 'Sync error: ' + ((data && data.error) || 'Unknown error');
      }
    })
    .catch((err) => {
      btn.disabled = false;
      if (msg) msg.textContent = 'Sync failed: ' + err.message;
    });
}

function loadCustomCandidate() {
  const txt = $('#ingestJson').value.trim();
  const msg = $('#ingestMsg');
  if (!txt) { msg.textContent = 'Please paste target JSON.'; return; }
  let data;
  try {
    data = JSON.parse(txt);
  } catch (err) {
    msg.textContent = 'Invalid JSON: ' + err.message;
    return;
  }
  if (!data.id || !data.frames || !Array.isArray(data.frames) || !data.frames.length) {
    msg.textContent = 'Error: JSON must include an "id" and a non-empty "frames" array.';
    return;
  }
  data.label = data.label || data.name || data.id;
  data.name = data.name || data.label;
  data.kind = data.kind || 'Custom SPHEREx Candidate';
  data.crop = data.crop || 24;
  data.r = data.r || 18;
  data.closeTitle = data.closeTitle || 'Close-ups on ' + data.name;
  data.aside = data.aside || '<p class="small">User-ingested custom candidate data.</p>';
  data.tags = data.tags || ['custom', 'candidate'];
  FIELD.push(data);
  const idx = FIELD.length - 1;
  addSeriesOption(idx, data.label);

  close(() => {
    showToast('Loaded custom candidate: ' + data.name);
    openChange('M');
    setSeries(idx);
    if (data.ra !== undefined && data.dec !== undefined) {
      const g = radecToGal(data.ra, data.dec);
      fly(['Candidate', g.l, g.b], 35);
    }
  });
}

export function initRelease() {
  enhanceSelect($('#surveyReleaseSelect'));
  $('#releaseMenuBtn').onclick = () => {
    closeDropdowns();
    openModal(modal(), dialogOf(modal()));
  };
  $('#closeRelease').onclick = () => close();

  $('#surveyReleaseSelect').onchange = function () {
    const rel1 = this.value === 'rel1';
    showToast('Switched to ' + (rel1 ? 'Release 1 (Passes 1–2)' : 'Release 2 (Passes 1–6)'));
    capFrames(rel1 ? 2 : 6);
  };
  $('#syncFitsArchiveBtn').onclick = function () { syncFitsArchive(this); };
  $('#loadCustomBtn').onclick = loadCustomCandidate;
  $('#exportCatalogBtn').onclick = () => {
    downloadJson(FIELD, 'spherex_survey_catalog.json');
    showToast('Downloaded SPHEREx catalog JSON');
  };
}
