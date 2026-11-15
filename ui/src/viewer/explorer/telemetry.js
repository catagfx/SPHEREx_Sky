import { FIELD } from '../../data';
import { apiUrl } from '../../core/api';

// FITS telemetry per target (field sources, contamination zones, 6-band SED), extracted by the backend from the
// local Level 2 FITS archive (GET /api/fits-telemetry, refreshed by Data ▸ "Sync Local FITS Archive").
// Targets without archive telemetry get a deterministic fallback derived from their coordinates.

let telemetry = {};

export function setTelemetry(data) {
  telemetry = data || {};
}

/** Fetch once at start; `onLoaded` re-renders if the explorer is open. */
export function loadTelemetry(onLoaded) {
  fetch(apiUrl('/api/fits-telemetry'))
    .then((r) => r.json())
    .then((data) => {
      if (data && data.ok && data.telemetry) {
        setTelemetry(data.telemetry);
        onLoaded();
      }
    })
    .catch(() => {});
}

const clampX = (v) => Math.min(0.88, Math.max(0.12, v));
const clampY = (v) => Math.min(0.85, Math.max(0.15, v));

function fallbackTelemetry(t) {
  const ra0 = Number(t.ra || 269.45);
  const dec0 = Number(t.dec || 4.69);
  const f0 = (t.frames && t.frames[0]) || { x: 0.5, y: 0.5, wl: 1.35, flux: 12.4 };
  const flux = Number(f0.flux || 12.5);
  const x0 = f0.x || 0.5;
  const y0 = f0.y || 0.5;
  const source = (id, catalog, dx, dy, dra, ddec, k) => ({
    id, catalog,
    x: clampX(x0 + dx), y: clampY(y0 + dy),
    ra: +(ra0 + dra).toFixed(4), dec: +(dec0 + ddec).toFixed(4),
    flux_mjy_sr: +(flux * k).toFixed(2),
  });
  const band = (det, wl, k, desc) => ({ det, wl_um: wl, flux_mjy_sr: +(flux * k).toFixed(3), desc });
  return {
    target_id: t.id,
    fits_count: (t.frames || []).length,
    field_sources: [
      source('GAIA_DR3_01', 'Gaia DR3 + AllWISE', -0.22, -0.16, -0.042, 0.031, 1.4),
      source('GAIA_DR3_02', 'Gaia DR3 + AllWISE', 0.24, -0.14, 0.048, 0.028, 0.9),
      source('GAIA_DR3_03', 'Gaia DR3 + AllWISE', 0.04, -0.26, 0.011, 0.052, 0.8),
      source('ALLWISE_04', 'AllWISE IR', -0.18, 0.21, -0.035, -0.039, 0.7),
      source('ALLWISE_05', 'AllWISE IR', 0.19, 0.18, 0.037, -0.034, 0.6),
      source('ALLWISE_06', 'AllWISE IR', -0.06, 0.27, -0.014, -0.051, 0.5),
    ],
    contam_zones: [
      {
        x: f0.x || 0.5, y: f0.y || 0.5, r: 28,
        code: t.is_synthetic ? 'SYNTH' : '0x00',
        label: t.is_synthetic ? 'SYNTHETIC DEMO APERTURE' : 'FLAG 0x00: Clean Zodiacal-Subtracted Science Aperture',
      },
    ],
    sed_bands: [
      band('D1', 0.92, 0.78, '0.75–1.10 µm Near-IR Continuum'),
      band('D2', 1.35, 1.0, '1.10–1.63 µm J/H-Band (FITS Direct)'),
      band('D3', 2.02, 0.92, '1.63–2.42 µm K-Band Molecular'),
      band('D4', 3.12, 0.74, '2.42–3.82 µm H₂O Ice / PAH Band'),
      band('D5', 4.18, 0.68, '3.82–4.42 µm CO₂ / CO Vibrational'),
      band('D6', 4.72, 0.59, '4.42–5.00 µm Thermal Infrared'),
    ],
  };
}

/** Telemetry of a target (FIELD entry or id). */
export function getTargetTelemetry(target) {
  if (!target) return null;
  if (typeof target === 'string') target = FIELD.find((s) => s.id === target) || { id: target };
  return telemetry[target.id] || fallbackTelemetry(target);
}
