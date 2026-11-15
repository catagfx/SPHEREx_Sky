import * as THREE from 'three';

// Holographic UI panel factory for VR (WebGL CanvasTexture meshes).
// Supports:
//   - Standard Story / Detail cards (matched to desktop .showcase-card / #constellationPanel / #gal styling)
//   - Floating Top Header Bar (variant: 'header', matched to desktop #hdr navigation tabs)
//   - Rich content blocks with real SPHEREx image rendering:
//     tag, heading, paragraph, divider, kv, button, buttonRow, slider,
//     listItem (with optional photo thumbnail), cardGrid (with real cutout / sky-crop photos),
//     heroImage (large cutout / sky-crop / difference-subtraction viewer with target reticle & overlay badge),
//     spectrumStrip (102 IR bands), constellationDiagram, chipList.

// Desktop-matched Web UI Palette (Dark Glass + Warm Amber/Orange accent)
const WARM = '#ffb86b';
const WARM_HOVER_BG = 'rgba(255,184,107,0.18)';
const WARM_ACTIVE_BG = 'rgba(255,184,107,0.24)';
const CYAN = '#8fd3ff';
const CYAN_DIM = 'rgba(143,211,255,0.40)';
const INK = '#ffffff';
const SUB = 'rgba(255,255,255,0.74)';
const DIM = 'rgba(255,255,255,0.48)';
const GLASS_BORDER = 'rgba(255,255,255,0.16)';
const GLASS_HIGHLIGHT = 'rgba(255,255,255,0.28)';
const PANEL_BG_TOP = 'rgba(14,20,36,0.95)';
const PANEL_BG_BOT = 'rgba(8,12,22,0.98)';

export const PANEL_PIX = 1024;                 // canvas resolution, base unit
export const PANEL_WORLD = 0.75;               // world-space size (m), base unit (tuned for VR legibility)

/* ============================================================
 *  Shared Async Image Cache & Composite Sky Map Cropper
 *  Automatically marks all VR panels dirty when any image finishes loading.
 * ============================================================ */

const IMAGE_CACHE = new Map();                 // src -> { img, loaded, error }
const DIRTY_LISTENERS = new Set();

function notifyImagesUpdated() {
  DIRTY_LISTENERS.forEach((fn) => {
    try { fn(); } catch (_) { /* ignore */ }
  });
}

export function getImage(src) {
  if (!src || typeof Image === 'undefined') return null;
  let entry = IMAGE_CACHE.get(src);
  if (entry) return entry.loaded ? entry.img : null;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  entry = { img, loaded: false, error: false };
  IMAGE_CACHE.set(src, entry);

  img.onload = () => {
    entry.loaded = true;
    if (src.includes('sky_stars.jpg') || src.includes('sky_dust.jpg')) {
      rebuildSkyComposite();
    }
    notifyImagesUpdated();
  };
  img.onerror = () => {
    entry.error = true;
  };
  img.src = src;
  return null;
}

// 2048x512 seamless horizontal wrap-around composite of sky_stars.jpg + sky_dust.jpg
// so any Galactic (l, b) landmark can be cropped without seam clipping near l = 180°.
let skyCompositeCanvas = null;
let skyCompositeReady = false;

function rebuildSkyComposite() {
  if (typeof document === 'undefined') return;
  const stars = getImage('assets/sky_stars.jpg');
  const dust = getImage('assets/sky_dust.jpg');
  if (!stars && !dust) return;

  if (!skyCompositeCanvas) {
    skyCompositeCanvas = document.createElement('canvas');
    skyCompositeCanvas.width = 2048;
    skyCompositeCanvas.height = 512;
  }
  const sctx = skyCompositeCanvas.getContext('2d');
  sctx.save();
  sctx.clearRect(0, 0, 2048, 512);
  sctx.fillStyle = '#050914';
  sctx.fillRect(0, 0, 2048, 512);

  if (stars) {
    sctx.globalAlpha = 0.85;
    sctx.drawImage(stars, 0, 0, 1024, 512);
    sctx.drawImage(stars, 1024, 0, 1024, 512);
  }
  if (dust) {
    sctx.globalCompositeOperation = 'screen';
    sctx.globalAlpha = 0.95;
    sctx.drawImage(dust, 0, 0, 1024, 512);
    sctx.drawImage(dust, 1024, 0, 1024, 512);
  }
  sctx.restore();
  skyCompositeReady = true;
}

// Cached digital difference image (Epoch B - Epoch A) for Story Panel 05
let diffCache = { key: '', canvas: null };
function getDifferenceCanvas(srcA, srcB, gain = 4, invert = false) {
  const imgA = getImage(srcA);
  const imgB = getImage(srcB);
  if (!imgA || !imgB) return null;
  const key = `${srcA}|${srcB}|${gain}|${invert ? 1 : 0}`;
  if (diffCache.key === key && diffCache.canvas) return diffCache.canvas;

  const w = 360, h = 240;
  const c = diffCache.canvas || document.createElement('canvas');
  c.width = w;
  c.height = h;
  const dctx = c.getContext('2d');

  const tmpA = document.createElement('canvas');
  tmpA.width = w; tmpA.height = h;
  const ctxA = tmpA.getContext('2d');
  ctxA.drawImage(imgA, 0, 0, w, h);
  const dataA = ctxA.getImageData(0, 0, w, h).data;

  const tmpB = document.createElement('canvas');
  tmpB.width = w; tmpB.height = h;
  const ctxB = tmpB.getContext('2d');
  ctxB.drawImage(imgB, 0, 0, w, h);
  const dataB = ctxB.getImageData(0, 0, w, h).data;

  const out = dctx.createImageData(w, h);
  const od = out.data;
  const sign = invert ? -1 : 1;
  for (let i = 0; i < od.length; i += 4) {
    const lumA = 0.299 * dataA[i] + 0.587 * dataA[i + 1] + 0.114 * dataA[i + 2];
    const lumB = 0.299 * dataB[i] + 0.587 * dataB[i + 1] + 0.114 * dataB[i + 2];
    const diff = sign * gain * (lumB - lumA);
    const v = Math.max(0, Math.min(255, Math.round(128 + diff)));
    // Tint positive flux dipole cyan-white and negative flux warm/dark for scientific clarity
    od[i] = Math.max(0, Math.min(255, v + (diff > 18 ? 16 : 0)));
    od[i + 1] = v;
    od[i + 2] = Math.max(0, Math.min(255, v + (diff > 18 ? 28 : 0)));
    od[i + 3] = 255;
  }
  dctx.putImageData(out, 0, 0);
  diffCache = { key, canvas: c };
  return c;
}

function bandColor(wl) {
  const t = (wl - 0.75) / (5.0 - 0.75);
  const r = Math.round(255 * Math.max(0, 1 - 0.65 * t));
  const g = Math.round(255 * Math.max(0, Math.min(1, 1.3 * (1 - Math.abs(t - 0.45) * 1.8))));
  const b = Math.round(255 * Math.max(0, (t - 0.55) * 1.5));
  return `rgb(${r}, ${g}, ${b})`;
}

export function createPanel({ w = 1, h = 1, title = '', interactive = true, variant = 'card' } = {}) {
  const wPx = Math.round(PANEL_PIX * w);
  const hPx = Math.round(PANEL_PIX * h);
  const canvas = document.createElement('canvas');
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;

  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.98,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const geom = new THREE.PlaneGeometry(PANEL_WORLD * w, PANEL_WORLD * h);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = variant === 'header' ? 11 : 10;
  mesh.name = 'xr-panel-' + (title || variant).replace(/\s+/g, '-').toLowerCase();

  const state = {
    title,
    variant,
    body: [],
    scrollY: 0,
    scrollMax: 0,
    scrollTop: 0,
    hits: [],
    sliders: {},
    buttons: {},
    dirty: true,
    interactive,
    hover: null,
    activeTab: 'story',
  };

  const markDirty = () => { state.dirty = true; };
  DIRTY_LISTENERS.add(markDirty);

  // Kick off background loading of the all-sky textures so Landmark sky crops are ready immediately
  getImage('assets/sky_stars.jpg');
  getImage('assets/sky_dust.jpg');

  function roundedPath(x, y, rw, rh, r) {
    const rad = Math.min(r, rw / 2, rh / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
    ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
    ctx.arcTo(x, y + rh, x, y, rad);
    ctx.arcTo(x, y, x + rw, y, rad);
    ctx.closePath();
  }

  function drawRoundedRect(x, y, rw, rh, r, fill, stroke, lineW = 2) {
    roundedPath(x, y, rw, rh, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineW; ctx.stroke(); }
  }

  /**
   * Draws either:
   *  - A real SPHEREx science frame (`spec.img`), optionally zoomed around `(spec.fx, spec.fy)` like desktop `gallery.js`
   *  - A live difference subtraction canvas (`spec.diff`: `{ srcA, srcB, gain, invert }`)
   *  - Or a Galactic `(l, b)` sky crop (`spec.skyCrop`: `{ l, b, fov }`) from the composite all-sky map.
   */
  function drawVisualBox(spec, dx, dy, dw, dh, radius = 12) {
    ctx.save();
    roundedPath(dx, dy, dw, dh, radius);
    ctx.fillStyle = '#060b18';
    ctx.fill();
    ctx.clip();

    let drawn = false;
    let reticleX = dx + dw * 0.5;
    let reticleY = dy + dh * 0.5;
    const showReticle = spec.reticle !== false;

    if (spec.diff) {
      const dcan = getDifferenceCanvas(spec.diff.srcA, spec.diff.srcB, spec.diff.gain, spec.diff.invert);
      if (dcan) {
        ctx.drawImage(dcan, dx, dy, dw, dh);
        drawn = true;
      }
    } else if (spec.img) {
      const img = getImage(spec.img);
      if (img && img.width > 0 && img.height > 0) {
        const zoom = spec.zoom || (typeof spec.fx === 'number' ? 2.1 : 1.0);
        const fx = typeof spec.fx === 'number' ? spec.fx : 0.5;
        const fy = typeof spec.fy === 'number' ? spec.fy : 0.5;
        const boxAspect = dw / dh;
        const imgAspect = img.width / img.height;

        let sw, sh;
        if (imgAspect > boxAspect) {
          sh = img.height / zoom;
          sw = sh * boxAspect;
        } else {
          sw = img.width / zoom;
          sh = sw / boxAspect;
        }
        sw = Math.min(img.width, Math.max(32, sw));
        sh = Math.min(img.height, Math.max(32, sh));

        const targetPxX = fx * img.width;
        const targetPxY = fy * img.height;
        const sx = Math.max(0, Math.min(img.width - sw, targetPxX - sw / 2));
        const sy = Math.max(0, Math.min(img.height - sh, targetPxY - sh / 2));

        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        reticleX = dx + ((targetPxX - sx) / sw) * dw;
        reticleY = dy + ((targetPxY - sy) / sh) * dh;
        drawn = true;
      }
    }

    if (!drawn && spec.skyCrop) {
      if (!skyCompositeReady) rebuildSkyComposite();
      if (skyCompositeReady && skyCompositeCanvas) {
        const l = Number(spec.skyCrop.l || 0);
        const b = Number(spec.skyCrop.b || 0);
        const fovDeg = Number(spec.skyCrop.fov || 32);
        const u = 0.5 - ((((l + 180) % 360) + 360) % 360 - 180) / 360;
        const v = Math.max(0.08, Math.min(0.92, 0.5 - b / 180));

        const boxAspect = dw / dh;
        const sh = Math.max(36, Math.min(260, (fovDeg / 180) * 512));
        const sw = Math.min(512, sh * boxAspect);
        const cx = (u + 0.5) * 1024; // centered in the middle of the 2048px double-wrapped canvas
        const cy = v * 512;
        const sx = Math.max(0, Math.min(2048 - sw, cx - sw / 2));
        const sy = Math.max(0, Math.min(512 - sh, cy - sh / 2));

        ctx.drawImage(skyCompositeCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
        reticleX = dx + ((cx - sx) / sw) * dw;
        reticleY = dy + ((cy - sy) / sh) * dh;
        drawn = true;
      }
    }

    if (!drawn) {
      // Fallback starfield placeholder while texture loads
      const g = ctx.createRadialGradient(dx + dw / 2, dy + dh / 2, 4, dx + dw / 2, dy + dh / 2, Math.max(dw, dh) * 0.7);
      g.addColorStop(0, 'rgba(143,211,255,0.28)');
      g.addColorStop(0.5, 'rgba(255,184,107,0.12)');
      g.addColorStop(1, 'rgba(6,11,24,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(dx, dy, dw, dh);
    }

    // Target reticle ring (matches desktop .rg target ring in Gallery / Explorer)
    if (showReticle) {
      const ringR = Math.max(10, Math.min(22, Math.min(dw, dh) * 0.16));
      ctx.strokeStyle = spec.reticleColor || WARM;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = spec.reticleColor || WARM;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(reticleX, reticleY, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Optional overlay badge at bottom-left of image
    if (spec.overlayBadge) {
      ctx.font = '600 15px "Space Grotesk", sans-serif';
      const tw = Math.min(dw - 20, Math.ceil(ctx.measureText(spec.overlayBadge).width) + 22);
      const bh = 28;
      const bx = dx + 10;
      const by = dy + dh - bh - 10;
      drawRoundedRect(bx, by, tw, bh, 8, 'rgba(6, 10, 22, 0.86)', 'rgba(143,211,255,0.45)', 1.2);
      ctx.fillStyle = '#e8f4ff';
      ctx.textBaseline = 'middle';
      ctx.fillText(spec.overlayBadge, bx + 11, by + bh / 2);
      ctx.textBaseline = 'top';
    }

    ctx.restore();
    drawRoundedRect(dx, dy, dw, dh, radius, null, 'rgba(143,211,255,0.34)', 1.5);
  }

  function clear() {
    ctx.clearRect(0, 0, wPx, hPx);
  }

  function wrapText(text, maxWidth) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawHeaderBar() {
    const pad = 12;
    ctx.save();
    const bgGrad = ctx.createLinearGradient(0, pad, 0, hPx - pad);
    bgGrad.addColorStop(0, 'rgba(12, 18, 32, 0.96)');
    bgGrad.addColorStop(1, 'rgba(6, 10, 20, 0.98)');
    drawRoundedRect(pad, pad, wPx - pad * 2, hPx - pad * 2, 24, bgGrad, GLASS_BORDER, 1.5);

    let x = pad + 28;
    const cy = hPx / 2;
    ctx.font = '700 24px "Plus Jakarta Sans", -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPHEREx SKY', x, cy);
    const brandW = ctx.measureText('SPHEREx SKY').width;
    x += brandW + 12;

    ctx.font = '600 13px "Space Mono", monospace';
    ctx.fillStyle = WARM;
    ctx.fillText('| NASA 2026', x, cy + 1);
    const subW = ctx.measureText('| NASA 2026').width;
    x += subW + 24;

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 12, pad + 14);
    ctx.lineTo(x - 12, hPx - pad - 14);
    ctx.stroke();

    const items = state.body || [];
    const availW = wPx - x - pad - 16;
    const gap = 8;
    const btnW = Math.floor((availW - gap * Math.max(0, items.length - 1)) / Math.max(1, items.length));
    const btnH = hPx - pad * 2 - 20;
    const btnY = pad + 10;

    items.forEach((it) => {
      const isHover = state.hover === it.id;
      const isActive = it.active || state.activeTab === it.navId;
      const isExit = it.variant === 'danger';

      const fill = isExit
        ? (isHover ? 'rgba(239,68,68,0.26)' : 'rgba(239,68,68,0.12)')
        : isActive
          ? WARM_ACTIVE_BG
          : isHover
            ? WARM_HOVER_BG
            : 'rgba(255,255,255,0.04)';

      const stroke = isExit
        ? '#ef4444'
        : isActive
          ? WARM
          : isHover
            ? WARM
            : 'rgba(255,255,255,0.14)';

      drawRoundedRect(x, btnY, btnW, btnH, 8, fill, stroke, isActive || isHover ? 1.8 : 1);
      ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = isExit ? '#fca5a5' : isActive ? '#ffffff' : (isHover ? WARM : 'rgba(255,255,255,0.85)');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label, x + btnW / 2, btnY + btnH / 2);
      state.hits.push({ id: it.id, cx: x, cy: btnY, cw: btnW, ch: btnH, kind: 'button', data: it.data });
      x += btnW + gap;
    });
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function drawFrame() {
    const pad = 16;
    ctx.save();
    const bgGrad = ctx.createLinearGradient(0, pad, 0, hPx - pad);
    bgGrad.addColorStop(0, PANEL_BG_TOP);
    bgGrad.addColorStop(1, PANEL_BG_BOT);

    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 32;
    drawRoundedRect(pad, pad, wPx - pad * 2, hPx - pad * 2, 28, bgGrad, GLASS_BORDER, 1.5);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (state.title) {
      ctx.font = '700 12px "Space Mono", monospace';
      ctx.fillStyle = WARM;
      ctx.textBaseline = 'middle';
      ctx.fillText('SPHEREx INTERACTIVE VR', pad + 38, pad + 36);

      ctx.font = '700 30px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(state.title), pad + 38, pad + 64);

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + 38, pad + 92);
      ctx.lineTo(wPx - pad - 38, pad + 92);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawConstellationMini(pts, edges, boxX, boxY, boxW, boxH) {
    ctx.save();
    drawRoundedRect(boxX, boxY, boxW, boxH, 10, 'rgba(6,10,20,0.90)', 'rgba(255,255,255,0.16)', 1.2);
    const pad = 22;
    const size = Math.min(boxW, boxH) - pad * 2;
    const ox = boxX + (boxW - size) / 2;
    const oy = boxY + (boxH - size) / 2;

    if (pts && pts.length) {
      ctx.strokeStyle = WARM;
      ctx.lineWidth = 2.5;
      (edges || []).forEach(([i, j]) => {
        const a = pts[i];
        const b = pts[j];
        if (!a || !b) return;
        ctx.beginPath();
        ctx.moveTo(ox + a.nx * size, oy + a.ny * size);
        ctx.lineTo(ox + b.nx * size, oy + b.ny * size);
        ctx.stroke();
      });

      pts.forEach((p) => {
        const px = ox + p.nx * size;
        const py = oy + p.ny * size;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = WARM;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawBody() {
    const pad = 16;
    const bodyX = pad + 38;
    const bodyY = pad + 104;
    const bodyW = wPx - (pad + 38) * 2;
    const bodyH = hPx - bodyY - pad - 20;
    state.scrollTop = bodyY;

    // Pass 1: Measure content height to dynamically distribute space and eliminate dead bottom space
    let estHeight = 0;
    for (const item of state.body) {
      if (!item) continue;
      if (item.type === 'tag') estHeight += 34;
      else if (item.type === 'heading') {
        ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
        estHeight += wrapText(item.text, bodyW).length * 36 + 6;
      } else if (item.type === 'paragraph') {
        ctx.font = '400 22px "Plus Jakarta Sans", sans-serif';
        const rawParas = String(item.text || '').split(/\n\s*\n/);
        let pLines = 0;
        for (const p of rawParas) {
          pLines += wrapText(p, bodyW).length;
        }
        estHeight += pLines * 30 + (rawParas.length - 1) * 10 + 8;
      } else if (item.type === 'heroImage') {
        const boxH = Math.min(320, Math.max(240, (item.height || 220)));
        estHeight += boxH + 14;
      } else if (item.type === 'divider') estHeight += 16;
      else if (item.type === 'kv') estHeight += 32;
      else if (item.type === 'button') estHeight += (item.compact ? 50 : 58) + 12;
      else if (item.type === 'buttonRow') estHeight += (item.compact ? 48 : 54) + 12;
      else if (item.type === 'cardGrid') {
        const cols = item.cols || 2;
        const rows = Math.ceil((item.cards || []).length / cols);
        estHeight += rows * ((item.cardHeight || 120) + 12) + 4;
      } else if (item.type === 'spectrumStrip') estHeight += 44 + 8 + 28;
      else if (item.type === 'constellationDiagram') estHeight += 210 + 16;
      else if (item.type === 'chipList') estHeight += 84;
      else if (item.type === 'slider') estHeight += 32 + 42;
      else if (item.type === 'listItem') estHeight += (item.img || item.skyCrop ? 92 : 74) + 10;
    }

    const freeSpace = Math.max(0, bodyH - estHeight - 20);
    const heroBonus = freeSpace > 40 ? Math.min(120, Math.floor(freeSpace * 0.4)) : 0;
    const cardBonus = freeSpace > 50 ? Math.min(24, Math.floor(freeSpace * 0.25)) : 0;
    const itemGapBonus = freeSpace > 30 ? Math.min(12, Math.floor((freeSpace - heroBonus) / Math.max(1, state.body.length))) : 0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(bodyX - 10, bodyY, bodyW + 20, bodyH);
    ctx.clip();

    let y = bodyY - state.scrollY;
    ctx.textBaseline = 'top';

    for (const item of state.body) {
      if (!item) continue;
      if (item.type === 'tag') {
        ctx.font = '700 13px "Space Mono", monospace';
        const tw = Math.ceil(ctx.measureText(String(item.text || '').toUpperCase()).width) + 20;
        const tagX = item.align === 'center' ? bodyX + Math.round((bodyW - tw) / 2) : bodyX;
        drawRoundedRect(tagX, y, tw, 26, 6, 'rgba(255,184,107,0.12)', 'rgba(255,184,107,0.38)', 1);
        ctx.fillStyle = WARM;
        ctx.textBaseline = 'middle';
        ctx.fillText(String(item.text || '').toUpperCase(), tagX + 10, y + 13);
        ctx.textBaseline = 'top';
        y += 34 + itemGapBonus;
      } else if (item.type === 'heading') {
        ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = item.color || '#ffffff';
        const lines = wrapText(item.text, bodyW);
        const isCenter = item.align === 'center';
        if (isCenter) ctx.textAlign = 'center';
        for (const l of lines) {
          ctx.fillText(l, isCenter ? bodyX + bodyW / 2 : bodyX, y);
          y += 36;
        }
        if (isCenter) ctx.textAlign = 'left';
        y += 6 + itemGapBonus;
      } else if (item.type === 'paragraph') {
        ctx.font = '400 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = item.dim ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.78)';
        const isCenter = item.align === 'center';
        if (isCenter) ctx.textAlign = 'center';
        const rawParas = String(item.text || '').split(/\n\s*\n/);
        for (let pIdx = 0; pIdx < rawParas.length; pIdx++) {
          const lines = wrapText(rawParas[pIdx], bodyW);
          for (const l of lines) {
            ctx.fillText(l, isCenter ? bodyX + bodyW / 2 : bodyX, y);
            y += 30;
          }
          if (pIdx < rawParas.length - 1) {
            y += 10;
          }
        }
        if (isCenter) ctx.textAlign = 'left';
        y += 8 + itemGapBonus;
      } else if (item.type === 'heroImage') {
        const boxH = Math.min(340, Math.max(240, (item.height || 220) + heroBonus));
        const boxSize = boxH;
        const boxX = bodyX + Math.round((bodyW - boxSize) / 2);
        drawVisualBox(item, boxX, y, boxSize, boxSize, 12);
        y += boxSize + 14 + itemGapBonus;
      } else if (item.type === 'divider') {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bodyX, y + 6);
        ctx.lineTo(bodyX + bodyW, y + 6);
        ctx.stroke();
        y += 16 + itemGapBonus;
      } else if (item.type === 'kv') {
        ctx.font = '600 20px "Space Mono", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(item.k, bodyX, y);
        const kwidth = ctx.measureText(item.k).width;
        ctx.font = '500 21px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(item.v, bodyX + kwidth + 16, y);
        y += 32 + itemGapBonus;
      } else if (item.type === 'button') {
        const bh = item.compact ? 50 : 58;
        const bw = item.fullWidth ? bodyW : Math.min(bodyW - 10, 580);
        const hover = state.hover === item.id;
        const variant = item.variant || 'secondary';
        const bg = variant === 'primary' || variant === 'warm'
          ? (hover ? 'rgba(255,184,107,0.26)' : 'rgba(255,184,107,0.16)')
          : (hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)');
        const stroke = variant === 'primary' || variant === 'warm' ? WARM : (hover ? WARM : 'rgba(255,255,255,0.26)');
        drawRoundedRect(bodyX, y, bw, bh, 8, bg, stroke, hover ? 1.8 : 1.2);
        ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = hover || variant === 'primary' || variant === 'warm' ? WARM : '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, bodyX + 22, y + bh / 2);
        ctx.textBaseline = 'top';
        state.hits.push({ id: item.id, cx: bodyX, cy: y, cw: bw, ch: bh, kind: 'button', data: item.data });
        y += bh + 12 + itemGapBonus;
      } else if (item.type === 'buttonRow') {
        const btns = item.buttons || [];
        const gap = 12;
        const bh = item.compact ? 48 : 54;
        const bw = Math.floor((bodyW - gap * Math.max(0, btns.length - 1)) / Math.max(1, btns.length));
        btns.forEach((b, idx) => {
          const bx = bodyX + idx * (bw + gap);
          const hover = state.hover === b.id;
          const v = b.variant || 'secondary';
          const bg = v === 'primary' || v === 'warm'
            ? (hover ? 'rgba(255,184,107,0.26)' : 'rgba(255,184,107,0.16)')
            : (hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)');
          const stroke = v === 'primary' || v === 'warm' ? WARM : (hover ? WARM : 'rgba(255,255,255,0.26)');
          drawRoundedRect(bx, y, bw, bh, 8, bg, stroke, hover ? 1.8 : 1.2);
          ctx.font = '600 19px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = hover || v === 'primary' || v === 'warm' ? WARM : '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.label, bx + bw / 2, y + bh / 2);
          state.hits.push({ id: b.id, cx: bx, cy: y, cw: bw, ch: bh, kind: 'button', data: b.data });
        });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        y += bh + 12 + itemGapBonus;
      } else if (item.type === 'cardGrid') {
        const cards = item.cards || [];
        const cols = item.cols || 2;
        const gap = 12;
        const cw = Math.floor((bodyW - gap * (cols - 1)) / cols);
        const ch = (item.cardHeight || 120) + cardBonus;
        for (let i = 0; i < cards.length; i += cols) {
          for (let c = 0; c < cols && i + c < cards.length; c++) {
            const card = cards[i + c];
            const cx = bodyX + c * (cw + gap);
            const hover = card.id && state.hover === card.id;
            const stroke = hover ? WARM : 'rgba(255,255,255,0.14)';
            const bg = hover ? 'rgba(255,184,107,0.12)' : 'rgba(255,255,255,0.04)';
            drawRoundedRect(cx, y, cw, ch, 10, bg, stroke, hover ? 1.8 : 1);

            const hasVisual = !!(card.img || card.skyCrop || card.diff);
            let textX = cx + 16;
            let textW = cw - 32;
            if (hasVisual) {
              const thumbH = ch - 20;
              const thumbW = thumbH;
              drawVisualBox(card, cx + 10, y + 10, thumbW, thumbH, 8);
              textX = cx + thumbW + 20;
              textW = cw - thumbW - 32;
            }

            let cy = y + 14;
            if (card.badge) {
              ctx.font = '700 12px "Space Mono", monospace';
              ctx.fillStyle = card.badgeColor || WARM;
              const badgeLines = wrapText(String(card.badge).toUpperCase(), textW).slice(0, 1);
              ctx.fillText(badgeLines[0] || '', textX, cy);
              cy += 18;
            }
            if (card.title) {
              ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
              ctx.fillStyle = '#ffffff';
              const titleLines = wrapText(card.title, textW).slice(0, 1);
              ctx.fillText(titleLines[0] || '', textX, cy);
              cy += 24;
            }
            if (card.text) {
              ctx.font = '400 16px "Plus Jakarta Sans", sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.68)';
              const maxLines = Math.max(1, Math.floor((y + ch - 10 - cy) / 20));
              const lines = wrapText(card.text, textW).slice(0, maxLines);
              for (const l of lines) {
                ctx.fillText(l, textX, cy);
                cy += 20;
              }
            }
            if (card.id) {
              state.hits.push({ id: card.id, cx, cy: y, cw, ch, kind: 'button', data: card.data });
            }
          }
          y += ch + gap;
        }
        y += 4 + itemGapBonus;
      } else if (item.type === 'spectrumStrip') {
        const stripH = 44;
        const n = 102;
        const barW = bodyW / n;
        for (let i = 0; i < n; i++) {
          const wl = 0.75 + (i / (n - 1)) * (5.0 - 0.75);
          ctx.fillStyle = bandColor(wl);
          ctx.fillRect(bodyX + i * barW, y, Math.ceil(barW), stripH);
        }
        drawRoundedRect(bodyX, y, bodyW, stripH, 6, null, 'rgba(255,255,255,0.25)', 1.2);
        y += stripH + 8;
        ctx.font = '500 16px "Space Mono", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.70)';
        const marks = ['0.75 µm (D1)', '1.63 µm (D2)', '2.42 µm (D3)', '3.82 µm (D4)', '4.42 µm (D5)', '5.00 µm (D6)'];
        marks.forEach((m, idx) => {
          const mx = bodyX + (idx / (marks.length - 1)) * (bodyW - 110);
          ctx.fillText(m, mx, y);
        });
        y += 28 + itemGapBonus;
      } else if (item.type === 'constellationDiagram') {
        const boxH = 210;
        drawConstellationMini(item.points, item.edges, bodyX, y, 230, boxH);
        const rx = bodyX + 250;
        let ry = y + 10;
        ctx.font = '700 13px "Space Mono", monospace';
        ctx.fillStyle = WARM;
        ctx.fillText('IAU CELESTIAL FIGURE', rx, ry);
        ry += 24;
        ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${item.starCount || 0} named stars · ${item.edgeCount || 0} lines`, rx, ry);
        ry += 28;
        if (item.coords) {
          ctx.font = '500 18px "Space Mono", monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.78)';
          ctx.fillText(item.coords, rx, ry);
          ry += 32;
        }
        if (item.audioId) {
          const bw = bodyW - 250;
          const bh = 52;
          const hover = state.hover === item.audioId;
          drawRoundedRect(rx, ry, bw, bh, 8, hover ? 'rgba(255,184,107,0.26)' : 'rgba(255,184,107,0.16)', WARM, 1.5);
          ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = WARM;
          ctx.textBaseline = 'middle';
          ctx.fillText(item.audioLabel || '▶ Play English Narration', rx + 20, ry + bh / 2);
          ctx.textBaseline = 'top';
          state.hits.push({ id: item.audioId, cx: rx, cy: ry, cw: bw, ch: bh, kind: 'button' });
        }
        y += boxH + 16 + itemGapBonus;
      } else if (item.type === 'chipList') {
        const chips = item.chips || [];
        let cx = bodyX;
        let cy = y;
        const ch = 40;
        ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
        chips.forEach((chip) => {
          const label = typeof chip === 'string' ? chip : chip.label;
          const id = typeof chip === 'object' ? chip.id : null;
          const tw = Math.ceil(ctx.measureText(label).width) + 30;
          if (cx + tw > bodyX + bodyW) {
            cx = bodyX;
            cy += ch + 8;
          }
          const hover = id && state.hover === id;
          drawRoundedRect(cx, cy, tw, ch, 8, hover ? 'rgba(255,184,107,0.20)' : 'rgba(255,255,255,0.06)', hover ? WARM : 'rgba(255,255,255,0.18)', 1.2);
          ctx.fillStyle = hover ? WARM : '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, cx + 15, cy + ch / 2);
          ctx.textBaseline = 'top';
          if (id) {
            state.hits.push({ id, cx, cy, cw: tw, ch, kind: 'button' });
          }
          cx += tw + 10;
        });
        y = cy + ch + 16 + itemGapBonus;
      } else if (item.type === 'slider') {
        ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(item.label, bodyX, y);
        const val = state.sliders[item.id]?.value ?? 0.5;
        ctx.textAlign = 'right';
        ctx.font = '600 18px "Space Mono", monospace';
        ctx.fillStyle = WARM;
        ctx.fillText(item.displayValue || Math.round(val * 100) + '%', bodyX + bodyW, y);
        ctx.textAlign = 'left';
        y += 30;
        const tx = bodyX, tw = bodyW, ty = y + 8, th = 10;
        drawRoundedRect(tx, ty, tw, th, 5, 'rgba(255,255,255,0.08)', null);
        drawRoundedRect(tx, ty, tw * val, th, 5, WARM, null);
        const kx = tx + tw * val, ky = ty + th / 2;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = WARM;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(kx, ky, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        state.hits.push({ id: item.id, cx: tx - 20, cy: ty - 20, cw: tw + 40, ch: th + 40, kind: 'slider' });
        y += 42 + itemGapBonus;
      } else if (item.type === 'listItem') {
        const hasVisual = !!(item.img || item.skyCrop);
        const bh = hasVisual ? 92 : 74;
        const bw = bodyW;
        const hover = state.hover === item.id;
        drawRoundedRect(
          bodyX,
          y,
          bw,
          bh,
          10,
          hover ? 'rgba(255,184,107,0.12)' : 'rgba(255,255,255,0.04)',
          hover ? WARM : 'rgba(255,255,255,0.14)',
          hover ? 1.8 : 1
        );
        let tx = bodyX + 18;
        if (hasVisual) {
          drawVisualBox(item, bodyX + 10, y + 8, 108, bh - 16, 8);
          tx = bodyX + 130;
        }
        ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(item.title, tx, y + (hasVisual ? 16 : 14));
        ctx.font = '400 16px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.68)';
        const subLines = wrapText(item.sub || '', bw - (tx - bodyX) - 18).slice(0, 2);
        subLines.forEach((line, li) => {
          ctx.fillText(line, tx, y + (hasVisual ? 44 : 42) + li * 20);
        });
        state.hits.push({ id: item.id, cx: bodyX, cy: y, cw: bw, ch: bh, kind: 'button', data: item.data });
        y += bh + 12 + itemGapBonus;
      }
    }

    const footerH = 36;
    const footerY = bodyY + bodyH - footerH - 4;
    if (y < footerY - 8) {
      drawRoundedRect(bodyX, footerY, bodyW, footerH, 8, 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.12)', 1);
      ctx.font = '600 13px "Space Mono", monospace';
      ctx.fillStyle = WARM;
      ctx.textBaseline = 'middle';
      ctx.fillText('◈ SPHEREx 360° VR HUD', bodyX + 16, footerY + footerH / 2);
      ctx.font = '500 13px "Space Mono", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'right';
      ctx.fillText('POINT & PINCH TO INTERACT', bodyX + bodyW - 16, footerY + footerH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }

    state.scrollMax = Math.max(0, (y + state.scrollY) - (bodyY + bodyH));
    ctx.restore();

    if (state.scrollMax > 0) {
      const sb = 4;
      const sbx = wPx - pad - 16;
      const sbh = bodyH;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(sbx, bodyY, sb, sbh);
      const thumbH = Math.max(40, sbh * (bodyH / (bodyH + state.scrollMax)));
      const thumbY = bodyY + (state.scrollY / state.scrollMax) * (sbh - thumbH);
      ctx.fillStyle = WARM;
      ctx.fillRect(sbx, thumbY, sb, thumbH);
    }
  }

  function render() {
    state.hits = [];
    clear();
    if (state.variant === 'header') {
      drawHeaderBar();
    } else {
      drawFrame();
      drawBody();
    }
    texture.needsUpdate = true;
    state.dirty = false;
  }

  render();

  return {
    mesh,
    get hits() { return state.hits; },
    get scrollMax() { return state.scrollMax; },
    get scrollY() { return state.scrollY; },
    get title() { return state.title; },
    get wPx() { return wPx; },
    get hPx() { return hPx; },
    get widthWorld() { return PANEL_WORLD * w; },
    get heightWorld() { return PANEL_WORLD * h; },
    setTitle(t) { state.title = t; state.dirty = true; },
    setBody(items) { state.body = items; state.scrollY = 0; state.dirty = true; },
    setActiveTab(tabId) { if (state.activeTab !== tabId) { state.activeTab = tabId; state.dirty = true; } },
    setSlider(id, info) { state.sliders[id] = { value: 0.5, ...info }; state.dirty = true; },
    getSlider(id) { return state.sliders[id]; },
    updateSlider(id, value) {
      const s = state.sliders[id];
      if (!s) return;
      const v = Math.max(0, Math.min(1, value));
      if (Math.abs(s.value - v) > 0.004) {
        s.value = v;
        state.dirty = true;
      }
    },
    setHover(id) {
      if (state.hover !== id) { state.hover = id; state.dirty = true; }
    },
    scroll(dy) {
      const newY = Math.max(0, Math.min(state.scrollMax, state.scrollY + dy));
      if (newY !== state.scrollY) { state.scrollY = newY; state.dirty = true; }
    },
    setScroll(y) {
      const newY = Math.max(0, Math.min(state.scrollMax, y));
      if (newY !== state.scrollY) { state.scrollY = newY; state.dirty = true; }
    },
    refresh() {
      if (state.dirty) render();
    },
    canvasToLocal(px, py) {
      const x = (px / wPx - 0.5) * (PANEL_WORLD * w);
      const y = (0.5 - py / hPx) * (PANEL_WORLD * h);
      return new THREE.Vector3(x, y, 0);
    },
    localToCanvas(local) {
      return {
        px: (local.x / (PANEL_WORLD * w) + 0.5) * wPx,
        py: (0.5 - local.y / (PANEL_WORLD * h)) * hPx,
      };
    },
    hitTest(local) {
      const { px, py } = this.localToCanvas(local);
      for (const h of state.hits) {
        if (px >= h.cx && px <= h.cx + h.cw && py >= h.cy && py <= h.cy + h.ch) return { ...h, px, py };
      }
      return null;
    },
    dispose() {
      DIRTY_LISTENERS.delete(markDirty);
      geom.dispose();
      mat.dispose();
      texture.dispose();
    },
  };
}
