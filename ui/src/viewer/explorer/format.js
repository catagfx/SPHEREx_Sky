import { series } from './state';

// Date / number labels used by the explorer's captions, strips and charts.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2025-08-08" -> "8 Aug 2025" */
export function niceDate(d) {
  const p = d.split('-');
  return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0];
}

/** "2025-08-08" -> "8 Aug" (+ year when asked) */
export function dayMonth(d, showYear) {
  if (!d) return '';
  const p = d.split('-');
  if (p.length < 3) return d;
  return +p[2] + ' ' + MON[+p[1] - 1] + (showYear ? ' ' + p[0] : '');
}

/** Brightness value with 1 or 2 decimals. */
export const fmtFlux = (v) => (v >= 1 ? v.toFixed(1) : v.toFixed(2));

function spansYears(s) {
  if (!s || !s.frames || s.frames.length < 2) return false;
  const y0 = s.frames[0].d ? s.frames[0].d.split('-')[0] : '';
  for (let k = 1; k < s.frames.length; k++) {
    const yk = s.frames[k].d ? s.frames[k].d.split('-')[0] : '';
    if (yk && y0 && yk !== y0) return true;
  }
  return false;
}

/** Targets observed over several survey passes (months apart) instead of one night. */
export function isMultiPass(s) {
  return !!s && (s.id === 'planetx' || s.id === 'barnard' || s.id === 'wise0855' || s.id === 'epsindi' || (s.span && s.span.indexOf('passes') >= 0));
}

/** Label of one frame of the selected series: a full date for multi-year series, else time and / or day. */
export function frameLabel(e) {
  if (!e) return '';
  const s = series();
  const lab = s ? s.lab : '';
  if (s && (spansYears(s) || s.id === 'planetx' || s.id === 'barnard' || s.id === 'wise0855' || s.id === 'epsindi')) {
    return niceDate(e.d);
  }
  return lab === 't' ? e.t : lab === 'dt' ? dayMonth(e.d) + ' ' + e.t : dayMonth(e.d);
}

/** ", 14:05 UT" for series whose frames are hours apart. */
export const utSuffix = (e) => (series().lab !== 'd' ? ', ' + e.t + ' UT' : '');
