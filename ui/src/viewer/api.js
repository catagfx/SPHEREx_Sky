import * as THREE from 'three';
import { FIELD } from '../data';
import { st } from './explorer/state';
import { render, openChange, closeChange } from './explorer';
import { setSeries, selectFrame } from './explorer/series';
import { parseCoord, findClosestTarget } from './sky/coords';
import { generateAnomalyReport } from './panels/anomaly';
import { openIrsa } from './panels/irsa';
import { getShareUrl } from './panels/share';

// The viewer's public surface on window: the tracker charts' inline onclick (selectFrame), the e2e suite
// (test_everything.js) and the browser console.

export function exposeApi() {
  Object.assign(window, {
    THREE,
    FIELD,
    selectFrame,
    openChange,
    closeChange,
    setSeries,
    render,
    parseCoord,
    findClosestTarget,
    generateAnomalyReport,
    getShareUrl,
    openIrsaModalWithValues: openIrsa,
  });
  // explorer state, live: mode (S F M C D), si (target index), fi (pass index)
  ['mode', 'si', 'fi'].forEach((key) => {
    Object.defineProperty(window, key, { get: () => st[key], set: (v) => { st[key] = v; }, configurable: true });
  });
}
