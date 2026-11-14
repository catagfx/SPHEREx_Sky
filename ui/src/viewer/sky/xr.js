import { $ } from '../dom';
import { updateCompare } from './layers';

// Tools ▸ "Enter VR" (WebXR), shown only where immersive VR is supported.

export function initXR(sky) {
  const { ren, world } = sky;
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok) $('#vr').hidden = false; }).catch(() => {});
  }
  ren.xr.enabled = true;
  ren.xr.addEventListener('sessionstart', () => { world.rotation.y = -Math.PI / 2; updateCompare(); });
  ren.xr.addEventListener('sessionend', () => { world.rotation.y = 0; updateCompare(); });
  $('#vr').onclick = () => {
    navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] }).then((s) => ren.xr.setSession(s));
  };
}
