import * as THREE from 'three';
import { dir } from '../scene';
import { starMapPoints, constellationPoints } from './content';

// Desktop-styled 3D Landmarks & Constellations overlays for VR.
// Matches the visual design of desktop `.hp` landmark pills and `.const-title-pill` constellation tags.
// Uses persistent per-pill CanvasTextures updated in-place (zero texture allocation or disposal during VR frame loop).

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawLandmarkPill(ctx, text, isWarm = false, isHovered = false) {
  ctx.clearRect(0, 0, 512, 112);
  let fontSize = 28;
  ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", -apple-system, sans-serif`;
  let textW = Math.ceil(ctx.measureText(text).width);
  if (textW > 380) {
    fontSize = Math.max(19, Math.floor(fontSize * (380 / textW)));
    ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", -apple-system, sans-serif`;
    textW = Math.ceil(ctx.measureText(text).width);
  }
  const pillW = Math.min(500, Math.max(200, textW + 80));
  const pillH = 68;
  const px = (512 - pillW) / 2;
  const py = (112 - pillH) / 2;

  const accent = '#ffb86b';
  const border = isHovered ? accent : (isWarm ? 'rgba(255,184,107,0.45)' : 'rgba(255,255,255,0.20)');
  const bg = isHovered ? 'rgba(28, 20, 12, 0.95)' : 'rgba(10, 16, 30, 0.90)';

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = isHovered ? 16 : 8;
  roundRect(ctx, px, py, pillW, pillH, 10);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = isHovered ? 2 : 1.2;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Glowing dot on the left (matches desktop .hp > i)
  const dotX = px + 28;
  const dotY = 56;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 6.5, 0, Math.PI * 2);
  ctx.fill();

  // Crisp label text
  ctx.fillStyle = isHovered ? accent : '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px + 46, dotY);
  ctx.restore();
}

function drawConstellationPill(ctx, text, state = 'normal') {
  ctx.clearRect(0, 0, 512, 104);
  ctx.font = '600 28px "Plus Jakarta Sans", -apple-system, sans-serif';
  const textW = Math.min(410, Math.ceil(ctx.measureText(text).width));
  const pillW = Math.max(190, textW + 64);
  const pillH = 64;
  const px = (512 - pillW) / 2;
  const py = (104 - pillH) / 2;

  const isSelected = state === 'selected';
  const isHover = state === 'hover';
  const accent = '#ffb86b';
  const bg = isSelected
    ? 'rgba(36, 24, 12, 0.96)'
    : isHover
      ? 'rgba(28, 20, 12, 0.92)'
      : 'rgba(10, 16, 30, 0.88)';
  const border = isSelected || isHover ? accent : 'rgba(255,255,255,0.20)';

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = isSelected || isHover ? 18 : 6;
  roundRect(ctx, px, py, pillW, pillH, 10);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = isSelected || isHover ? 2.2 : 1.2;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = isSelected || isHover ? accent : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52);
  ctx.restore();
}

export function createStarMap({ onPick }) {
  const group = new THREE.Group();
  group.name = 'xr-star-map';
  const RADIUS = 2.15;             // metres around the user
  const points = starMapPoints();
  const picks = [];

  const hitGeom = new THREE.PlaneGeometry(0.46, 0.12);
  const ringGeom = new THREE.RingGeometry(0.018, 0.028, 24);

  points.forEach((p, idx) => {
    const isWarm = idx >= 6;       // matches desktop `i >= 6 ? ' me' : ''` in landmarks.js
    const position = dir(p.l, p.b, RADIUS);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    drawLandmarkPill(ctx, p.pillLabel || p.label, isWarm, false);
    const tex = new THREE.CanvasTexture(canvas);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(hitGeom, mat);
    mesh.position.copy(position);
    mesh.lookAt(0, 0, 0);
    mesh.renderOrder = 2;
    mesh.userData = { pick: true, kind: 'landmark', id: 'star:' + p.idx, data: p, isWarm };
    group.add(mesh);

    const ringMat = new THREE.MeshBasicMaterial({
      color: isWarm ? 0xffb86b : 0x8fd3ff,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.copy(dir(p.l, p.b, RADIUS + 0.01));
    ring.lookAt(0, 0, 0);
    ring.renderOrder = 2;
    group.add(ring);

    picks.push({ id: 'star:' + p.idx, mesh, ring, ctx, tex, data: p, isWarm, hovered: false });
  });

  group.visible = false;

  return {
    group,
    get picks() { return picks; },
    show() { group.visible = true; },
    hide() { group.visible = false; },
    onPick,
    highlight(id, selectedId = null) {
      picks.forEach((p) => {
        if (selectedId && p.id === selectedId) {
          p.mesh.visible = true;
          p.ring.visible = true;
          drawLandmarkPill(p.ctx, p.data.pillLabel || p.data.label, p.isWarm, true);
          p.tex.needsUpdate = true;
          p.mesh.scale.setScalar(1.2);
          p.ring.scale.setScalar(1.4);
        } else if (selectedId && p.id !== selectedId) {
          p.mesh.visible = false;
          p.ring.visible = false;
        } else {
          p.mesh.visible = true;
          p.ring.visible = true;
          const on = p.id === id;
          if (p.hovered !== on) {
            p.hovered = on;
            drawLandmarkPill(p.ctx, p.data.pillLabel || p.data.label, p.isWarm, on);
            p.tex.needsUpdate = true;
            p.mesh.scale.setScalar(on ? 1.14 : 1.0);
            p.ring.scale.setScalar(on ? 1.35 : 1.0);
          }
        }
      });
    },
  };
}

export function createConstellationTagsVR() {
  const group = new THREE.Group();
  group.name = 'xr-constellation-tags';
  const RADIUS = 2.25;
  const defs = constellationPoints();
  const picks = [];
  const pillGeom = new THREE.PlaneGeometry(0.44, 0.095);

  defs.forEach((c, idx) => {
    const position = dir(c.l, c.b, RADIUS);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 104;
    const ctx = canvas.getContext('2d');
    drawConstellationPill(ctx, c.name, 'normal');
    const tex = new THREE.CanvasTexture(canvas);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(pillGeom, mat);
    mesh.position.copy(position);
    mesh.lookAt(0, 0, 0);
    mesh.renderOrder = 2;
    mesh.userData = { pick: true, kind: 'constellation', id: 'const:' + idx, data: c };
    group.add(mesh);

    picks.push({ id: 'const:' + idx, idx, mesh, ctx, tex, data: c, state: 'normal' });
  });

  group.visible = false;

  function setTagState(p, nextState) {
    if (p.state === nextState) return;
    p.state = nextState;
    drawConstellationPill(p.ctx, p.data.name, nextState);
    p.tex.needsUpdate = true;
    p.mesh.scale.setScalar(nextState === 'selected' ? 1.2 : nextState === 'hover' ? 1.12 : 1.0);
  }

  return {
    group,
    get picks() { return picks; },
    show() { group.visible = true; },
    hide() { group.visible = false; },
    updateFlutter(time) {
      const t = typeof time === 'number' ? time : performance.now() * 0.001;
      const p = picks.find((item) => item.state === 'selected');
      if (p) {
        const flutter = 0.06 * Math.sin(t * 5.5);
        p.mesh.scale.setScalar(1.22 + flutter);
      }
    },
    highlight(id, selectedId = null) {
      picks.forEach((p) => {
        if (selectedId && p.id === selectedId) {
          p.mesh.visible = true;
          setTagState(p, 'selected');
        } else if (selectedId && p.id !== selectedId) {
          p.mesh.visible = false;
        } else {
          p.mesh.visible = true;
          setTagState(p, p.id === id ? 'hover' : 'normal');
        }
      });
    },
  };
}
