import * as THREE from 'three';
import { dir } from '../scene';
import { starMapPoints } from './content';

// 3-D star map: landmarks placed around the user at a comfortable radius with pinchable billboards.
// Each billboard is a small glowing dot + text label. The whole map belongs to a group that follows the
// user and tilts slightly up so the eye line is natural.

export function createStarMap({ onPick }) {
  const group = new THREE.Group();
  group.name = 'xr-star-map';
  const RADIUS = 2.0;              // metres around the user
  const points = starMapPoints();
  const picks = [];                // { id, mesh, data }

  // ambient sphere lines (a translucent dome so the user feels "inside a navigable chart")
  const domeMat = new THREE.LineBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.08 });
  const dome = new THREE.Group();
  for (let l = 0; l < 360; l += 30) {
    const pts = [];
    for (let b = -90; b <= 90; b += 10) pts.push(dir(l, b, RADIUS));
    dome.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), domeMat));
  }
  for (let b = -60; b <= 60; b += 30) {
    const pts = [];
    for (let l = 0; l <= 360; l += 10) pts.push(dir(l, b, RADIUS));
    dome.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), domeMat));
  }
  group.add(dome);

  // star glyphs
  const starGeom = new THREE.SphereGeometry(0.035, 16, 12);
  points.forEach((p) => {
    const position = dir(p.l, p.b, RADIUS);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const mesh = new THREE.Mesh(starGeom, mat);
    mesh.position.copy(position);
    mesh.userData = { pick: true, id: 'star:' + p.idx, data: p };
    group.add(mesh);

    // glow sprite
    const spriteMat = new THREE.SpriteMaterial({
      color: 0x8fd3ff, transparent: true, opacity: 0.6, depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.16, 0.16, 1);
    sprite.position.copy(position);
    group.add(sprite);

    // text label
    const label = textLabel(p.label);
    label.position.copy(position);
    label.position.y += 0.06;
    group.add(label);

    picks.push({ id: 'star:' + p.idx, mesh, data: p });
  });

  function textLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = '600 44px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(207,234,255,0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(text, 256, 64);
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.48, 0.12, 1);
    return sprite;
  }

  group.visible = false;

  return {
    group,
    get picks() { return picks; },
    show() { group.visible = true; },
    hide() { group.visible = false; },
    onPick,
    highlight(id) {
      picks.forEach((p) => {
        const on = p.id === id;
        p.mesh.material.color.setHex(on ? 0xffb86b : 0xffffff);
        p.mesh.scale.setScalar(on ? 1.6 : 1.0);
      });
    },
  };
}
