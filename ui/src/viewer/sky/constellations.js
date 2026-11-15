import * as THREE from 'three';
import { CONSTELLATIONS } from '../../data';
import { dir } from './scene';
import { radecToGal } from './coords';
import { fly, flyToView } from './camera';
import { view } from './view';
import { playNarration, stopAllNarration, pauseAllNarration, resumeAllNarration, isAudioPlaying } from '../audio/narration';

// Classical constellation overlay on the globe (Explore ▸ Constellations).
//   on the sky: lines + star dots per constellation (three.js, additive glow)
//   per constellation: a title pill at the centroid (always visible in this mode)
//   click a pill: camera flies to the figure (focus), the side panel opens on the right, and the
//                 narration audio plays (supports both Meta Quest Browser MP3 fallback and SpeechSynthesis).

const R = 450;                              // just inside the sky sphere (r=500)
const BASE_COLOR = new THREE.Color(0xaee4ff);
const HOVER_COLOR = new THREE.Color(0xffd37a);
const SELECTED_COLOR = new THREE.Color(0xff6ad0);
const projected = new THREE.Vector3();

let entries = [];                            // one per constellation: { def, lines, dots, tag, centroid, galL, galB, hovered, selected }
let selected = null;
let labelHost = null;
let panel = null;
let sky = null;                               // kept so we can read sky.ren.xr.isPresenting for VR autoplay
let savedView = null;                         // camera pose captured when a constellation is selected, restored on close

/* ============================================================
 *  Narration helper (uses MP3 asset fallback + Web Speech API)
 * ============================================================ */

function speakConstellation(entry, onEnd) {
  if (!entry || !entry.def) return false;
  const idx = CONSTELLATIONS.indexOf(entry.def);
  const src = idx >= 0 ? `assets/audio/constellations/${idx}.mp3` : null;
  const text = fullNarration(entry.def);
  return playNarration({ src, text, onEnd });
}

function stopSpeaking() {
  stopAllNarration();
}

/* ============================================================
 *  Mini SVG diagram of a constellation (tangent-plane projection
 *  so it works near the poles — see Ursa Minor / Polaris)
 * ============================================================ */

function toUnit(ra, dec) {
  const g = radecToGal(ra, dec);
  return dir(g.l, g.b, 1);                  // THREE.Vector3 unit vector
}

function buildMiniSVG(def) {
  const W = 128, H = 128, PAD = 14;
  const vs = def.stars.map(([, ra, dec]) => toUnit(ra, dec));
  // centroid vector (normalized)
  const c = vs.reduce((acc, v) => acc.add(v), new THREE.Vector3()).normalize();
  // tangent basis: east = (world up × c).normalize(), north = c × east
  const worldUp = new THREE.Vector3(0, 1, 0);
  let east = new THREE.Vector3().crossVectors(worldUp, c);
  if (east.lengthSq() < 1e-6) east = new THREE.Vector3(1, 0, 0);  // c is aligned with up
  east.normalize();
  const north = new THREE.Vector3().crossVectors(c, east).normalize();
  // project each star onto (east, north); flip east so the diagram reads the same as the sky
  const pts = vs.map((v) => ({ x: -v.dot(east), y: -v.dot(north) }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (Math.min(W, H) - 2 * PAD) / range;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toScreen = (p) => ({ x: W / 2 + (p.x - cx) * scale, y: H / 2 + (p.y - cy) * scale });
  const S = pts.map(toScreen);

  const lines = def.edges.map(([i, j]) => {
    const a = S[i], b = S[j];
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" />`;
  }).join('');
  const dotsMarkup = S.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.3" />`).join('');

  return `<svg class="const-mini-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <g class="const-mini-lines">${lines}</g>
    <g class="const-mini-dots">${dotsMarkup}</g>
  </svg>`;
}

/* ============================================================
 *  Side panel on the right (built once, reused)
 * ============================================================ */

function buildPanel() {
  const el = document.createElement('aside');
  el.id = 'constellationPanel';
  el.innerHTML = `
    <button type="button" class="const-close-btn" aria-label="Close">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <p class="const-eyebrow">CONSTELLATION</p>
    <h2 class="const-title"></h2>
    <div class="const-mini" aria-hidden="true"></div>
    <div class="const-audio">
      <button type="button" class="const-audio-btn" aria-label="Play audio">
        <svg class="icon-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <svg class="icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        <span class="const-audio-label">Play narration</span>
      </button>
      <span class="const-audio-hint">English, auto-play in VR</span>
    </div>
    <div class="const-stats">
      <span><strong class="const-star-count">0</strong> named stars</span>
      <span class="const-stat-sep">·</span>
      <span><strong class="const-line-count">0</strong> lines</span>
      <span class="const-stat-sep">·</span>
      <span class="const-coords-readout"></span>
    </div>
    <div class="const-info-block">
      <p class="const-info-label">About this constellation</p>
      <p class="const-info"></p>
    </div>
    <p class="const-stars-label">Charted stars</p>
    <div class="const-chips"></div>
  `;
  document.body.appendChild(el);

  const close = () => { if (selected) selectEntry(selected); else hidePanel(); };
  el.querySelector('.const-close-btn').addEventListener('click', (e) => { e.stopPropagation(); close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.classList.contains('is-open')) close(); });

  // Play / pause audio button
  const audioBtn = el.querySelector('.const-audio-btn');
  audioBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isAudioPlaying()) {
      pauseAllNarration();
      setAudioState('paused');
    } else if (audioBtn.getAttribute('data-state') === 'paused') {
      resumeAllNarration();
      setAudioState('playing');
    } else if (selected) {
      const ok = speakConstellation(selected, () => setAudioState('idle'));
      setAudioState(ok ? 'playing' : 'idle');
    }
  });

  return el;
}

function setAudioState(state) {
  if (!panel) return;
  const btn = panel.querySelector('.const-audio-btn');
  const label = panel.querySelector('.const-audio-label');
  btn.setAttribute('data-state', state);
  label.textContent = state === 'playing' ? 'Pause narration' : state === 'paused' ? 'Resume narration' : 'Play narration';
}

/** The narration is the description text as written in constellations.json (English, TTS-friendly). */
function fullNarration(def) {
  return def.info || def.name;
}

function showPanel(def) {
  if (!panel) panel = buildPanel();
  panel.querySelector('.const-title').textContent = def.name;
  panel.querySelector('.const-info').textContent = def.info || '';
  panel.querySelector('.const-star-count').textContent = String(def.stars.length);
  panel.querySelector('.const-line-count').textContent = String(def.edges.length);
  const coordsEl = panel.querySelector('.const-coords-readout');
  if (coordsEl) {
    const ra = typeof def.ra === "number" ? def.ra.toFixed(1) : "";
    const dec = typeof def.dec === "number" ? (def.dec >= 0 ? "+" : "") + def.dec.toFixed(1) : "";
    coordsEl.textContent = ra ? `RA ${ra}°, Dec ${dec}°` : "";
  }
  panel.querySelector('.const-mini').innerHTML = buildMiniSVG(def);
  const chips = panel.querySelector('.const-chips');
  chips.innerHTML = '';
  def.stars.forEach(([name]) => {
    const chip = document.createElement('span');
    chip.className = 'const-chip';
    chip.textContent = name;
    chips.appendChild(chip);
  });

  panel.classList.add('is-open');
  // Audio: auto-play in both Web and VR when selected
  const ok = speakConstellation(selected, () => setAudioState('idle'));
  setAudioState(ok ? 'playing' : 'idle');
}

function hidePanel() {
  if (!panel) return;
  panel.classList.remove('is-open');
  stopSpeaking();
  setAudioState('idle');
}

/* ============================================================
 *  Init: build the three.js group + per-constellation DOM tag
 * ============================================================ */

export function initConstellations(skyRef) {
  sky = skyRef;
  const root = new THREE.Group();
  root.visible = false;
  sky.world.add(root);

  labelHost = document.createElement('div');
  labelHost.id = 'constellation-labels';
  labelHost.setAttribute('aria-hidden', 'true');
  document.body.appendChild(labelHost);

  const countEl = document.getElementById('constCount');
  if (countEl) countEl.textContent = String(CONSTELLATIONS.length);

  CONSTELLATIONS.forEach((c) => {
    const gal = c.stars.map(([, ra, dec]) => radecToGal(ra, dec));
    const points = gal.map((g) => dir(g.l, g.b, R));
    const group = new THREE.Group();

    const linePositions = [];
    c.edges.forEach(([i, j]) => {
      const a = points[i];
      const b = points[j];
      linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: BASE_COLOR.clone(),
      transparent: true,
      opacity: 0.9,
      linewidth: 2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    group.add(lines);

    const dotPositions = [];
    points.forEach((p) => dotPositions.push(p.x, p.y, p.z));
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
    const dotMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dots = new THREE.Points(dotGeo, dotMat);
    group.add(dots);
    root.add(group);

    const mean = points.reduce((v, p) => v.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
    const centroid = mean.clone().normalize().multiplyScalar(R);
    // galactic (l, b) of the centroid — exact inverse of scene.dir() so fly() lands on the figure.
    //   dir(l, b) = (cos p · cos B, sin B, sin p · cos B)  where  p = π − π · L / 180
    //   and L is l normalised to [−180, 180).
    //   => B = asin(y);  p = atan2(z, x)  wrapped to [0, 2π);  L = 180 − 180·p/π;  l = L mod 360.
    const unit = centroid.clone().normalize();
    const galB = (Math.asin(unit.y) * 180) / Math.PI;
    let pAngle = Math.atan2(unit.z, unit.x);
    if (pAngle < 0) pAngle += 2 * Math.PI;
    const galL = (((180 - (180 * pAngle) / Math.PI) % 360) + 360) % 360;

    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'const-tag';
    tag.setAttribute('aria-label', c.name);
    tag.innerHTML = `<span class="const-title-pill">${c.name}</span>`;
    labelHost.appendChild(tag);

    const entry = { def: c, group, lines, lineMat, dots, dotMat, tag, centroid, galL, galB, hovered: false, selected: false };
    tag.addEventListener('pointerenter', () => setHover(entry, true));
    tag.addEventListener('pointerleave', () => setHover(entry, false));
    tag.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); selectEntry(entry); });

    entries.push(entry);
  });

  initConstellations._root = root;

  // Auto-sync with backend /api/constellations when available so backend coordinate updates propagate automatically
  if (typeof fetch === "function") {
    fetch("/api/constellations")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.constellations) || !data.constellations.length) return;
        if (countEl) countEl.textContent = String(data.constellations.length);
        data.constellations.forEach((srv, idx) => {
          const e = entries[idx];
          if (!e || e.def.name !== srv.name) return;
          e.def = { ...e.def, ...srv };
          if (typeof srv.l === "number" && typeof srv.b === "number") {
            e.galL = srv.l;
            e.galB = srv.b;
            e.centroid.copy(dir(srv.l, srv.b, R));
          }
        });
      })
      .catch(() => {});
  }
}

function setHover(entry, on) {
  entry.hovered = on;
  entry.tag.classList.toggle('is-hover', on);
  applyMaterial(entry);
}

function selectEntry(entry) {
  if (selected && selected !== entry) {
    // switching focus to a different figure: keep the originally-saved view, just re-focus
    selected.selected = false;
    selected.tag.classList.remove('is-selected');
    applyMaterial(selected);
    entry.selected = true;
    entry.tag.classList.add('is-selected');
    applyMaterial(entry);
    selected = entry;
    focusGroup(entry);
    fly([entry.def.name, entry.galL, entry.galB], 38);
    showPanel(entry.def);
    return;
  }
  if (selected === entry) {
    // toggle off → leave focus mode, return to the pose the user was at when they entered focus
    exitFocus();
    return;
  }
  // entering focus for the first time: capture the current camera pose so we can restore it later
  savedView = { yaw: view.yaw, pit: view.pit, fov: view.fov };
  entry.selected = true;
  entry.tag.classList.add('is-selected');
  applyMaterial(entry);
  selected = entry;
  document.body.classList.add('const-focus');   // hides header / bottom bar / badges — css/sky.css
  focusGroup(entry);                            // hide every other constellation's lines/dots + pill
  fly([entry.def.name, entry.galL, entry.galB], 38);
  showPanel(entry.def);
}

function exitFocus() {
  if (!selected) {                              // called while nothing is selected → still make sure UI is restored
    document.body.classList.remove('const-focus');
    restoreAllGroups();
    hidePanel();
    return;
  }
  selected.selected = false;
  selected.tag.classList.remove('is-selected');
  applyMaterial(selected);
  selected = null;
  document.body.classList.remove('const-focus');
  restoreAllGroups();
  hidePanel();
  if (savedView) {
    flyToView(savedView.yaw, savedView.pit, savedView.fov);
    savedView = null;
  }
}

function focusGroup(entry) {
  entries.forEach((e) => { e.group.visible = (e === entry); });
}

function restoreAllGroups() {
  entries.forEach((e) => { e.group.visible = true; });
}

function applyMaterial(entry) {
  const base = entry.selected ? SELECTED_COLOR : entry.hovered ? HOVER_COLOR : BASE_COLOR;
  entry.lineMat.color.copy(base);
  entry.lineMat.opacity = entry.selected ? 1 : entry.hovered ? 1 : 0.9;
  entry.dotMat.size = entry.selected ? 10 : entry.hovered ? 9 : 6;
}

/** Guided tour: focus one constellation exactly like a click on its pill (camera flight, side panel, others hidden). */
export function focusConstellationByName(name) {
  const entry = entries.find((e) => e.def.name === name);
  if (!entry) return null;
  setConstellationsVisible(true);
  if (selected !== entry) selectEntry(entry);
  return entry.def;
}

/** Guided tour: leave the constellation focus (no camera move back; the next stop flies on). */
export function leaveConstellationFocus() {
  setConstellationsVisible(false);
}

/** Enter / exit the Constellations mode (navigation.js calls this). */
export function setConstellationsVisible(on) {
  const root = initConstellations._root;
  if (root) root.visible = on;
  document.body.classList.toggle('constellations-active', on);
  if (!on) {
    // leaving the mode entirely: clear focus state and camera restore pose, but don't fly back
    // (the user is being taken to another mode by navigation.js)
    if (selected) {
      selected.selected = false;
      selected.tag.classList.remove('is-selected');
      applyMaterial(selected);
      selected = null;
    }
    document.body.classList.remove('const-focus');
    savedView = null;
    restoreAllGroups();
    hidePanel();
  }
}

/** VR constellation selection with isolated focus */
export function selectConstellationVR(idx) {
  if (idx < 0 || idx >= entries.length) {
    clearConstellationSelectionVR();
    return;
  }
  const entry = entries[idx];
  if (selected && selected !== entry) {
    selected.selected = false;
    applyMaterial(selected);
  }
  entry.selected = true;
  selected = entry;
  focusGroup(entry);
  applyMaterial(entry);
}

/** Clears VR constellation focus and restores all constellation figures */
export function clearConstellationSelectionVR() {
  if (selected) {
    selected.selected = false;
    applyMaterial(selected);
    selected = null;
    restoreAllGroups();
  }
}

/**
 * Animated fluttering glow on the selected constellation figure.
 * Called every frame from sky.onXRFrame / xrFrame.
 */
export function updateConstellationFlutter(time) {
  if (!selected) return;
  const t = typeof time === 'number' ? time : performance.now() * 0.001;
  // Multi-frequency fluttering pulsation
  const flutter = Math.sin(t * 6.2) * 0.35 + Math.sin(t * 14.1) * 0.15;
  const shimmer = Math.max(0, Math.min(1, 0.5 + flutter));

  // Pulse line opacity and color from hot magenta to bright starlight
  selected.lineMat.opacity = 0.65 + 0.35 * shimmer;
  selected.lineMat.color.setRGB(
    1.0,
    0.41 + 0.52 * shimmer,
    0.82 + 0.18 * shimmer
  );
  // Flutter star point size
  selected.dotMat.size = 8.5 + 6.0 * shimmer;
  selected.dotMat.opacity = 0.85 + 0.15 * shimmer;
}

/** Every frame: place each DOM tag over its centroid. */
export function updateConstellationLabels(cam, inXR) {
  if (!entries.length) return;
  const root = initConstellations._root;
  const on = root && root.visible && !inXR;
  entries.forEach((e) => {
    // while one constellation is focused, every other pill stays hidden
    if (!on || (selected && e !== selected)) { e.tag.style.display = 'none'; return; }
    projected.copy(e.centroid).project(cam);
    if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
      e.tag.style.display = 'none';
      return;
    }
    e.tag.style.display = 'flex';
    const x = ((projected.x + 1) / 2) * innerWidth;
    const y = ((1 - projected.y) / 2) * innerHeight;
    e.tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  });
}
