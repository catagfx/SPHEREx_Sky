// Thin re-export so the existing import path (viewer/index.js: `./sky/xr`) keeps working while
// the real implementation lives in the `xr/` sub-module (session, panels, hands, star map, travel).
export { initXR } from './xr/index.js';
