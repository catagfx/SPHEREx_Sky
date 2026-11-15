import * as THREE from 'three';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { $ } from '../../dom';
import { updateCompare, applyLayerMix } from '../layers';
import { dir } from '../scene';
import { setSpin as setPageSpin } from '../view';
import { initConstellations } from '../constellations';
import { createPanel } from './panels';
import { createStarMap } from './starmap';
import { createPages } from './pages';

// VR / WebXR experience.
//   - Entry: a prominent VR button in the header (#vrQuick) and the legacy Tools item (#vr).
//   - On session start: the sky continues as the background, a holographic wrist menu appears on the left
//     hand, and a large floating "home" panel opens in front of the user.
//   - Hand tracking: thumb-tip ↔ index-finger-tip under PINCH_DIST metres = pinch. Pinch drives three
//     interactions: tap a button, drag a slider knob, scroll a panel's body.
//   - Four modules (menu buttons): EXPLORE (catalog), STAR MAP (3D selection), DATA (info), SETTINGS (sliders).
//   - Travel: picking a destination fades the whole room to black and re-points the sky at it.
//   - Exit: either the VR button again, the "Exit VR" item on the menu, or the headset's own exit.

const PINCH_DIST = 0.025;             // metres: thumb-tip ↔ index-tip < this = pinch
const HAND_RAY_LEN = 3.5;             // metres: max raycaster distance
const FADE_DURATION_MS = 500;
const EYE_HEIGHT = 1.6;               // metres above the floor (local-floor space)
const INPUTS = 4;                     // 2 hands/controllers + Vision Pro's 2 transient (gaze + pinch) pointers

export function initXR(sky) {
  const { ren, scene, cam, world, uniforms } = sky;
  ren.xr.enabled = true;

  // ---------- Header button wiring ----------
  const quickBtn = $('#vrQuick');
  const toolsBtn = $('#vr');

  let xrSupported = false;
  let legacyDisplay = null;
  let eyeY = EYE_HEIGHT;
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
      xrSupported = ok;
      if (ok) {
        if (quickBtn) { quickBtn.hidden = false; }
        if (toolsBtn) { toolsBtn.hidden = false; }
      }
    }).catch(() => {});
  } else if (typeof navigator.getVRDisplays === 'function') {
    // Legacy WebVR 1.1 fallback for older headset browsers without navigator.xr
    navigator.getVRDisplays().then((displays) => {
      if (displays && displays.length > 0) {
        legacyDisplay = displays[0];
        xrSupported = true;
        if (quickBtn) { quickBtn.hidden = false; }
        if (toolsBtn) { toolsBtn.hidden = false; }
      }
    }).catch(() => {});
  }

  // Universal VR support (WebXR + legacy WebVR 1.1 fallback):
  // Works across Meta Quest, Pico, HTC Vive, Valve Index / SteamVR, Vision Pro, WMR, and 3-DoF / legacy WebVR headsets.
  // Everything beyond 'immersive-vr' is optional, and headsets without a floor-level space fall back to 'local' or 'viewer'.
  async function enterVR() {
    if (navigator.xr && navigator.xr.requestSession) {
      try {
        const session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
        });
        let refSpace = 'local-floor';
        try {
          await session.requestReferenceSpace('local-floor');
        } catch {
          try {
            await session.requestReferenceSpace('local');
            refSpace = 'local';
          } catch {
            refSpace = 'viewer';
          }
        }
        ren.xr.setReferenceSpaceType(refSpace);
        eyeY = refSpace === 'local-floor' ? EYE_HEIGHT : 0;
        await ren.xr.setSession(session);
      } catch (err) {
        console.warn('[XR] could not start the VR session:', err);
        alert('This browser could not start VR. Open the page in the headset\'s own browser over https:// (or http://localhost), and allow VR when asked.');
      }
      return;
    }
    if (legacyDisplay && typeof legacyDisplay.requestPresent === 'function') {
      try {
        await legacyDisplay.requestPresent([{ source: ren.domElement }]);
      } catch (err) {
        console.warn('[WebVR] could not start legacy WebVR presentation:', err);
      }
    }
  }

  function exitVR() {
    const s = ren.xr.getSession();
    if (s) { s.end(); return; }
    if (legacyDisplay && legacyDisplay.isPresenting && typeof legacyDisplay.exitPresent === 'function') {
      legacyDisplay.exitPresent();
    }
  }

  if (quickBtn) quickBtn.addEventListener('click', () => {
    if (ren.xr.getSession()) exitVR(); else enterVR();
  });
  if (toolsBtn) toolsBtn.onclick = () => {
    if (ren.xr.getSession()) exitVR(); else enterVR();
  };

  // ---------- VR scene content (hidden outside of VR) ----------
  const xrRoot = new THREE.Group();
  xrRoot.name = 'xr-root';
  xrRoot.visible = false;
  scene.add(xrRoot);

  // Panels: the menu (floats in front of the user, re-placed on entry and by "Recenter") and a tiny "Menu" button
  // that shows while the menu is hidden (free look).
  const home = createPanel({ w: 1.1, h: 1.3, title: 'SPHEREx VR' });
  home.mesh.position.set(0, 1.6, -1.4);
  xrRoot.add(home.mesh);

  const mini = createPanel({ w: 0.42, h: 0.2, title: '' });
  mini.setBody([{ type: 'button', id: 'showMenu', label: 'Menu', variant: 'primary' }]);
  mini.mesh.visible = false;
  xrRoot.add(mini.mesh);

  // Star Map group: follows the sky's turn (travel) so the labels stay on their places in the sky.
  const starMap = createStarMap({ onPick: (p) => pages.handle('lm:' + p.idx) });
  xrRoot.add(starMap.group);

  // Fade sphere (for travel transitions): a small sphere around the camera that we can blacken.
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false });
  const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), fadeMat);
  fadeMesh.renderOrder = 10;
  xrRoot.add(fadeMesh);

  const mode = { current: 'home' }; // the page now shown (tests read it through spxXR.mode)
  let uiOpacity = 0.86;
  let menuHidden = false;
  let needPlace = false;
  let spinning = false;
  let savedConst = false;

  const headPos = new THREE.Vector3();
  const headQuat = new THREE.Quaternion();
  function readHead() {
    const c = ren.xr.getCamera(cam);
    c.getWorldPosition(headPos);
    c.getWorldQuaternion(headQuat);
  }
  const flatForward = () => {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
    f.y = 0;
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1); else f.normalize();
    return f;
  };

  // put the menu in front of the user, at eye height, turned to them; the star map is centred on the head
  function place() {
    readHead();
    const f = flatForward();
    // on the Star Map page the menu steps aside, so it does not hide the stars straight ahead
    const side = mode.current === 'starmap' ? 0.75 : 0;
    const pf = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), side);
    home.mesh.position.copy(headPos).addScaledVector(pf, 1.4);
    home.mesh.position.y = headPos.y - 0.05;
    mini.mesh.position.copy(headPos).addScaledVector(f, 0.9);
    mini.mesh.position.y = headPos.y - 0.5;
    starMap.group.position.copy(headPos);
  }

  function setMenuHidden(hide) {
    menuHidden = hide;
    home.mesh.visible = !hide;
    mini.mesh.visible = hide;
    if (hide) starMap.hide(); else if (pages.page === 'starmap') starMap.show();
    if (!hide) place();
  }

  const ctx = {
    sky, panel: home, THREE,
    get uiOpacity() { return uiOpacity; },
    setUiOpacity(v) { uiOpacity = Math.max(0.3, Math.min(1, v)); home.mesh.material.opacity = uiOpacity; mini.mesh.material.opacity = uiOpacity; },
    applyMix: applyLayerMix,
    travelTo: (p) => travelTo(p),
    exitVR: () => exitVR(),
    recenter: () => { if (menuHidden) setMenuHidden(false); else place(); },
    hideMenu: () => setMenuHidden(true),
    // the viewer's forward direction (horizontal, world frame)
    headForward: () => { readHead(); return flatForward(); },
    constellationRoot: () => initConstellations._root,
    setSpin: (on) => { spinning = on; },
    onPage(page) {
      const was = mode.current;
      mode.current = page;
      if (page === 'starmap' && !menuHidden) starMap.show(); else starMap.hide();
      if ((page === 'starmap') !== (was === 'starmap') && !needPlace && xrRoot.visible) place();
    },
  };
  const pages = createPages(ctx);

  // ---------- Travel: fade out, point the sky at target, fade in ----------
  // Stepped from xrFrame: window.requestAnimationFrame does not run while a Quest is presenting.
  let travel = null;
  function travelTo(p) {
    travel = { target: dir(p.l, p.b, 1).normalize(), t0: performance.now(), turned: false };
  }
  function stepTravel() {
    if (!travel) return;
    const t = (performance.now() - travel.t0) / FADE_DURATION_MS;
    if (t < 1) { fadeMat.opacity = Math.min(1, t * 1.6); return; }
    if (!travel.turned) {
      // rotate the world so the picked direction sits in front of the headset
      travel.turned = true;
      readHead();
      const look = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat).normalize();
      world.quaternion.setFromUnitVectors(travel.target, look);
    }
    fadeMat.opacity = Math.max(0, 1 - (t - 1) * 1.4);
    if (t >= 2) { fadeMat.opacity = 0; travel = null; }
  }

  // ---------- Hand tracking ----------
  const handFactory = new XRHandModelFactory();
  const ctrlFactory = new XRControllerModelFactory();

  // three r128 only maps as many input sources as controllers were asked for (WebXRManager), so ask for INPUTS
  const hands = Array.from({ length: INPUTS }, (_, i) => {
    const grip = ren.xr.getControllerGrip(i);
    grip.add(ctrlFactory.createControllerModel(grip));
    xrRoot.add(grip);
    const hand = ren.xr.getHand(i);
    hand.add(handFactory.createHandModel(hand, 'spheres')); // three r128: 'spheres' | 'boxes' | 'oculus' (no 'mesh')
    xrRoot.add(hand);
    const controller = ren.xr.getController(i);
    xrRoot.add(controller);
    const h = { grip, hand, controller, trigger: false, pinching: false, pinchedTarget: null, lastLocal: null, overId: null };
    // Quest controllers: the trigger (WebXR "select") works like a pinch
    controller.addEventListener('selectstart', () => { h.trigger = true; });
    controller.addEventListener('selectend', () => { h.trigger = false; });
    // grip / squeeze: show or hide the menu
    controller.addEventListener('squeezestart', () => setMenuHidden(!menuHidden));
    return h;
  });

  // Visible ray from each hand (helps the user aim).
  const rayMat = new THREE.LineBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.35 });
  const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -HAND_RAY_LEN)]);
  hands.forEach((h) => {
    h.rayLine = new THREE.Line(rayGeom.clone(), rayMat);
    h.rayLine.visible = false;
    h.controller.add(h.rayLine);
  });

  const raycaster = new THREE.Raycaster();

  function joint(hand, name) {
    const j = hand.joints && hand.joints[name];
    return j || null;
  }

  // pinch (hand tracking) or trigger (controller); hand joints keep stale positions after switching to the
  // controllers, so they only count while the hand is tracked (three sets hand.visible per frame)
  function isPinching(h) {
    if (h.trigger) return { active: true };
    const a = h.hand.visible && joint(h.hand, 'thumb-tip');
    const b = h.hand.visible && joint(h.hand, 'index-finger-tip');
    if (!a || !b) return { active: false };
    return { active: a.position.distanceTo(b.position) < PINCH_DIST };
  }

  function pickTargets() {
    const t = [];
    if (home.mesh.visible) t.push(home.mesh);
    if (mini.mesh.visible) t.push(mini.mesh);
    if (starMap.group.visible) starMap.picks.forEach((p) => t.push(p.mesh));
    return t;
  }

  function panelFromMesh(m) {
    if (m === home.mesh) return home;
    if (m === mini.mesh) return mini;
    return null;
  }

  function hitFrom(hand) {
    // The input's own pointing ray (WebXR targetRaySpace): controllers, tracked hands and Vision Pro's gaze + pinch
    // all have one, and for hands it stays steady while the fingers pinch. Finger joints only as a fallback.
    const tip = !hand.controller.visible && hand.hand.visible && joint(hand.hand, 'index-finger-tip');
    let origin, direction;
    if (tip) {
      origin = tip.position.clone();
      const m = joint(hand.hand, 'index-finger-metacarpal') || joint(hand.hand, 'wrist');
      if (m) direction = origin.clone().sub(m.position).normalize();
      else direction = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    } else {
      if (!hand.controller.visible) return { hits: [] };   // this input is not tracked right now
      origin = new THREE.Vector3(); hand.controller.getWorldPosition(origin);
      direction = new THREE.Vector3(0, 0, -1).applyQuaternion(hand.controller.getWorldQuaternion(new THREE.Quaternion()));
    }
    raycaster.set(origin, direction);
    const hits = raycaster.intersectObjects(pickTargets(), false);
    return { hits, origin, direction };
  }

  function dispatch(id) {
    if (id === 'showMenu') { setMenuHidden(false); return; }
    pages.handle(id);
  }

  // thumbstick up / down scrolls the menu (Quest: axes 2 / 3; touchpads: 0 / 1)
  function stickScroll() {
    const session = ren.xr.getSession();
    if (!session || !home.mesh.visible) return;
    for (const src of session.inputSources) {
      const ax = src.gamepad && src.gamepad.axes;
      if (!ax) continue;
      const y = Math.abs(ax[3] || 0) > Math.abs(ax[1] || 0) ? ax[3] : ax[1];
      if (Math.abs(y) > 0.25) home.scroll(y * 22);
    }
  }

  // Update loop: called every XR frame.
  function xrFrame() {
    if (!ren.xr.isPresenting) return;

    readHead();
    if (needPlace) { needPlace = false; place(); }
    fadeMesh.position.copy(headPos);
    stepTravel();
    if (spinning && !travel) world.rotation.y += 0.0009;
    // the star map turns with the sky (travel / orbit), around the head
    starMap.group.quaternion.copy(world.quaternion);
    stickScroll();

    const hover = new Map();   // panel -> hovered id, over every hand
    for (const h of hands) {
      const { active } = isPinching(h);
      const { hits } = hitFrom(h);
      const firstHit = hits[0];
      h.rayLine.visible = !!firstHit;
      if (firstHit) h.rayLine.scale.z = firstHit.distance / HAND_RAY_LEN;
      h.overId = null;

      const panel = firstHit && panelFromMesh(firstHit.object);
      if (panel) {
        const local = firstHit.object.worldToLocal(firstHit.point.clone());
        const hit = panel.hitTest(local);
        h.overId = hit ? hit.id : null;
        if (hit) hover.set(panel, hit.id);
        if (active && !h.pinching) {
          h.pinching = true;
          h.pinchedTarget = { panel, hit, local: local.clone(), scrollY0: panel.scrollY };
          h.lastLocal = local.clone();
        } else if (active && h.pinching && h.pinchedTarget && h.pinchedTarget.panel === panel) {
          const target = h.pinchedTarget;
          if (target.hit && target.hit.kind === 'slider') {
            const canvas = panel.localToCanvas(local);
            const trackX = target.hit.cx + 20;
            const trackW = target.hit.cw - 40;
            const val = Math.max(0, Math.min(1, (canvas.px - trackX) / trackW));
            panel.updateSlider(target.hit.id, val);
            pages.onSlider(target.hit.id, val);
          } else if (!target.hit) {
            // scroll drag: the panel follows the hand (drag up = content up)
            const prev = panel.localToCanvas(target.local);
            const now = panel.localToCanvas(local);
            panel.setScroll(target.scrollY0 + (prev.py - now.py));
          }
        }
      } else if (firstHit && firstHit.object.userData && firstHit.object.userData.pick) {
        starMap.highlight(firstHit.object.userData.id);
        if (active && !h.pinching) {
          h.pinching = true;
          h.pinchedTarget = { starHit: firstHit.object.userData };
        }
      }

      if (!active && h.pinching) {
        // Pinch up: fire the click when the ray is still on the thing that was pressed
        const t = h.pinchedTarget;
        if (t && t.panel && t.hit && t.hit.kind === 'button' && h.overId === t.hit.id) {
          dispatch(t.hit.id);
        } else if (t && t.starHit && firstHit && firstHit.object.userData === t.starHit) {
          pages.handle('lm:' + t.starHit.data.idx);
        }
        h.pinching = false;
        h.pinchedTarget = null;
      }
    }
    home.setHover(hover.get(home) || null);
    mini.setHover(hover.get(mini) || null);

    // keep panels turned toward the user (yaw only: they stay upright)
    home.mesh.lookAt(headPos.x, home.mesh.position.y, headPos.z);
    mini.mesh.lookAt(headPos.x, mini.mesh.position.y, headPos.z);

    home.refresh();
    mini.refresh();
  }

  // ---------- Session lifecycle ----------
  ren.xr.addEventListener('sessionstart', () => {
    xrRoot.visible = true;
    const root = initConstellations._root;
    savedConst = !!(root && root.visible);
    world.quaternion.identity();
    world.rotation.y = -Math.PI / 2;
    updateCompare();
    applyLayerMix();
    menuHidden = false;
    home.mesh.visible = true;
    mini.mesh.visible = false;
    home.mesh.material.opacity = mini.mesh.material.opacity = uiOpacity;
    pages.open('home');
    needPlace = true;   // the headset pose is only known from the first frame
    if (quickBtn) {
      quickBtn.classList.add('active');
      quickBtn.querySelector('span').textContent = 'Exit VR';
    }
  });
  ren.xr.addEventListener('sessionend', () => {
    xrRoot.visible = false;
    travel = null;
    spinning = false;
    fadeMat.opacity = 0;
    pages.reset();
    const root = initConstellations._root;
    if (root) root.visible = savedConst;
    world.rotation.set(0, 0, 0);   // a travel may have tilted it
    setPageSpin(false);
    applyLayerMix();               // back to the page's own layer settings
    updateCompare();
    if (quickBtn) {
      quickBtn.classList.remove('active');
      quickBtn.querySelector('span').textContent = 'Enter VR';
    }
  });

  // The viewer's render loop (viewer/sky/camera.js, startRenderLoop) calls sky.onXRFrame every XR frame.
  sky.onXRFrame = xrFrame;

  // Read-only view for tests/vr.mjs and the console: where things are, what the panel shows.
  window.spxXR = {
    get mode() { return mode.current; },
    get title() { return home.title; },
    get fading() { return fadeMat.opacity; },
    get worldTilt() { return world.quaternion.toArray(); },
    get menuHidden() { return menuHidden; },
    go(id) { dispatch(id); },
    snapshot() { home.refresh(); return home.mesh.material.map.image.toDataURL('image/png'); },   // the menu as a picture (tests / debugging)
    buttonWorld(id) {   // 'travel:' (ending in ':') = the first button whose id starts with it
      const b = home.hits.find((h) => h.id === id || (id.endsWith(':') && h.id.startsWith(id)));
      return b ? home.mesh.localToWorld(home.canvasToLocal(b.cx + b.cw / 2, b.cy + b.ch / 2)).toArray() : null;
    },
    starWorld(i) {
      const m = starMap.picks[i] && starMap.picks[i].mesh;
      return m ? m.getWorldPosition(new THREE.Vector3()).toArray() : null;
    },
  };
}
