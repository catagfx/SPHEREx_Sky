import { FIELD } from '../../data';

// Sky coordinates: equatorial (RA / Dec) -> galactic, parsing typed coordinates, nearest catalog target.

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/** Equatorial J2000 (degrees) -> galactic { l, b } (degrees). */
export function radecToGal(raDeg, decDeg) {
  const ra = toRad(raDeg);
  const dec = toRad(decDeg);
  const raGP = toRad(192.85948);   // north galactic pole
  const decGP = toRad(27.12825);
  const lCP = toRad(122.93192);    // galactic longitude of the north celestial pole

  const sinB = Math.sin(dec) * Math.sin(decGP) + Math.cos(dec) * Math.cos(decGP) * Math.cos(ra - raGP);
  const b = Math.asin(Math.max(-1, Math.min(1, sinB)));
  const y = Math.cos(dec) * Math.sin(ra - raGP);
  const x = Math.cos(decGP) * Math.sin(dec) - Math.sin(decGP) * Math.cos(dec) * Math.cos(ra - raGP);
  let l = (lCP - Math.atan2(y, x)) % (2 * Math.PI);
  if (l < 0) l += 2 * Math.PI;
  return { l: toDeg(l), b: toDeg(b) };
}

/**
 * Parses decimal degrees ("133.795", "-7.2°") or sexagesimal ("08h 55m 10s", "08:55:10", "-07° 14′ 43″").
 * RA in hours is converted to degrees. Returns NaN when it cannot be read.
 */
export function parseCoord(val, isDec) {
  if (!val) return NaN;
  val = String(val).trim().replace(/[°deg]/gi, '');
  if (/^[+-]?\d+(\.\d+)?$/.test(val)) return parseFloat(val);
  const sign = val.indexOf('-') > -1 ? -1 : 1;
  const parts = val.replace(/[-+hms:"'′″]/g, ' ').trim().split(/\s+/).map(Number);
  if (parts.length >= 1 && !isNaN(parts[0])) {
    let deg = parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
    if (!isDec && (val.indexOf('h') > -1 || (parts[0] <= 24 && val.indexOf(':') > -1))) deg *= 15;
    return sign * deg;
  }
  return NaN;
}

/** Small-angle distance (degrees) from a catalog object to (ra, dec); Infinity-like 999 without coordinates. */
export function skyDistance(obj, ra, dec) {
  if (!obj || obj.ra === undefined || obj.dec === undefined) return 999;
  return Math.hypot((obj.ra - ra) * Math.cos(toRad(dec)), obj.dec - dec);
}

/** Index of the catalog target closest to (ra, dec). */
export function findClosestTarget(ra, dec) {
  let best = 0;
  let bestDist = 1e9;
  FIELD.forEach((s, idx) => {
    if (s.ra === undefined || s.dec === undefined) return;
    const d = skyDistance(s, ra, dec);
    if (d < bestDist) { bestDist = d; best = idx; }
  });
  return best;
}
