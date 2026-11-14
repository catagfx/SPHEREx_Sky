import * as THREE from 'three';
import { $ } from '../dom';
import { LANDMARKS } from '../../data';
import { dir } from './scene';
import { fly } from './camera';
import { showCard } from './card';

// The 15 landmarks: floating labels projected onto the globe (#hs, only in Explore ▸ Landmarks) and the same
// list as a strip of buttons along the bottom (#bot). Each one flies the camera there and opens its card.

const buttons = [];
const projected = new THREE.Vector3();

export function initLandmarks() {
  LANDMARKS.forEach((h, i) => {
    const b = document.createElement('button');
    b.className = 'hp' + (i >= 6 ? ' me' : '') + (i === 1 ? ' lf' : '');
    b.innerHTML = '<i></i><span>' + h[0] + '</span>';
    b.onclick = () => { fly(h); showCard(h[3], h[4]); };
    $('#hs').appendChild(b);
    buttons.push(b);

    const chip = document.createElement('button');
    chip.className = 'b';
    chip.textContent = h[0];
    chip.onclick = b.onclick;
    $('#bot').appendChild(chip);
  });
}

/** Brief "target lock" pulse on a landmark's label when the camera flies to it. */
export function pulseLandmark(h) {
  const b = buttons[LANDMARKS.indexOf(h)];
  if (!b) return;
  b.classList.remove('hit');
  void b.offsetWidth; // restart the CSS animation
  b.classList.add('hit');
  setTimeout(() => b.classList.remove('hit'), 2700);
}

/** Every frame: place the labels over their sky positions (hidden unless body.landmarks-active). */
export function projectLandmarks(cam, inXR) {
  const visible = document.body.classList.contains('landmarks-active') && !inXR;
  LANDMARKS.forEach((h, i) => {
    const b = buttons[i];
    if (!visible) { b.style.display = 'none'; return; }
    projected.copy(dir(h[1], h[2], 400)).project(cam);
    if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) { b.style.display = 'none'; return; }
    b.style.display = 'flex';
    b.style.opacity = '1';
    const x = ((projected.x + 1) / 2) * innerWidth;
    const y = ((1 - projected.y) / 2) * innerHeight;
    b.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(' + (b.className.indexOf('lf') > -1 ? 'calc(-100% + 8px)' : '-8px') + ',-50%)';
  });
}
