import { $, $$ } from '../dom';
import { FIELD } from '../../data';
import { openModal, closeModal, dialogOf } from '../ui/modal';
import { showToast } from '../ui/toast';
import { fly } from '../sky/camera';
import { radecToGal, parseCoord, findClosestTarget, skyDistance } from '../sky/coords';
import { openChange } from '../explorer';
import { setSeries } from '../explorer/series';
import { applyCutoutFov } from '../explorer/crossmatch';
import { openIrsa, startIrsaJob } from './irsa';
import { enhanceSelect } from '../ui/dropdown';

// Header ▸ "Search RA/Dec" (#searchModal): type coordinates or pick a benchmark, then pan the globe there,
// open the target's multi-pass data (catalog match within 0.4°), or process an IRSA cutout for any other field.

const MATCH_DEG = 0.4;
let presetId = null; // id of the benchmark chip last picked

const modal = () => $('#searchModal');
const close = (then) => closeModal(modal(), dialogOf(modal()), then);
const typed = () => ({ ra: parseCoord($('#raInput').value, false), dec: parseCoord($('#decInput').value, true) });

function panGlobe() {
  const { ra, dec } = typed();
  if (isNaN(ra) || isNaN(dec)) {
    $('#searchMsg').textContent = 'Please enter valid RA and Dec coordinates.';
    return;
  }
  const g = radecToGal(ra, dec);
  close(() => {
    fly(['Target Coord', g.l, g.b], 35);
    showToast('Sky globe centered on RA ' + ra.toFixed(2) + '°, Dec ' + dec.toFixed(2) + '°');
  });
}

function inspectData() {
  const { ra, dec } = typed();
  const fov = ($('#searchFovSelect') && $('#searchFovSelect').value) || '0.30';
  if ($('#cutoutFovSelect')) {
    $('#cutoutFovSelect').value = fov;
    applyCutoutFov();
  }
  if ($('#irsaFovSelect')) $('#irsaFovSelect').value = fov;

  let idx = 0;
  let match = false;
  if (presetId) {
    const i = FIELD.findIndex((s) => s.id === presetId);
    if (i > -1) { idx = i; match = true; }
  } else if (!isNaN(ra) && !isNaN(dec)) {
    idx = findClosestTarget(ra, dec);
    match = skyDistance(FIELD[idx], ra, dec) <= MATCH_DEG;
  }

  close(() => {
    if (match || isNaN(ra) || isNaN(dec)) {
      openChange('M');
      setSeries(idx);
      showToast('Opened SPHEREx multi-pass analysis for ' + FIELD[idx].name + ' (FOV ' + fov + '°)');
    } else {
      openIrsa(ra.toFixed(4), dec.toFixed(4), 'Sky Field (' + ra.toFixed(2) + '°, ' + dec.toFixed(2) + '°)');
      if ($('#irsaFovSelect')) $('#irsaFovSelect').value = fov;
      startIrsaJob(true);
    }
  });
}

export function initSearch() {
  enhanceSelect($('#searchFovSelect'));
  $('#searchBtn').onclick = () => {
    openModal(modal(), dialogOf(modal()));
    $('#raInput').focus();
  };
  $('#closeSearch').onclick = () => close();

  $$('#searchModal .preset-chip').forEach((chip) => {
    chip.onclick = function () {
      $('#raInput').value = this.dataset.ra || '';
      $('#decInput').value = this.dataset.dec || '';
      presetId = this.dataset.id || null;
      $('#searchMsg').textContent = 'Selected: ' + this.textContent;
    };
  });

  $('#jumpSkyBtn').onclick = panGlobe;
  $('#inspectCutoutBtn').onclick = inspectData;
  $('#searchToIrsaMailBtn').onclick = () => {
    const ra = $('#raInput').value.trim() || '269.4521';
    const dec = $('#decInput').value.trim() || '4.6934';
    close(() => openIrsa(ra, dec, presetId || 'IRSA Custom Target'));
  };
}
