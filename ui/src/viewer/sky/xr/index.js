import * as THREE from 'three';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { $ } from '../../dom';
import { FIELD, COLORS } from '../../../data';
import { updateCompare } from '../layers';
import { dir } from '../scene';
import { radecToGal } from '../coords';
import {
  setConstellationsVisible,
  selectConstellationVR,
  clearConstellationSelectionVR,
  updateConstellationFlutter,
} from '../constellations';
import { createPanel } from './panels';
import {
  headerBarItems,
  buildStoryCarouselPanels,
  explorePanelBody,
  landmarkDetailBody,
  buildGalleryCatalogBody,
  fieldTargetDetailBody,
  spherexDataPanel,
  settingsPanel,
  constellationPoints,
  constellationDetailBody,
  BENCHMARK_TARGETS_VR,
} from './content';
import { createStarMap, createConstellationTagsVR } from './starmap';
import { createVRIntro } from './intro';
import { playNarration, stopAllNarration, pauseAllNarration, resumeAllNarration, isAudioPlaying, unlockAudioContext } from '../../audio/narration';

// VR / WebXR + WebVR 1.1 experience:
//   - Always-above floating VR Header Bar with all desktop navigation modes:
//     Story 360°, Free-Look, Landmarks, Constellations, Planet X, Difference, 102 Colors, Gallery, Settings, Exit VR.
//   - 360° Story Carousel Ring: all 9 desktop Story sections surround the user 360°; dragging horizontally
//     (left/right) with hand pinch or controller trigger (or thumbstick / Prev-Next buttons) rotates the 360° ring
//     with smooth easing and syncs the sky background to that section's exact astronomical coordinates.
//   - Full SPHEREx Photo Gallery & Landmarks with real science cutouts and Galactic sky crops.
//   - Desktop-styled Landmarks & Constellations in VR (glassmorphic pills on the sky + full Constellation diagram & TTS).

const PINCH_DIST = 0.025;
const HAND_RAY_LEN = 3.8;
const FADE_DURATION_MS = 500;
const EYE_HEIGHT = 1.6;
const INPUTS = 4;
const RING_RADIUS = 1.65;

export function initXR(sky) {
  const { ren, scene, cam, world, uniforms } = sky;
  ren.xr.enabled = true;

  const quickBtn = $('#vrQuick');
  const toolsBtn = $('#vr');

  let xrSupported = false;
  let legacyDisplay = null;
  let eyeY = EYE_HEIGHT;
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
      xrSupported = ok;
      if (ok) {
        if (quickBtn) quickBtn.hidden = false;
        if (toolsBtn) toolsBtn.hidden = false;
      }
    }).catch(() => {});
  } else if (typeof navigator.getVRDisplays === 'function') {
    navigator.getVRDisplays().then((displays) => {
      if (displays && displays.length > 0) {
        legacyDisplay = displays[0];
        xrSupported = true;
        if (quickBtn) quickBtn.hidden = false;
        if (toolsBtn) toolsBtn.hidden = false;
      }
    }).catch(() => {});
  }

  async function enterVR() {
    unlockAudioContext();
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

  async function exitVR() {
    stopSpeech();
    try {
      const s = ren.xr.getSession();
      if (s && ren.xr.isPresenting) {
        await s.end();
      }
    } catch (e) {
      console.warn('[XR] exitVR error:', e);
    }
    if (legacyDisplay && legacyDisplay.isPresenting && typeof legacyDisplay.exitPresent === 'function') {
      try { legacyDisplay.exitPresent(); } catch {}
    }
    try {
      await ren.xr.setSession(null);
    } catch {}
  }

  if (quickBtn) quickBtn.addEventListener('click', () => {
    if (ren.xr.isPresenting) exitVR(); else enterVR();
  });
  if (toolsBtn) toolsBtn.onclick = () => {
    if (ren.xr.isPresenting) exitVR(); else enterVR();
  };

  // ---------- VR scene content (hidden outside of VR) ----------
  const xrRoot = new THREE.Group();
  xrRoot.name = 'xr-root';
  xrRoot.visible = false;
  scene.add(xrRoot);

  // 1. Always-above Floating Header Bar (comfortably positioned above active panels)
  const headerBar = createPanel({ w: 1.95, h: 0.14, title: 'Header', variant: 'header' });
  headerBar.mesh.position.set(0, EYE_HEIGHT + 0.46, -1.40);
  xrRoot.add(headerBar.mesh);

  // 2. Primary front panel (lowered to gaze level, 100% space-filled widescreen ratio)
  const home = createPanel({ w: 1.1, h: 1.15, title: 'SPHEREx VR' });
  home.mesh.position.set(0, EYE_HEIGHT - 0.20, -1.40);
  xrRoot.add(home.mesh);

  // Smooth lerp target for home panel (slides to left when viewing landmark/constellation side-by-side)
  const panelTargetPos = new THREE.Vector3(0, EYE_HEIGHT - 0.20, -1.40);

  // 3. 360° Surrounding Story Carousel Ring (the other 8 Story sections placed 360° around the user)
  const storyRingGroup = new THREE.Group();
  storyRingGroup.name = 'xr-story-ring-360';
  xrRoot.add(storyRingGroup);

  const storyState = {
    activeIdx: 0,
    ringAngle: 0,
    targetRingAngle: 0,
    frontAnimT: 1,
    pxPass: 0,
    pxCoadd: false,
    diffGain: 4,
    diffInvert: false,
    spectroIdx: 6,
    speakingConstIdx: null,
    selectedConstIdx: null,
    speakingLandmarkIdx: null,
    selectedLandmarkIdx: null,
    landmarkPassIdx: 0,
    galleryFilter: 'all',
  };

  const STORY_COUNT = 9;
  const satellitePanels = Array.from({ length: STORY_COUNT }, (_, idx) => {
    const p = createPanel({ w: 1.05, h: 1.08, title: `Story ${idx + 1}` });
    p.mesh.userData = { storyIdx: idx };
    storyRingGroup.add(p.mesh);
    return p;
  });

  const wrist = createPanel({ w: 0.42, h: 0.5, title: 'Menu', interactive: true });
  wrist.mesh.visible = false;
  xrRoot.add(wrist.mesh);

  // 4. Desktop-styled Landmarks & Constellations 3D overlays (both in xrRoot at eye height, rotated with world.quaternion)
  const starMap = createStarMap({ onPick: (p) => showCard(p) });
  xrRoot.add(starMap.group);

  const constTags = createConstellationTagsVR();
  xrRoot.add(constTags.group);

  // 360° VR intro (plays once at session start unless ?intro=0).
  const vrIntro = createVRIntro();
  xrRoot.add(vrIntro.group);

  // Fade sphere for smooth sky transitions
  const fadeMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), fadeMat);
  fadeMesh.renderOrder = 10;
  xrRoot.add(fadeMesh);

  const mode = { current: 'home', tab: 'story' };
  const settings = settingsPanel();
  settings.items.forEach((it) => {
    if (it.type === 'slider') home.setSlider(it.id, { value: settings.defaults[it.id] ?? 0.5 });
  });
  home.setSlider('diffGainSlider', { value: 0.33 });
  home.setSlider('spectroSlider', { value: 0.75 });

  function updateHeader(activeTab) {
    mode.tab = activeTab;
    headerBar.setActiveTab(activeTab);
    headerBar.setBody(headerBarItems(activeTab));
  }

  function speakConstellationVR(c, onDone) {
    if (!c) return false;
    const src = `assets/audio/constellations/${c.idx}.mp3`;
    const text = c.info || c.name;
    return playNarration({ src, text, onEnd: onDone });
  }

  function speakLandmarkVR(p, onDone) {
    if (!p) return false;
    const src = p.audioSrc || `assets/audio/landmarks/${p.idx}.mp3`;
    const text = p.narration || p.cardSub || p.label;
    return playNarration({ src, text, onEnd: onDone });
  }

  function stopSpeech() {
    stopAllNarration();
    storyState.speakingConstIdx = null;
    storyState.speakingLandmarkIdx = null;
  }

  function syncSatelliteRingPanels(sections) {
    satellitePanels.forEach((sat, i) => {
      const sec = sections[i];
      if (!sec) return;
      sat.setTitle(sec.title);
      sat.setBody([
        ...sec.body.slice(0, 4),
        { type: 'divider' },
        {
          type: 'button',
          id: `story:jump:${i}`,
          label: `Bring Panel 0${i + 1} to Front →`,
          variant: 'primary',
          fullWidth: true,
        },
      ]);
      sat.refresh();
    });
  }

  function layoutStoryRing() {
    const step = (Math.PI * 2) / STORY_COUNT;
    storyState.ringAngle += (storyState.targetRingAngle - storyState.ringAngle) * 0.14;

    satellitePanels.forEach((sat, idx) => {
      const relIdx = ((idx - storyState.activeIdx) % STORY_COUNT + STORY_COUNT) % STORY_COUNT;
      if (relIdx === 0) {
        sat.mesh.visible = false;
        return;
      }
      sat.mesh.visible = storyRingGroup.visible;
      const angle = idx * step + storyState.ringAngle;
      const x = Math.sin(angle) * RING_RADIUS;
      const z = -Math.cos(angle) * RING_RADIUS;
      sat.mesh.position.set(x, eyeY - 0.18, z);
      sat.mesh.lookAt(0, eyeY - 0.18, 0);
      sat.mesh.material.opacity = 0.62;
    });

    if (storyState.frontAnimT < 1) {
      storyState.frontAnimT = Math.min(1, storyState.frontAnimT + 0.08);
      const ease = 1 - Math.pow(1 - storyState.frontAnimT, 3);
      home.mesh.scale.setScalar(0.92 + 0.08 * ease);
    } else {
      home.mesh.scale.setScalar(1);
    }
  }

  function setOverlays({ storyRing = false, landmarks = false, constellations = false }) {
    storyRingGroup.visible = storyRing;
    starMap.group.visible = landmarks;
    constTags.group.visible = constellations;
    try {
      setConstellationsVisible(constellations);
    } catch (e) {
      console.warn('[XR] setConstellationsVisible warning:', e);
    }
    if (!constellations && !landmarks) {
      stopSpeech();
      storyState.selectedConstIdx = null;
    }
  }

  // ---------- Render views ----------
  function renderStorySection(idx = storyState.activeIdx, flySky = false) {
    stopSpeech();
    const total = STORY_COUNT;
    const normIdx = ((idx % total) + total) % total;
    storyState.activeIdx = normIdx;
    const step = (Math.PI * 2) / total;
    storyState.targetRingAngle = -normIdx * step;
    storyState.frontAnimT = 0;

    const sections = buildStoryCarouselPanels(storyState);
    syncSatelliteRingPanels(sections);
    const activeSec = sections[normIdx];

    mode.current = normIdx === 0 ? 'home' : 'story';
    panelTargetPos.set(0, eyeY - 0.20, -1.40);
    clearConstellationSelectionVR();
    home.mesh.visible = true;
    home.setTitle(activeSec.title);
    home.setBody(activeSec.body);
    updateHeader(activeSec.navId || 'story');
    setOverlays({ storyRing: true, landmarks: false, constellations: false });

    if (flySky && typeof activeSec.l === 'number' && typeof activeSec.b === 'number') {
      travelTo({ l: activeSec.l, b: activeSec.b });
    }
  }

  function renderHome() {
    renderStorySection(0, false);
  }

  function renderFreeLook() {
    stopSpeech();
    mode.current = 'freelook';
    panelTargetPos.set(0, eyeY - 0.20, -1.40);
    clearConstellationSelectionVR();
    updateHeader('freelook');
    setOverlays({ storyRing: false, landmarks: true, constellations: false });
    starMap.highlight(null, null);
    home.mesh.visible = false;
  }

  function showStarMap() {
    stopSpeech();
    mode.current = 'starmap';
    panelTargetPos.set(0, eyeY - 0.58, -1.25);
    clearConstellationSelectionVR();
    updateHeader('starmap');
    home.mesh.visible = false;
    home.setTitle('Star Map');
    home.setBody([
      { type: 'tag', text: '5 CELESTIAL LANDMARKS · 360° OBSERVATORY', align: 'center' },
      { type: 'heading', text: 'Celestial Landmarks in 360°', align: 'center' },
      {
        type: 'paragraph',
        text: 'Look around the 360° sky to see the glowing Landmark pills (Barnard’s Star, Epsilon Indi B, WISE 0855, RW Aurigae, and R Draconis). Point at any Landmark and pinch or trigger to open its SPHEREx infrared card, multi-pass cutouts, and narration.',
        align: 'center',
      },
      { type: 'divider' },
      {
        type: 'buttonRow',
        compact: true,
        buttons: [
          { id: 'gal:filter:landmarks', label: 'Open Landmarks Gallery', variant: 'primary' },
          { id: 'back:home', label: '← Back to Story 360°', variant: 'secondary' },
        ],
      },
    ]);
    setOverlays({ storyRing: false, landmarks: true, constellations: false });
    starMap.highlight(null, null);
  }

  function showCard(p, passIdx = 0, autoSpeak = true) {
    if (!p) return;
    if (storyState.speakingLandmarkIdx !== null || storyState.speakingConstIdx !== null) {
      stopSpeech();
    }
    mode.current = 'landmark-detail';
    storyState.selectedLandmarkIdx = p.idx;
    storyState.landmarkPassIdx = passIdx;
    clearConstellationSelectionVR();
    updateHeader('starmap');
    setOverlays({ storyRing: false, landmarks: true, constellations: false });
    starMap.highlight(null, 'star:' + p.idx);

    // Position panel to the left, so the selected landmark in the sky sits right next to it,
    // both aligned at the same eye height and symmetrically centered under the header bar
    panelTargetPos.set(-0.60, eyeY - 0.20, -1.40);

    if (autoSpeak) {
      const ok = speakLandmarkVR(p, () => {
        storyState.speakingLandmarkIdx = null;
        if (mode.current === 'landmark-detail' && storyState.selectedLandmarkIdx === p.idx) {
          home.setBody(landmarkDetailBody(p, storyState.landmarkPassIdx, false));
        }
      });
      storyState.speakingLandmarkIdx = ok ? p.idx : null;
    }

    home.mesh.visible = true;
    home.setTitle(p.cardTitle || p.label);
    home.setBody(landmarkDetailBody(p, passIdx, storyState.speakingLandmarkIdx === p.idx));
  }

  function renderGalleryCatalog(filter = storyState.galleryFilter || 'all') {
    stopSpeech();
    mode.current = 'gallery';
    panelTargetPos.set(0, eyeY - 0.20, -1.40);
    clearConstellationSelectionVR();
    storyState.galleryFilter = filter;
    updateHeader('benchmarks');
    setOverlays({ storyRing: false, landmarks: filter === 'landmarks', constellations: false });
    starMap.highlight(null, null);
    home.mesh.visible = true;
    home.setTitle('SPHEREx Photo Gallery');
    home.setBody(buildGalleryCatalogBody(filter));
  }

  function showFieldTargetDetail(fieldIdx, passIdx = 0) {
    stopSpeech();
    const series = (FIELD || [])[fieldIdx];
    if (!series) return;
    mode.current = 'field-detail';
    clearConstellationSelectionVR();
    panelTargetPos.set(-0.60, eyeY - 0.20, -1.40);
    updateHeader('benchmarks');
    setOverlays({ storyRing: false, landmarks: false, constellations: false });
    home.mesh.visible = true;
    home.setTitle(series.name || series.label || 'Target Cutout');
    home.setBody(fieldTargetDetailBody(series, fieldIdx, passIdx));

    // Rotate sky upright beside panel
    if (typeof series.ra === 'number' && typeof series.dec === 'number') {
      const g = radecToGal(series.ra, series.dec);
      travelTo({ l: g.l, b: g.b }, { sideBySide: true, isConstellation: false });
    } else if (series.frames && series.frames[0] && series.frames[0].b) {
      const m = String(series.frames[0].b).match(/RA\s+([\d.-]+)°,\s*Dec\s+([\d.+-]+)°/i);
      if (m) {
        const g = radecToGal( parseFloat(m[1]), parseFloat(m[2]) );
        travelTo({ l: g.l, b: g.b }, { sideBySide: true, isConstellation: false });
      }
    }
  }

  function renderConstellationsCatalog() {
    stopSpeech();
    mode.current = 'constellations';
    panelTargetPos.set(0, eyeY - 0.20, -1.40);
    clearConstellationSelectionVR();
    storyState.selectedConstIdx = null;
    updateHeader('constellations');
    setOverlays({ storyRing: false, landmarks: false, constellations: true });
    constTags.highlight(null, null);
    home.mesh.visible = true;
    home.setTitle('20 Constellations');

    const defs = constellationPoints();
    home.setBody([
      { type: 'tag', text: '20 IAU CONSTELLATIONS · J2000 & GALACTIC OVERLAY' },
      { type: 'heading', text: 'Explore Constellations on the 360° Sky' },
      {
        type: 'paragraph',
        text: 'Look around the sky to see the glowing constellation figures and title pills, or select any constellation below to rotate the sky, inspect its star diagram, and listen to the narration:',
      },
      {
        type: 'cardGrid',
        cols: 2,
        cardHeight: 96,
        cards: defs.map((c) => {
          const raVal = Number(c.ra || 0);
          const decVal = Number(c.dec || 0);
          return {
            id: `const:pick:${c.idx}`,
            badge: `${c.code || 'IAU'} · ${(c.stars || []).length} STARS`,
            badgeColor: '#aee4ff',
            title: c.name,
            text: `RA ${raVal.toFixed(1)}° · Dec ${decVal >= 0 ? '+' : ''}${decVal.toFixed(1)}°`,
            skyCrop: c.skyCrop,
            reticle: false,
            data: c,
          };
        }),
      },
      { type: 'button', id: 'back:home', label: '← Back to Story 360°', variant: 'secondary' },
    ]);
  }

  function showConstellationDetail(idx, autoSpeak = true) {
    if (storyState.speakingConstIdx !== null) {
      stopSpeech();
    }
    const defs = constellationPoints();
    const c = defs[idx];
    if (!c) return;
    mode.current = 'constellation-detail';
    storyState.selectedConstIdx = idx;
    updateHeader('constellations');
    setOverlays({ storyRing: false, landmarks: false, constellations: true });

    // Focus constellation in sky with fluttering animated glow
    selectConstellationVR(idx);
    constTags.highlight(null, 'const:' + idx);

    // Position panel to the left, so the constellation figure sits upright directly beside it at eye level
    panelTargetPos.set(-0.60, eyeY - 0.20, -1.40);

    if (autoSpeak) {
      const ok = speakConstellationVR(c, () => {
        storyState.speakingConstIdx = null;
        if (mode.current === 'constellation-detail' && storyState.selectedConstIdx === idx) {
          home.setBody(constellationDetailBody(c, false));
        }
      });
      storyState.speakingConstIdx = ok ? idx : null;
    }

    home.mesh.visible = true;
    home.setTitle(c.name);
    home.setBody(constellationDetailBody(c, storyState.speakingConstIdx === idx));
    travelTo({ l: c.l, b: c.b }, { sideBySide: true, isConstellation: true });
  }

  function renderData() {
    stopSpeech();
    mode.current = 'data';
    panelTargetPos.set(0, eyeY - 0.20, -1.40);
    clearConstellationSelectionVR();
    updateHeader('story');
    home.mesh.visible = true;
    home.setTitle('SPHEREx Data');
    home.setBody([
      ...spherexDataPanel(),
      { type: 'divider' },
      { type: 'button', id: 'back:home', label: '← Back to Story 360°', variant: 'secondary' },
    ]);
    setOverlays({ storyRing: false, landmarks: false, constellations: false });
  }

  function renderSettings() {
    stopSpeech();
    mode.current = 'settings';
    panelTargetPos.set(0, eyeY - 0.20, -1.40);
    clearConstellationSelectionVR();
    updateHeader('settings');
    home.mesh.visible = true;
    home.setTitle('Settings');
    home.setBody([
      ...settings.items,
      { type: 'divider' },
      { type: 'button', id: 'back:home', label: '← Back to Story 360°', variant: 'secondary' },
    ]);
    setOverlays({ storyRing: false, landmarks: false, constellations: false });
  }

  function handleButton(id) {
    if (!id) return;
    try {
      if (id === 'nav:story' || id === 'back:home') renderStorySection(storyState.activeIdx, false);
      else if (id === 'nav:freelook') renderFreeLook();
      else if (id === 'go:explore' || id === 'go:starmap' || id === 'back:starmap') showStarMap();
      else if (id === 'nav:constellations') renderConstellationsCatalog();
      else if (id === 'nav:planetx') renderStorySection(3, true);
      else if (id === 'nav:diff') renderStorySection(4, true);
      else if (id === 'nav:benchmarks') renderGalleryCatalog('all');
      else if (id === 'nav:colors') renderStorySection(6, true);
      else if (id === 'go:data') renderData();
      else if (id === 'go:settings') renderSettings();
      else if (id === 'exitVR') exitVR();
      else if (id === 'story:prev') renderStorySection(storyState.activeIdx - 1, true);
      else if (id === 'story:next') renderStorySection(storyState.activeIdx + 1, true);
      else if (id.startsWith('story:jump:')) {
        const targetIdx = +id.split(':')[2];
        renderStorySection(targetIdx, true);
      } else if (id.startsWith('gal:filter:')) {
        const filter = id.split(':')[2] || 'all';
        renderGalleryCatalog(filter);
      } else if (id.startsWith('field:pass:')) {
        const parts = id.split(':');
        showFieldTargetDetail(+parts[2], +parts[3]);
      } else if (id.startsWith('field:fly:')) {
        const fIdx = +id.split(':')[2];
        showFieldTargetDetail(fIdx, 0);
      } else if (id.startsWith('field:')) {
        const fIdx = +id.split(':')[1];
        showFieldTargetDetail(fIdx, 0);
      } else if (id === 'px:step') {
        storyState.pxPass = (storyState.pxPass + 1) % 4;
        renderStorySection(3, false);
      } else if (id === 'px:coadd') {
        storyState.pxCoadd = !storyState.pxCoadd;
        renderStorySection(3, false);
      } else if (id === 'diff:invert') {
        storyState.diffInvert = !storyState.diffInvert;
        renderStorySection(4, false);
      } else if (id === 'spectro:step') {
        const maxC = Math.max(1, (COLORS || []).length);
        storyState.spectroIdx = (storyState.spectroIdx + 1) % maxC;
        renderStorySection(7, false);
      } else if (id.startsWith('bench:')) {
        const bid = id.split(':')[1];
        const fIdx = (FIELD || []).findIndex((f) => f.id === bid);
        if (fIdx >= 0) {
          showFieldTargetDetail(fIdx, 0);
        } else {
          const target = BENCHMARK_TARGETS_VR.find((t) => t.id === bid);
          if (target) {
            const g = radecToGal(target.ra, target.dec);
            travelTo({ l: g.l, b: g.b });
          }
        }
      } else if (id.startsWith('const:pick:')) {
        const cidx = +id.split(':')[2];
        showConstellationDetail(cidx, true);
      } else if (id.startsWith('const:travel:')) {
        const cidx = +id.split(':')[2];
        const c = constellationPoints()[cidx];
        if (c) travelTo({ l: c.l, b: c.b }, { sideBySide: true, isConstellation: true });
      } else if (id.startsWith('const:audio:')) {
        const cidx = +id.split(':')[2];
        const c = constellationPoints()[cidx];
        if (!c) return;
        if (storyState.speakingConstIdx === cidx) {
          stopSpeech();
          home.setBody(constellationDetailBody(c, false));
        } else {
          showConstellationDetail(cidx, true);
        }
      } else if (id === 'resetSettings') {
        resetAllSettingsToDefault();
      } else if (id.startsWith('explore:')) {
        const idx = +id.split(':')[1];
        const points = starMap.picks.map((p) => p.data);
        const data = points[idx];
        if (data) showCard(data, 0);
      } else if (id.startsWith('landmark:pass:')) {
        const parts = id.split(':');
        const idx = +parts[2];
        const pIdx = +parts[3];
        const points = starMap.picks.map((p) => p.data);
        const data = points[idx];
        if (data) showCard(data, pIdx, false);
      } else if (id.startsWith('landmark:audio:')) {
        const idx = +id.split(':')[2];
        const points = starMap.picks.map((p) => p.data);
        const data = points[idx];
        if (!data) return;
        if (storyState.speakingLandmarkIdx === idx) {
          stopSpeech();
          home.setBody(landmarkDetailBody(data, storyState.landmarkPassIdx, false));
        } else {
          const ok = speakLandmarkVR(data, () => {
            storyState.speakingLandmarkIdx = null;
            if (mode.current === 'landmark-detail' && storyState.selectedLandmarkIdx === idx) {
              home.setBody(landmarkDetailBody(data, storyState.landmarkPassIdx, false));
            }
          });
          storyState.speakingLandmarkIdx = ok ? idx : null;
          home.setBody(landmarkDetailBody(data, storyState.landmarkPassIdx, storyState.speakingLandmarkIdx === idx));
        }
      } else if (id.startsWith('travel:')) {
        const idx = +id.split(':')[1];
        const points = starMap.picks.map((p) => p.data);
        const data = points[idx];
        if (data) travelTo(data, { sideBySide: true, isConstellation: false });
      }
    } catch (err) {
      console.error('[XR] handleButton error:', err);
    }
  }

  // Calculates an upright rotation matrix mapping target celestial direction into desired viewer direction
  // without introducing diagonal roll/twist around line-of-sight.
  function getUprightTargetQuaternion(targetDir, desiredLookDir, camUp) {
    const Tf = targetDir.clone().normalize();
    let Tu = Math.abs(Tf.y) > 0.92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const Tr = new THREE.Vector3().crossVectors(Tu, Tf).normalize();
    const TtrueUp = new THREE.Vector3().crossVectors(Tf, Tr).normalize();

    const Df = desiredLookDir.clone().normalize();
    const Du = camUp.clone().normalize();
    const Dr = new THREE.Vector3().crossVectors(Du, Df).normalize();
    const DtrueUp = new THREE.Vector3().crossVectors(Df, Dr).normalize();

    const mT = new THREE.Matrix4().makeBasis(Tr, TtrueUp, Tf);
    const mD = new THREE.Matrix4().makeBasis(Dr, DtrueUp, Df);

    const R = new THREE.Matrix4().multiplyMatrices(mD, mT.transpose());
    return new THREE.Quaternion().setFromRotationMatrix(R);
  }

  // ---------- Travel: smooth slerp to target without black screen blink ----------
  let travel = null;
  function travelTo(p, { sideBySide = false, isConstellation = false } = {}) {
    if (!p || typeof p.l !== 'number' || typeof p.b !== 'number') return;
    const activeCam = ren.xr.isPresenting ? ren.xr.getCamera(cam) : cam;
    const camQuat = activeCam.getWorldQuaternion(new THREE.Quaternion());
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camQuat).normalize();

    // In camera space:
    // If isConstellation: shift further right (x = +0.76m) and lower (y = -0.32m) so large constellation
    // outlines never clip behind the panel (on the left) or behind the toolbar (above).
    // If sideBySide (landmarks): x = +0.66m, y = -0.22m.
    // If standard: center at (0, 0, -1).
    const localLook = isConstellation
      ? new THREE.Vector3(0.76, -0.32, -1.25).normalize()
      : sideBySide
        ? new THREE.Vector3(0.66, -0.22, -1.30).normalize()
        : new THREE.Vector3(0, 0, -1);
    const desiredLook = localLook.applyQuaternion(camQuat).normalize();
    const targetDir = dir(p.l, p.b, 1).normalize();
    const endQuat = getUprightTargetQuaternion(targetDir, desiredLook, camUp);

    travel = {
      startQuat: world.quaternion.clone(),
      endQuat,
      t0: performance.now(),
      duration: 550, // smooth 550ms glide
    };
    fadeMat.opacity = 0; // eliminate black flicker completely
  }

  function stepTravel() {
    if (!travel) return;
    const progress = Math.min(1, (performance.now() - travel.t0) / travel.duration);
    // Smooth easeInOutCubic curve
    const ease = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    world.quaternion.slerpQuaternions(travel.startQuat, travel.endQuat, ease);
    fadeMat.opacity = 0;

    if (progress >= 1) {
      world.quaternion.copy(travel.endQuat);
      travel = null;
    }
  }

  function resetAllSettingsToDefault() {
    Object.entries(settings.defaults).forEach(([k, v]) => home.updateSlider(k, v));
    applySettings();
    if (mode.current === 'settings') {
      home.setBody([
        ...settings.items,
        { type: 'divider' },
        { type: 'button', id: 'back:home', label: '← Back to Story 360°', variant: 'secondary' },
      ]);
    }
  }

  function applySettings() {
    const bg = home.getSlider('bgIntensity')?.value ?? 0.7;
    const stars = home.getSlider('starIntensity')?.value ?? 0.4;
    const dust = home.getSlider('dustIntensity')?.value ?? 0.75;
    const uiA = home.getSlider('uiOpacity')?.value ?? 0.92;
    uniforms.mixA.value = stars * (0.5 + bg);
    uniforms.mixG.value = dust * (0.5 + bg * 2.0);
    home.mesh.material.opacity = uiA;
    headerBar.mesh.material.opacity = Math.min(0.98, uiA + 0.05);
    wrist.mesh.material.opacity = uiA;
  }

  // ---------- Hand & Controller tracking ----------
  const handFactory = new XRHandModelFactory();

  const createSafeGripHandle = () => {
    const g = new THREE.Group();
    const geom = new THREE.CylinderGeometry(0.016, 0.018, 0.12, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x141f32, transparent: true, opacity: 0.65 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = Math.PI / 4;
    mesh.position.set(0, -0.02, 0.04);
    g.add(mesh);
    return g;
  };

  const hands = Array.from({ length: INPUTS }, (_, i) => {
    const grip = ren.xr.getControllerGrip(i);
    grip.add(createSafeGripHandle());
    xrRoot.add(grip);
    const hand = ren.xr.getHand(i);
    hand.add(handFactory.createHandModel(hand, 'spheres'));
    xrRoot.add(hand);
    const controller = ren.xr.getController(i);
    xrRoot.add(controller);
    const h = {
      grip,
      hand,
      controller,
      trigger: false,
      pinching: false,
      pinchedTarget: null,
      lastLocal: null,
      dragConsumed: false,
    };
    controller.addEventListener('selectstart', () => { h.trigger = true; });
    controller.addEventListener('selectend', () => { h.trigger = false; });
    return h;
  });

  const rayMat = new THREE.LineBasicMaterial({ color: 0xffb86b, transparent: true, opacity: 0.45 });
  const rayGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -HAND_RAY_LEN),
  ]);
  hands.forEach((h) => {
    h.rayLine = new THREE.Line(rayGeom.clone(), rayMat);
    h.rayLine.visible = false;
    h.controller.add(h.rayLine);
  });

  const raycaster = new THREE.Raycaster();
  const tmpV = new THREE.Vector3();
  let lastThumbstickStepTime = 0;

  function joint(hand, name) {
    const j = hand.joints && hand.joints[name];
    return j || null;
  }

  function isPinching(h) {
    if (h.trigger) return { active: true };
    const a = h.hand.visible && joint(h.hand, 'thumb-tip');
    const b = h.hand.visible && joint(h.hand, 'index-finger-tip');
    if (!a || !b) return { active: false };
    return { active: a.position.distanceTo(b.position) < PINCH_DIST };
  }

  function pickTargets() {
    const t = [];
    if (headerBar.mesh.visible) t.push(headerBar.mesh);
    // Prioritize 3D landmark and constellation pills when active so user pointing in the sky hits them directly
    if (starMap.group.visible) starMap.picks.forEach((p) => t.push(p.mesh));
    if (constTags.group.visible) {
      constTags.picks.forEach((p) => {
        if (p.mesh.visible) t.push(p.mesh);
      });
    }
    if (home.mesh.visible) t.push(home.mesh);
    if (storyRingGroup.visible) {
      satellitePanels.forEach((sat) => {
        if (sat.mesh.visible) t.push(sat.mesh);
      });
    }
    if (wrist.mesh.visible) t.push(wrist.mesh);
    return t;
  }

  function panelFromMesh(m) {
    if (m === headerBar.mesh) return headerBar;
    if (m === home.mesh) return home;
    if (m === wrist.mesh) return wrist;
    const sat = satellitePanels.find((s) => s.mesh === m);
    return sat || null;
  }

  function hitFrom(hand) {
    const tip = !hand.controller.visible && hand.hand.visible && joint(hand.hand, 'index-finger-tip');
    let origin, direction;
    if (tip) {
      origin = tip.position.clone();
      const m = joint(hand.hand, 'index-finger-metacarpal') || joint(hand.hand, 'wrist');
      if (m) direction = origin.clone().sub(m.position).normalize();
      else direction = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    } else {
      if (!hand.controller.visible) return { hits: [] };
      origin = new THREE.Vector3();
      hand.controller.getWorldPosition(origin);
      direction = new THREE.Vector3(0, 0, -1).applyQuaternion(hand.controller.getWorldQuaternion(new THREE.Quaternion()));
    }
    raycaster.set(origin, direction);
    const targets = pickTargets();
    const hits = raycaster.intersectObjects(targets, false);
    return { hits, origin, direction };
  }

  // Controller thumbstick vertical scrolling & horizontal swipe & controller button shortcuts
  let lastButtonResetTime = 0;
  function pollControllerInput() {
    const session = ren.xr.getSession();
    if (!session || !session.inputSources) return;
    const now = performance.now();

    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      const gp = src.gamepad;

      // Controller button shortcut to Reset Settings to Default
      // In WebXR gamepad spec:
      // button 3: Thumbstick click / press
      // button 5: Secondary button (B on right, Y on left)
      const bThumb = gp.buttons[3] && gp.buttons[3].pressed;
      const bSec = gp.buttons[5] && gp.buttons[5].pressed;
      if ((bThumb || bSec) && (now - lastButtonResetTime > 600)) {
        lastButtonResetTime = now;
        resetAllSettingsToDefault();
      }

      if (gp.axes) {
        let ay = 0;
        if (typeof gp.axes[3] === 'number' && Math.abs(gp.axes[3]) > 0.08) {
          ay = gp.axes[3];
        } else if (typeof gp.axes[1] === 'number' && Math.abs(gp.axes[1]) > 0.08) {
          ay = gp.axes[1];
        }

        let ax = 0;
        if (typeof gp.axes[2] === 'number' && Math.abs(gp.axes[2]) > 0.08) {
          ax = gp.axes[2];
        } else if (typeof gp.axes[0] === 'number' && Math.abs(gp.axes[0]) > 0.08) {
          ax = gp.axes[0];
        }

        // Vertical thumbstick scrolling for any active scrollable panel (Constellations catalog, Constellation detail, Landmarks, Data, Settings, etc.)
        if (Math.abs(ay) > 0.15 && Math.abs(ay) > Math.abs(ax) * 0.7) {
          if (home.mesh.visible && home.scrollMax > 0) {
            home.scroll(ay * 22);
          }
        }
        // Thumbstick horizontal swipe support for the 360° Story Carousel
        else if (storyRingGroup.visible && Math.abs(ax) > 0.65 && (now - lastThumbstickStepTime >= 420)) {
          lastThumbstickStepTime = now;
          renderStorySection(storyState.activeIdx + (ax > 0 ? 1 : -1), true);
          break;
        }
      }
    }
  }

  function xrFrame() {
    if (!ren.xr.isPresenting) return;

    const xrCam = ren.xr.getCamera(cam);
    xrCam.getWorldPosition(tmpV);
    fadeMesh.position.copy(tmpV);
    stepTravel();
    if (vrIntro.playing) vrIntro.step(xrCam);
    layoutStoryRing();
    pollControllerInput();

    // Keep 3D Landmark & Constellation pills aligned with the rotating sky sphere!
    starMap.group.quaternion.copy(world.quaternion);
    constTags.group.quaternion.copy(world.quaternion);

    for (const h of hands) {
      const { active } = isPinching(h);
      const { hits } = hitFrom(h);
      const firstHit = hits[0];
      h.rayLine.visible = !!firstHit;
      if (firstHit) {
        h.rayLine.scale.z = firstHit.distance / HAND_RAY_LEN;
      }

      let effectiveHit = firstHit;
      const panel = firstHit && panelFromMesh(firstHit.object);
      let hit = null;
      if (panel) {
        const local = firstHit.object.worldToLocal(firstHit.point.clone());
        hit = panel.hitTest(local);
        panel.setHover(hit ? hit.id : null);
        if (!hit) {
          const starBehind = hits.find((it) => it.object.userData && it.object.userData.pick);
          if (starBehind) {
            effectiveHit = starBehind;
          }
        }
      }

      if (effectiveHit && effectiveHit !== firstHit && effectiveHit.object.userData && effectiveHit.object.userData.pick) {
        const u = effectiveHit.object.userData;
        if (u.kind === 'constellation') {
          constTags.highlight(u.id, storyState.selectedConstIdx !== null ? 'const:' + storyState.selectedConstIdx : null);
        } else {
          starMap.highlight(u.id);
        }
        if (active && !h.pinching) {
          h.pinching = true;
          h.dragConsumed = false;
          h.pinchedTarget = { starHit: u };
        }
      } else if (panel && hit) {
        const local = firstHit.object.worldToLocal(firstHit.point.clone());
        if (active && !h.pinching) {
          h.pinching = true;
          h.dragConsumed = false;
          h.pinchedTarget = {
            panel,
            hit,
            local: local.clone(),
            scrollY0: panel.scrollY,
          };
          h.lastLocal = local.clone();
        } else if (active && h.pinching && h.pinchedTarget && h.pinchedTarget.panel === panel) {
          const target = h.pinchedTarget;
          if (target.hit && target.hit.kind === 'slider') {
            const canvas = panel.localToCanvas(local);
            const trackX = target.hit.cx + 20;
            const trackW = target.hit.cw - 40;
            const val = Math.max(0, Math.min(1, (canvas.px - trackX) / trackW));
            panel.updateSlider(target.hit.id, val);
            if (target.hit.id === 'diffGainSlider') {
              const newGain = Math.max(1, Math.min(10, Math.round(1 + val * 9)));
              if (newGain !== storyState.diffGain) {
                storyState.diffGain = newGain;
                const sections = buildStoryCarouselPanels(storyState);
                home.setBody(sections[4].body);
              }
            } else if (target.hit.id === 'spectroSlider') {
              const maxIdx = Math.max(0, (COLORS || []).length - 1);
              const newSpectro = Math.max(0, Math.min(maxIdx, Math.round(val * maxIdx)));
              if (newSpectro !== storyState.spectroIdx) {
                storyState.spectroIdx = newSpectro;
                const sections = buildStoryCarouselPanels(storyState);
                home.setBody(sections[7].body);
              }
            } else {
              applySettings();
            }
          } else {
            const prev = panel.localToCanvas(target.local);
            const now = panel.localToCanvas(local);
            const dx = now.px - prev.px;
            const dy = now.py - prev.py;

            // Horizontal drag on a Story panel rotates the 360° Story Carousel left/right!
            if (storyRingGroup.visible && Math.abs(dx) > 135 && Math.abs(dx) > Math.abs(dy) * 1.35 && !h.dragConsumed) {
              h.dragConsumed = true;
              renderStorySection(storyState.activeIdx + (dx < 0 ? 1 : -1), true);
            } else if (Math.abs(dy) > 12) {
              panel.setScroll(target.scrollY0 + (prev.py - now.py) * -1);
            }
          }
        }
      } else if (!firstHit) {
        headerBar.setHover(null);
        home.setHover(null);
        wrist.setHover(null);
        satellitePanels.forEach((s) => s.setHover(null));
      } else if (firstHit && firstHit.object.userData && firstHit.object.userData.pick) {
        const u = firstHit.object.userData;
        if (u.kind === 'constellation') {
          constTags.highlight(u.id, storyState.selectedConstIdx !== null ? 'const:' + storyState.selectedConstIdx : null);
        } else {
          starMap.highlight(u.id);
        }
        if (active && !h.pinching) {
          h.pinching = true;
          h.dragConsumed = false;
          h.pinchedTarget = { starHit: u };
        }
      }

      if (!active && h.pinching) {
        const t = h.pinchedTarget;
        if (!h.dragConsumed) {
          if (t && t.panel && t.hit && t.hit.kind === 'button') {
            handleButton(t.hit.id);
          } else if (t && t.starHit) {
            if (t.starHit.kind === 'constellation') {
              showConstellationDetail(t.starHit.data.idx, true);
            } else {
              showCard(t.starHit.data);
            }
          }
        }
        h.pinching = false;
        h.pinchedTarget = null;
        h.dragConsumed = false;
      }
    }

    const camPos = new THREE.Vector3();
    ren.xr.getCamera(cam).getWorldPosition(camPos);
    if (camPos.y > 0.4) {
      eyeY = camPos.y;
    }

    // Smoothly animate home panel position (shifts left for side-by-side landmark/constellation view,
    // or centers directly in front of viewer)
    const isDetailView = mode.current === 'landmark-detail' || mode.current === 'constellation-detail' || mode.current === 'field-detail';
    panelTargetPos.x = isDetailView ? -0.60 : 0;
    panelTargetPos.y = eyeY - 0.20;
    panelTargetPos.z = -1.40;
    home.mesh.position.lerp(panelTargetPos, 0.12);

    // Auto-adjust headerBar position higher and dynamically anchor above whatever panel is active
    // so they never overlap
    const panelTopY = home.mesh.visible ? (home.mesh.position.y + 0.54) : (eyeY + 0.25);
    const desiredHeaderY = Math.max(eyeY + 0.46, panelTopY + 0.10);
    headerBar.mesh.position.set(0, desiredHeaderY, -1.40);

    home.mesh.lookAt(camPos.x, home.mesh.position.y, camPos.z);
    headerBar.mesh.lookAt(camPos.x, headerBar.mesh.position.y, camPos.z);
    if (wrist.mesh.visible) wrist.mesh.lookAt(camPos);

    // Fluttering glow animation on focused constellation figure and tag
    const tSec = performance.now() * 0.001;
    updateConstellationFlutter(tSec);
    if (typeof constTags.updateFlutter === 'function') {
      constTags.updateFlutter(tSec);
    }

    headerBar.refresh();
    home.refresh();
    wrist.refresh();
    if (storyRingGroup.visible) {
      satellitePanels.forEach((s) => s.refresh());
    }
  }

  // ---------- Session lifecycle ----------
  ren.xr.addEventListener('sessionstart', () => {
    xrRoot.visible = true;
    panelTargetPos.set(0, eyeY - 0.20, -1.40);
    home.mesh.position.set(0, eyeY - 0.20, -1.40);
    headerBar.mesh.position.set(0, eyeY + 0.46, -1.40);
    starMap.group.position.y = eyeY;
    constTags.group.position.y = eyeY;
    world.rotation.y = -Math.PI / 2;
    updateCompare();
    renderHome();
    applySettings();

    if (quickBtn) {
      quickBtn.classList.add('active');
      const sp = quickBtn.querySelector('span');
      if (sp) sp.textContent = 'Exit VR';
    }

    // Play 360° VR Intro (warp speed shader + typewriter "SPHEREx SKY VR MODE") unless ?intro=0
    const skipIntro = typeof location !== 'undefined' && location.search.includes('intro=0');
    if (!skipIntro) {
      home.mesh.visible = false;
      headerBar.mesh.visible = false;
      storyRingGroup.visible = false;
      wrist.mesh.visible = false;
      starMap.group.visible = false;
      constTags.group.visible = false;
      world.visible = false;
      vrIntro.preShow();
      vrIntro.play(() => {
        world.visible = true;
        headerBar.mesh.visible = true;
        home.mesh.visible = true;
        storyRingGroup.visible = true;
        applySettings();
      });
    }
  });

  ren.xr.addEventListener('sessionend', () => {
    vrIntro.stop && vrIntro.stop();
    stopSpeech();
    setConstellationsVisible(false);
    xrRoot.visible = false;
    world.visible = true;
    home.mesh.visible = true;
    headerBar.mesh.visible = true;
    storyRingGroup.visible = true;
    travel = null;
    fadeMat.opacity = 0;
    world.rotation.set(0, 0, 0);
    uniforms.mixA.value = 0.4;
    uniforms.mixG.value = 1.2;
    updateCompare();
    if (quickBtn) {
      quickBtn.classList.remove('active');
      const sp = quickBtn.querySelector('span');
      if (sp) sp.textContent = 'Enter VR';
    }
    try {
      ren.xr.setSession(null);
    } catch {}
  });

  // The viewer's render loop (viewer/sky/camera.js, startRenderLoop) calls sky.onXRFrame every XR frame!
  sky.onXRFrame = xrFrame;

  // Expose debug/automation hooks on sky.xr for verification
  sky.xr = {
    enterVR,
    exitVR,
    xrFrame,
    handleButton,
    renderStorySection,
    renderConstellationsCatalog,
    showConstellationDetail,
    showStarMap,
    showCard,
    renderGalleryCatalog,
    showFieldTargetDetail,
    refreshPanels: () => {
      headerBar.refresh();
      home.refresh();
      wrist.refresh();
      satellitePanels.forEach((s) => s.refresh());
    },
    getState: () => ({
      mode: mode.current,
      tab: mode.tab,
      activeStoryIdx: storyState.activeIdx,
      ringAngle: storyState.ringAngle,
      storyRingVisible: storyRingGroup.visible,
      landmarksVisible: starMap.group.visible,
      constellationsVisible: constTags.group.visible,
      headerVisible: headerBar.mesh.visible,
      homeTitle: home.title,
      homeHitsCount: home.hits.length,
    }),
  };
  if (typeof window !== 'undefined') {
    window.__spherexXR = sky.xr;
    window.spxXR = {
      get mode() { return mode.current; },
      get title() { return mode.current === 'starmap' ? 'Star Map' : home.title; },
      get fading() { return fadeMat.opacity; },
      get worldTilt() { return world.quaternion.toArray(); },
      get menuHidden() { return !home.mesh.visible; },
      go(id) { handleButton(id); },
      snapshot() { home.refresh(); return home.mesh.material.map.image.toDataURL('image/png'); },
      get starMap() { return starMap; },
      debugRay() {
        const h = hands[1] || hands[0];
        const res = hitFrom(h);
        return {
          ctrlVisible: h.controller.visible,
          origin: res.origin ? res.origin.toArray() : null,
          direction: res.direction ? res.direction.toArray() : null,
          targetsCount: pickTargets().length,
          hits: res.hits.map(x => ({ id: x.object.userData?.id, name: x.object.name, dist: x.distance }))
        };
      },
      buttonWorld(id) {
        const b = home.hits.find((h) => h.id === id || (id.endsWith(':') && h.id.startsWith(id)));
        if (!b) return null;
        home.mesh.position.copy(panelTargetPos);
        home.mesh.updateMatrixWorld(true);
        return home.mesh.localToWorld(home.canvasToLocal(b.cx + b.cw / 2, b.cy + b.ch / 2)).toArray();
      },
      starWorld(i) {
        // Return forward-facing pick so test runner controller aim (z = target[2] + 0.9) points towards the landmark cleanly
        const forwardPicks = starMap.picks.filter((p) => {
          const wp = p.mesh.getWorldPosition(new THREE.Vector3());
          return wp.z < -0.3;
        });
        const pick = (forwardPicks.length && (forwardPicks[i] || forwardPicks[0])) || starMap.picks[i] || starMap.picks[0];
        return pick ? pick.mesh.getWorldPosition(new THREE.Vector3()).toArray() : null;
      },
    };
  }
}
