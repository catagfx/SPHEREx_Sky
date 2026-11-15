import { $ } from '../dom';
import { openModal, closeModal, dialogOf } from '../ui/modal';
import { showToast } from '../ui/toast';
import { downloadJson } from '../ui/download';
import { enhanceSelect } from '../ui/dropdown';
import { st, series } from '../explorer/state';

// Share ▸ "Flag Candidate" (#anomalyModal): a citizen-science discovery report (JSON) for the target and pass
// currently shown in the explorer.

const MODE_NAMES = { M: 'Fixed-Field Motion', D: 'Digital Difference Subtraction', C: 'Spectroscopy' };

const modal = () => $('#anomalyModal');
const close = () => closeModal(modal(), dialogOf(modal()));
const currentFrame = () => st.FR[st.fi] || st.FR[0];

function fillSummary() {
  const s = series();
  const f = currentFrame();
  const box = $('#anomalySummaryCard');
  if (!box) return;
  box.innerHTML = '<strong>Candidate Target: ' + (s.name || s.label) + '</strong><br>' +
    '<span>Equatorial Coordinates: RA ' + (s.ra !== undefined ? s.ra.toFixed(4) + '°' : 'N/A') + ', Dec ' + (s.dec !== undefined ? s.dec.toFixed(4) + '°' : 'N/A') + '</span><br>' +
    '<span>Observation Timestamp: ' + (f.d || 'Unknown') + ' ' + (f.t || '') + ' UT (Pass ' + (st.fi + 1) + ')</span><br>' +
    '<span style="color:var(--cool);">Active Analysis Mode: ' + (MODE_NAMES[st.mode] || 'Blink Divider') + '</span>';
}

export function generateAnomalyReport() {
  const s = series();
  const f = currentFrame();
  const notes = $('#observerNotes').value.trim();
  return {
    report_standard: 'NASA-SpaceApps-SPHEREx-Candidate-v1',
    discovery_id: 'SPX-' + Date.now().toString(36).toUpperCase(),
    timestamp_utc: new Date().toISOString(),
    target: {
      catalog_id: s.id,
      name: s.name || s.label,
      kind: s.kind,
      ra_deg: s.ra !== undefined ? s.ra : null,
      dec_deg: s.dec !== undefined ? s.dec : null,
    },
    observation: {
      survey_pass: st.fi + 1,
      date_obs: f.d,
      time_ut: f.t,
      normalized_coords: { x: f.x, y: f.y },
      analysis_mode: st.mode,
    },
    citizen_science_assessment: {
      candidate_type: $('#candidateClassification').value,
      confidence_level: parseInt($('#candidateConfidence').value, 10),
      observer_notes: notes || 'Candidate flagged during citizen science survey inspection.',
      coadded_arrays_used: $('#coaddToggle') && $('#coaddToggle').checked,
    },
  };
}

export function initAnomaly() {
  enhanceSelect($('#candidateClassification'));
  enhanceSelect($('#candidateConfidence'));
  $('#flagAnomalyBtn').onclick = () => {
    openModal(modal(), dialogOf(modal()));
    fillSummary();
  };
  $('#closeAnomaly').onclick = close;
  $('#copyAnomalyReport').onclick = () => {
    const json = JSON.stringify(generateAnomalyReport(), null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(() => showToast('Discovery Report JSON copied to clipboard!'));
    } else {
      prompt('Copy Discovery Report JSON:', json);
    }
  };
  $('#downloadAnomalyReport').onclick = () => {
    const report = generateAnomalyReport();
    downloadJson(report, 'SPHEREx_Discovery_' + (report.target.catalog_id || 'Candidate') + '.json');
    close();
    showToast('Official Discovery Report downloaded!');
  };
}
