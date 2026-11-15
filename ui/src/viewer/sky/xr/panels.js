import * as THREE from 'three';

// Holographic UI panel factory for VR. Each panel is a plane with a CanvasTexture: translucent cyan
// glow border, title bar, optional body text (scrollable) and a list of interactive hit regions
// (buttons / slider knobs). The panel exposes getHits() so the pinch raycaster can find them.

const CYAN = '#8fd3ff';
const CYAN_DIM = 'rgba(143,211,255,0.55)';
const WARM = '#ffb86b';
const INK = '#f4f7fc';
const SUB = '#c6d0e3';
const PANEL_BG = 'rgba(10,18,36,0.86)';

export const PANEL_PIX = 1024;                 // canvas resolution, long side
export const PANEL_WORLD = 0.75;               // world-space size (m), long side

// Images shown inside panels (target frames, spectra, story passes): loaded once, shared by every panel.
const imgCache = new Map();
function getImage(src, onLoad) {
  let e = imgCache.get(src);
  if (!e) {
    const img = new Image();
    e = { img, ok: false, failed: false, waiting: new Set() };
    img.onload = () => { e.ok = true; e.waiting.forEach((fn) => fn()); e.waiting.clear(); };
    img.onerror = () => { e.failed = true; e.waiting.forEach((fn) => fn()); e.waiting.clear(); };
    img.src = src;
    imgCache.set(src, e);
  }
  if (!e.ok && !e.failed) e.waiting.add(onLoad);
  return e;
}

export function createPanel({ w = 1, h = 1, title = '', interactive = true } = {}) {
  const wPx = Math.round(PANEL_PIX * w);
  const hPx = Math.round(PANEL_PIX * h);
  const canvas = document.createElement('canvas');
  canvas.width = wPx; canvas.height = hPx;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;

  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: true });
  const geom = new THREE.PlaneGeometry(PANEL_WORLD * w, PANEL_WORLD * h);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'xr-panel-' + title.replace(/\s+/g, '-').toLowerCase();

  // Data the raycaster + interaction loop need. Each hit is rendered inside the canvas
  // (cx,cy,cw,ch are canvas-local in CSS pixels); the panel converts to world coords in getHits().
  const state = {
    title,
    body: [],        // array of text lines or section headings
    scrollY: 0,
    scrollMax: 0,
    scrollTop: 0,    // last known pixel offset of the body region inside the canvas
    hits: [],        // { id, cx, cy, cw, ch, kind, data }  (kind: 'button' | 'slider')
    sliders: {},     // { id -> { value: 0..1, min, max } }
    buttons: {},     // { id -> { label, variant } }
    dirty: true,
    interactive,
    hover: null,     // id of currently hovered hit (for visual feedback)
  };

  function drawRoundedRect(x, y, w, h, r, fill, stroke, lineW = 2) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineW; ctx.stroke(); }
  }

  function clear() {
    ctx.clearRect(0, 0, wPx, hPx);
  }

  function drawFrame() {
    const pad = 18;
    // panel background
    ctx.save();
    drawRoundedRect(pad, pad, wPx - pad * 2, hPx - pad * 2, 32, PANEL_BG, null);
    // outer glow border
    ctx.shadowColor = CYAN; ctx.shadowBlur = 36;
    drawRoundedRect(pad, pad, wPx - pad * 2, hPx - pad * 2, 32, null, CYAN_DIM, 2);
    ctx.shadowBlur = 0;
    // corner brackets (Tony Stark style)
    const b = 50;
    ctx.strokeStyle = CYAN; ctx.lineWidth = 3;
    const corners = [
      [pad + 18, pad + 18, 1, 1], [wPx - pad - 18, pad + 18, -1, 1],
      [pad + 18, hPx - pad - 18, 1, -1], [wPx - pad - 18, hPx - pad - 18, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * b, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * b);
      ctx.stroke();
    }
    // title bar
    if (state.title) {
      ctx.font = '600 32px "Space Grotesk", "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = CYAN;
      ctx.textBaseline = 'middle';
      ctx.fillText(state.title.toUpperCase(), pad + 42, pad + 50);
      // underline
      ctx.strokeStyle = CYAN_DIM; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + 42, pad + 82);
      ctx.lineTo(wPx - pad - 42, pad + 82);
      ctx.stroke();
    }
    ctx.restore();
  }

  function fit(text, maxWidth) {
    let t = String(text);
    if (ctx.measureText(t).width <= maxWidth) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return t + '…';
  }

  function wrapText(text, maxWidth, lineH) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line); line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawBody() {
    const pad = 18;
    const bodyX = pad + 42;
    const bodyY = pad + 110;
    const bodyW = wPx - (pad + 42) * 2;
    const bodyH = hPx - bodyY - pad - 24;
    state.scrollTop = bodyY;

    // clip region
    ctx.save();
    ctx.beginPath();
    ctx.rect(bodyX - 10, bodyY, bodyW + 20, bodyH);
    ctx.clip();

    let y = bodyY - state.scrollY;
    const startY = y;
    ctx.textBaseline = 'top';

    for (const item of state.body) {
      if (item.type === 'heading') {
        ctx.font = '600 24px "Space Grotesk", sans-serif';
        ctx.fillStyle = CYAN;
        ctx.fillText(item.text.toUpperCase(), bodyX, y);
        y += 36;
      } else if (item.type === 'paragraph') {
        ctx.font = '400 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = INK;
        const lines = wrapText(item.text, bodyW, 32);
        for (const l of lines) { ctx.fillText(l, bodyX, y); y += 32; }
        y += 8;
      } else if (item.type === 'divider') {
        ctx.strokeStyle = 'rgba(143,211,255,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bodyX, y + 6); ctx.lineTo(bodyX + bodyW, y + 6); ctx.stroke();
        y += 20;
      } else if (item.type === 'kv') {
        ctx.font = '600 20px "Space Grotesk", sans-serif';
        ctx.fillStyle = SUB;
        ctx.fillText(item.k, bodyX, y);
        const kwidth = ctx.measureText(item.k).width;
        ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = INK;
        ctx.fillText(item.v, bodyX + kwidth + 16, y);
        y += 30;
      } else if (item.type === 'button') {
        const bh = 60, bw = Math.min(bodyW - 20, 480);
        const hover = state.hover === item.id;
        const variant = item.variant || 'secondary';
        const on = !!item.active;
        const bg = variant === 'primary' || on
          ? (hover ? 'rgba(143,211,255,0.30)' : on ? 'rgba(143,211,255,0.24)' : 'rgba(143,211,255,0.18)')
          : (hover ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)');
        const stroke = variant === 'primary' || on ? CYAN : 'rgba(255,255,255,0.22)';
        drawRoundedRect(bodyX, y, bw, bh, 14, bg, stroke, hover ? 3 : 2);
        ctx.font = '600 22px "Space Grotesk", sans-serif';
        ctx.fillStyle = INK;
        ctx.textBaseline = 'middle';
        ctx.fillText(fit(item.label, bw - 44), bodyX + 22, y + bh / 2);
        ctx.textBaseline = 'top';
        state.hits.push({ id: item.id, cx: bodyX, cy: y, cw: bw, ch: bh, kind: 'button' });
        y += bh + 14;
      } else if (item.type === 'slider') {
        ctx.font = '600 20px "Space Grotesk", sans-serif';
        ctx.fillStyle = SUB;
        ctx.fillText(item.label, bodyX, y);
        const val = state.sliders[item.id]?.value ?? 0.5;
        ctx.textAlign = 'right';
        ctx.fillStyle = CYAN;
        ctx.fillText(Math.round(val * 100) + '%', bodyX + bodyW, y);
        ctx.textAlign = 'left';
        y += 34;
        // track
        const tx = bodyX, tw = bodyW, ty = y + 10, th = 10;
        drawRoundedRect(tx, ty, tw, th, 5, 'rgba(255,255,255,0.08)', null);
        drawRoundedRect(tx, ty, tw * val, th, 5, CYAN, null);
        // knob
        const kx = tx + tw * val, ky = ty + th / 2;
        ctx.fillStyle = INK;
        ctx.shadowColor = CYAN; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(kx, ky, 16, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        // interactive hit covers the full track line (easy to grab)
        state.hits.push({ id: item.id, cx: tx - 20, cy: ty - 20, cw: tw + 40, ch: th + 40, kind: 'slider' });
        y += 44;
      } else if (item.type === 'note') {
        ctx.font = '400 18px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = SUB;
        for (const l of wrapText(item.text, bodyW, 26)) { ctx.fillText(l, bodyX, y); y += 26; }
        y += 8;
      } else if (item.type === 'buttons') {
        const n = item.buttons.length, gap = 12, bh = 60;
        const bw = (bodyW - gap * (n - 1)) / n;
        item.buttons.forEach((b, i) => {
          const bx = bodyX + i * (bw + gap);
          const hover = state.hover === b.id;
          const on = !!b.active || b.variant === 'primary';
          drawRoundedRect(bx, y, bw, bh, 14, on ? (hover ? 'rgba(143,211,255,0.30)' : 'rgba(143,211,255,0.18)') : (hover ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)'),
            on ? CYAN : 'rgba(255,255,255,0.22)', hover ? 3 : 2);
          ctx.font = '600 20px "Space Grotesk", sans-serif';
          ctx.fillStyle = INK;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.fillText(fit(b.label, bw - 16), bx + bw / 2, y + bh / 2);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          state.hits.push({ id: b.id, cx: bx, cy: y, cw: bw, ch: bh, kind: 'button' });
        });
        y += bh + 14;
      } else if (item.type === 'image') {
        const e = getImage(item.src, () => { state.dirty = true; });
        const ih = item.h || Math.round(bodyW * 0.62);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(bodyX, y, bodyW, ih);
        if (e.ok) {
          // fit inside the box, keeping the picture's shape
          const k = Math.min(bodyW / e.img.naturalWidth, ih / e.img.naturalHeight);
          const dw = e.img.naturalWidth * k, dh = e.img.naturalHeight * k;
          const dx = bodyX + (bodyW - dw) / 2, dy = y + (ih - dh) / 2;
          ctx.drawImage(e.img, dx, dy, dw, dh);
          if (item.marker) {
            const mx = dx + item.marker.x * dw, my = dy + item.marker.y * dh;
            ctx.strokeStyle = WARM; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(mx, my, 22, 0, Math.PI * 2); ctx.stroke();
          }
        } else {
          ctx.font = '400 20px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = SUB;
          ctx.textAlign = 'center';
          ctx.fillText(e.failed ? 'Image unavailable' : 'Loading image…', bodyX + bodyW / 2, y + ih / 2 - 10);
          ctx.textAlign = 'left';
        }
        y += ih;
        if (item.caption) {
          y += 8;
          ctx.font = '400 17px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = SUB;
          for (const l of wrapText(item.caption, bodyW, 24)) { ctx.fillText(l, bodyX, y); y += 24; }
        }
        y += 12;
      } else if (item.type === 'listItem') {
        const bh = 72, bw = bodyW;
        const hover = state.hover === item.id;
        drawRoundedRect(bodyX, y, bw, bh, 12, hover ? 'rgba(143,211,255,0.14)' : 'rgba(255,255,255,0.03)',
          hover ? CYAN : 'rgba(255,255,255,0.12)', hover ? 2 : 1);
        ctx.font = '600 22px "Space Grotesk", sans-serif';
        ctx.fillStyle = INK;
        ctx.fillText(fit(item.title, bw - 40), bodyX + 20, y + 12);
        ctx.font = '400 17px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = SUB;
        ctx.fillText(fit(item.sub || '', bw - 40), bodyX + 20, y + 42);
        state.hits.push({ id: item.id, cx: bodyX, cy: y, cw: bw, ch: bh, kind: 'button', data: item.data });
        y += bh + 10;
      }
    }

    state.scrollMax = Math.max(0, (y + state.scrollY) - (bodyY + bodyH));
    ctx.restore();

    // scrollbar hint
    if (state.scrollMax > 0) {
      const sb = 4;
      const sbx = wPx - pad - 18;
      const sbh = bodyH;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sbx, bodyY, sb, sbh);
      const thumbH = Math.max(40, sbh * (bodyH / (bodyH + state.scrollMax)));
      const thumbY = bodyY + (state.scrollY / state.scrollMax) * (sbh - thumbH);
      ctx.fillStyle = CYAN;
      ctx.fillRect(sbx, thumbY, sb, thumbH);
    }
  }

  function render() {
    state.hits = [];       // rebuild every frame (text position depends on scroll)
    clear();
    drawFrame();
    drawBody();
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
    setTitle(t) { if (state.title !== t) { state.title = t; state.dirty = true; } },
    setBody(items, keepScroll) { state.body = items; if (!keepScroll) state.scrollY = 0; state.dirty = true; },
    setSlider(id, info) { state.sliders[id] = { value: 0.5, ...info }; state.dirty = true; },
    getSlider(id) { return state.sliders[id]; },
    updateSlider(id, value) {
      const s = state.sliders[id]; if (!s) return;
      s.value = Math.max(0, Math.min(1, value));
      state.dirty = true;
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
    // Convert a canvas-local point (px, py) into a world-space point in the panel's local plane.
    // Used by the raycaster to compute initial pinch delta for sliders / scroll.
    canvasToLocal(px, py) {
      const x = (px / wPx - 0.5) * (PANEL_WORLD * w);
      const y = (0.5 - py / hPx) * (PANEL_WORLD * h);
      return new THREE.Vector3(x, y, 0);
    },
    // Given a THREE.Intersection point in local space, return canvas-px coordinates.
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
      geom.dispose(); mat.dispose(); texture.dispose();
    },
  };
}
