import { $ } from './dom';
import { FIELD } from '../data';
import { fly } from './sky/camera';
import { radecToGal, parseCoord, findClosestTarget, skyDistance } from './sky/coords';
import { openChange } from './explorer';
import { setSeries, renderSeries } from './explorer/series';
import { applyCutoutFov } from './explorer/crossmatch';
import { openIrsa, startIrsaJob } from './panels/irsa';

// Deep links (query or hash): ?target=<id>&mode=<S|F|M|C|D>, ?ra=&dec=[&fov=][&mode=], target=co2 = CO₂ scan.
// Coordinates within 0.4° of a catalog target open its data; anywhere else starts an IRSA cutout job.
// Links are built by panels/share.js. main.tsx skips the intro for them.

const MATCH_DEG = 0.4;

/** Snap a requested FOV to the three cutout sizes. */
const snapFov = (fv) => (fv <= 0.2 ? '0.15' : fv >= 0.4 ? '0.50' : '0.30');

function applyFov(fov) {
  if (!fov) return;
  if ($('#cutoutFovSelect')) {
    $('#cutoutFovSelect').value = fov;
    applyCutoutFov();
  }
  if ($('#irsaFovSelect')) $('#irsaFovSelect').value = fov;
  if ($('#searchFovSelect')) $('#searchFovSelect').value = fov;
  renderSeries();
}

export function handleRoute() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const param = (key) => hash.get(key) || query.get(key);

  const target = param('target');
  const mode = param('mode') || 'M';
  const fovParam = parseFloat(param('fov'));
  const fov = isNaN(fovParam) ? null : snapFov(fovParam);

  if (target) {
    if (target === 'co2') openChange('C', 'barnard');
    else if (target === 'dec' || target === 'aug' || target === 'swipe') openChange(mode, 'barnard');
    else openChange(mode, target);
    applyFov(fov);
    return;
  }

  const ra = parseCoord(param('ra'), false);
  const dec = parseCoord(param('dec'), true);
  if (param('ra') === null || param('dec') === null) {
    applyFov(fov);
    return;
  }
  if (isNaN(ra) || isNaN(dec)) return;

  const g = radecToGal(ra, dec);
  fly(['RA ' + ra.toFixed(2) + '°, Dec ' + dec.toFixed(2) + '°', g.l, g.b], 38);
  const idx = findClosestTarget(ra, dec);
  if (skyDistance(FIELD[idx], ra, dec) <= MATCH_DEG) {
    openChange(mode);
    setSeries(idx);
    applyFov(fov);
  } else {
    openIrsa(ra.toFixed(4), dec.toFixed(4), 'Sky Field (' + ra.toFixed(2) + '°, ' + dec.toFixed(2) + '°)');
    applyFov(fov);
    startIrsaJob(true);
  }
}

export function initRoutes() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
