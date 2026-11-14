import * as THREE from 'three';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { $ } from '../../dom';
import { updateCompare } from '../layers';
import { dir } from '../scene';
import { createPanel } from './panels';
import { explorePanelBody, spherexDataPanel, settingsPanel } from './content';
import { createStarMap } from './starmap';

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

  // Panels: home (floating in front of user) + wrist menu (attached to left hand).
  const home = createPanel({ w: 1.1, h: 1.3, title: 'SPHEREx VR' });
  home.mesh.position.set(0, 1.6, -1.4);
  xrRoot.add(home.mesh);

  const wrist = createPanel({ w: 0.42, h: 0.5, title: 'Menu', interactive: true });
  wrist.mesh.visible = false;      // will be positioned & shown by the hand tracker when left hand is detected
  xrRoot.add(wrist.mesh);

  // Star Map group.
  const starMap = createStarMap({ onPick: (p) => showCard(p) });
  xrRoot.add(starMap.group);

  // Fade sphere (for travel transitions): a small sphere around the camera that we can blacken.
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false });
  const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), fadeMat);
  fadeMesh.renderOrder = 10;
  xrRoot.add(fadeMesh);

  // Current panel content state
  const mode = { current: 'home' }; // 'home' | 'explore' | 'starmap' | 'data' | 'settings'
  const settings = settingsPanel();
  settings.items.forEach((it) => {
    if (it.type === 'slider') home.setSlider(it.id, { value: settings.defaults[it.id] ?? 0.5 });
  });

  // ---------- Panel contents ----------
  function renderHome() {
    mode.current = 'home';
    home.setTitle('SPHEREx VR');
    home.setBody([
      { type: 'heading', text: 'Welcome' },
      { type: 'paragraph', text: 'An interactive infrared sky — explore NASA SPHEREx data with your hands. Pinch any button below.' },
      { type: 'divider' },
      { type: 'button', id: 'go:explore', label: 'Explore Catalog', variant: 'primary' },
      { type: 'button', id: 'go:starmap', label: 'Open Star Map', variant: 'primary' },
      { type: 'button', id: 'go:data', label: 'SPHEREx Data', variant: 'primary' },
      { type: 'button', id: 'go:settings', label: 'Settings', variant: 'secondary' },
      { type: 'button', id: 'exitVR', label: 'Exit VR', variant: 'secondary' },
    ]);
    starMap.hide();
  }

  function renderExplore() {
    mode.current = 'explore';
    const { items } = explorePanelBody();
    home.setTitle('Explore');
    home.setBody([
      ...items,
      { type: 'divider' },
      { type: 'button', id: 'back:home', label: '← Back to Menu', variant: 'secondary' },
    ]);
    starMap.hide();
  }

  function renderData() {
    mode.current = 'data';
    home.setTitle('SPHEREx Data');
    home.setBody([
      ...spherexDataPanel(),
      { type: 'divider' },
      { type: 'button', id: 'back:home', label: '← Back to Menu', variant: 'secondary' },
    ]);
    starMap.hide();
  }

  function renderSettings() {
    mode.current = 'settings';
    home.setTitle('Settings');
    home.setBody([
      ...settings.items,
      { type: 'divider' },
      { type: 'button', id: 'back:home', label: '← Back to Menu', variant: 'secondary' },
    ]);
    starMap.hide();
  }

  function showStarMap() {
    mode.current = 'starmap';
    home.setTitle('Star Map');
    home.setBody([
      { type: 'heading', text: 'Select a Destination' },
      { type: 'paragraph', text: 'Look around — glowing stars show you where real SPHEREx science targets are on the sky. Pinch one to open its card.' },
      { type: 'divider' },
      { type: 'button', id: 'back:home', label: '← Back to Menu', variant: 'secondary' },
    ]);
    starMap.show();
  }

  function showCard(p) {
    home.setTitle(p.label);
    home.setBody([
      { type: 'heading', text: p.cardTitle || p.label },
      { type: 'paragraph', text: p.cardSub || `Galactic coordinates: l = ${p.l}°, b = ${p.b}°.` },
      { type: 'divider' },
      { type: 'kv', k: 'Longitude l:', v: p.l + '°' },
      { type: 'kv', k: 'Latitude b:', v: p.b + '°' },
      { type: 'divider' },
      { type: 'button', id: 'travel:' + p.idx, label: 'Travel Here', variant: 'primary' },
      { type: 'button', id: 'back:starmap', label: '← Back to Star Map', variant: 'secondary' },
    ]);
  }

  function handleButton(id) {
    if (id === 'go:explore') renderExplore();
    else if (id === 'go:starmap') showStarMap();
    else if (id === 'go:data') renderData();
    else if (id === 'go:settings') renderSettings();
    else if (id === 'back:home') renderHome();
    else if (id === 'back:starmap') showStarMap();
    else if (id === 'exitVR') exitVR();
    else if (id === 'resetSettings') {
      Object.entries(settings.defaults).forEach(([k, v]) => home.updateSlider(k, v));
      applySettings();
    } else if (id.startsWith('explore:')) {
      const idx = +id.split(':')[1];
      const points = starMap.picks.map((p) => p.data);
      const data = points[idx];
      if (data) showCard(data);
    } else if (id.startsWith('travel:')) {
      const idx = +id.split(':')[1];
      const points = starMap.picks.map((p) => p.data);
      const data = points[idx];
      if (data) travelTo(data);
    }
  }

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
      const look = new THREE.Vector3(0, 0, -1).applyQuaternion(ren.xr.getCamera(cam).getWorldQuaternion(new THREE.Quaternion()));
      world.quaternion.setFromUnitVectors(travel.target, look.normalize());
    }
    fadeMat.opacity = Math.max(0, 1 - (t - 1) * 1.4);
    if (t >= 2) { fadeMat.opacity = 0; travel = null; }
  }

  function applySettings() {
    const bg = home.getSlider('bgIntensity')?.value ?? 0.7;
    const stars = home.getSlider('starIntensity')?.value ?? 0.4;
    const dust = home.getSlider('dustIntensity')?.value ?? 0.75;
    const uiA = home.getSlider('uiOpacity')?.value ?? 0.86;
    uniforms.mixA.value = stars * (0.5 + bg);
    uniforms.mixG.value = dust * (0.5 + bg * 2.0);
    home.mesh.material.opacity = uiA;
    wrist.mesh.material.opacity = uiA;
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
    const h = { grip, hand, controller, trigger: false, pinching: false, pinchedTarget: null, lastLocal: null };
    // Quest controllers: the trigger (WebXR "select") works like a pinch
    controller.addEventListener('selectstart', () => { h.trigger = true; });
    controller.addEventListener('selectend', () => { h.trigger = false; });
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
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();

  function joint(hand, name) {
    const j = hand.joints && hand.joints[name];
    if (!j) return null;
    return j;
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
    if (wrist.mesh.visible) t.push(wrist.mesh);
    if (starMap.group.visible) starMap.picks.forEach((p) => t.push(p.mesh));
    return t;
  }

  function panelFromMesh(m) {
    if (m === home.mesh) return home;
    if (m === wrist.mesh) return wrist;
    return null;
  }

  function hitFrom(hand) {
    // The input's own pointing ray (WebXR targetRaySpace): controllers, tracked hands and Vision Pro's gaze + pinch
    // all have one, and for hands it stays steady while the fingers pinch. Finger joints only as a fallback.
    const tip = !hand.controller.visible && hand.hand.visible && joint(hand.hand, 'index-finger-tip');
    let origin, direction;
    if (tip) {
      origin = tip.position.clone();
      // direction: from the metacarpal joint to the tip
      const m = joint(hand.hand, 'index-finger-metacarpal') || joint(hand.hand, 'wrist');
      if (m) direction = origin.clone().sub(m.position).normalize();
      else direction = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    } else {
      if (!hand.controller.visible) return { hits: [] };   // this input is not tracked right now
      origin = new THREE.Vector3(); hand.controller.getWorldPosition(origin);
      direction = new THREE.Vector3(0, 0, -1).applyQuaternion(hand.controller.getWorldQuaternion(new THREE.Quaternion()));
    }
    raycaster.set(origin, direction);
    const targets = pickTargets();
    const hits = raycaster.intersectObjects(targets, false);
    return { hits, origin, direction };
  }

  // Update loop: called every XR frame.
  function xrFrame() {
    if (!ren.xr.isPresenting) return;

    // keep fade sphere centered on the XR camera
    const xrCam = ren.xr.getCamera(cam);
    xrCam.getWorldPosition(tmpV);
    fadeMesh.position.copy(tmpV);
    stepTravel();

    // Position the wrist menu near the left hand if we have hand data
    const leftHand = hands[0].hand;      // Three.js convention: index 0 = left on most devices
    const leftWrist = joint(leftHand, 'wrist');
    const leftMid = joint(leftHand, 'middle-finger-metacarpal');
    if (leftWrist && leftMid) {
      wrist.mesh.visible = false;        // the wrist menu is now a quick-access ring but disabled for v1 — home panel is the main surface
    }

    for (const h of hands) {
      const { active } = isPinching(h);
      const { hits } = hitFrom(h);
      const firstHit = hits[0];
      h.rayLine.visible = !!firstHit;
      if (firstHit) {
        h.rayLine.scale.z = firstHit.distance / HAND_RAY_LEN;
      }

      // Hover feedback on buttons / sliders
      const panel = firstHit && panelFromMesh(firstHit.object);
      if (panel) {
        const local = firstHit.object.worldToLocal(firstHit.point.clone());
        const hit = panel.hitTest(local);
        panel.setHover(hit ? hit.id : null);
        if (active && !h.pinching) {
          // Pinch down
          h.pinching = true;
          if (hit) {
            h.pinchedTarget = { panel, hit, local: local.clone(), scrollY0: panel.scrollY };
            h.lastLocal = local.clone();
          } else {
            // Start a scroll-drag on the panel body
            h.pinchedTarget = { panel, hit: null, local: local.clone(), scrollY0: panel.scrollY };
            h.lastLocal = local.clone();
          }
        } else if (active && h.pinching && h.pinchedTarget && h.pinchedTarget.panel === panel) {
          const target = h.pinchedTarget;
          if (target.hit && target.hit.kind === 'slider') {
            // slider drag: use canvas-x movement
            const canvas = panel.localToCanvas(local);
            const trackX = target.hit.cx + 20;
            const trackW = target.hit.cw - 40;
            const val = Math.max(0, Math.min(1, (canvas.px - trackX) / trackW));
            panel.updateSlider(target.hit.id, val);
            applySettings();
          } else {
            // scroll drag: use y-delta in canvas pixels
            const prev = panel.localToCanvas(target.local);
            const now = panel.localToCanvas(local);
            panel.setScroll(target.scrollY0 + (prev.py - now.py) * -1);
          }
        }
      } else if (!firstHit) {
        // hover off (but keep sticky hover on the last panel briefly)
        home.setHover(null);
        wrist.setHover(null);
      } else if (firstHit && firstHit.object.userData && firstHit.object.userData.pick) {
        // star map hit
        starMap.highlight(firstHit.object.userData.id);
        if (active && !h.pinching) {
          h.pinching = true;
          h.pinchedTarget = { starHit: firstHit.object.userData };
        }
      }

      if (!active && h.pinching) {
        // Pinch up — fire click
        const t = h.pinchedTarget;
        if (t && t.panel && t.hit && t.hit.kind === 'button') {
          handleButton(t.hit.id);
        } else if (t && t.starHit) {
          const data = t.starHit.data;
          showCard(data);
        }
        h.pinching = false;
        h.pinchedTarget = null;
      }
    }

    // keep panels soft-billboarded toward the camera (small rotation each frame)
    const camPos = new THREE.Vector3();
    ren.xr.getCamera(cam).getWorldPosition(camPos);
    home.mesh.lookAt(camPos.x, home.mesh.position.y, camPos.z);
    if (wrist.mesh.visible) wrist.mesh.lookAt(camPos);

    home.refresh();
    wrist.refresh();
  }

  // ---------- Session lifecycle ----------
  ren.xr.addEventListener('sessionstart', () => {
    xrRoot.visible = true;
    home.mesh.position.y = eyeY;
    starMap.group.position.y = eyeY;   // the star map surrounds the head, not the floor
    world.rotation.y = -Math.PI / 2;
    updateCompare();
    renderHome();
    applySettings();
    if (quickBtn) {
      quickBtn.classList.add('active');
      quickBtn.querySelector('span').textContent = 'Exit VR';
    }
  });
  ren.xr.addEventListener('sessionend', () => {
    xrRoot.visible = false;
    travel = null;
    fadeMat.opacity = 0;
    world.rotation.set(0, 0, 0);   // a travel may have tilted it
    uniforms.mixA.value = 0.4;
    uniforms.mixG.value = 1.2;
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
