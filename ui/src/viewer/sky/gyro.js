import * as THREE from 'three';
import { $ } from '../dom';
import { showCard } from './card';
import { view } from './view';

// Tools ▸ "Motion / Gyro look" (phones / tablets): the device orientation drives the camera.

export const gyro = { on: false, a0: null, has: false, q: new THREE.Quaternion() };

const qOffset = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const qCamera = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // look out of the back of the device
const qScreen = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();

function onOrientation(e) {
  if (e.alpha == null || e.beta == null) return;
  const D = Math.PI / 180;
  const screenAngle = (screen.orientation ? screen.orientation.angle : window.orientation || 0) * D;
  if (gyro.a0 === null) gyro.a0 = e.alpha;
  euler.set(e.beta * D, (e.alpha - gyro.a0) * D, -e.gamma * D, 'YXZ');
  gyro.q.setFromEuler(euler);
  gyro.q.multiply(qCamera);
  gyro.q.multiply(qScreen.setFromAxisAngle(zAxis, -screenAngle));
  gyro.has = true;
}

export function gyroOff() {
  gyro.on = false;
  removeEventListener('deviceorientation', onOrientation);
  $('#gyro').setAttribute('aria-pressed', false);
}

function gyroOn() {
  gyro.on = true;
  gyro.a0 = null;
  gyro.has = false;
  view.spin = false;
  addEventListener('deviceorientation', onOrientation);
  $('#gyro').setAttribute('aria-pressed', true);
  setTimeout(() => {
    if (gyro.on && !gyro.has) {
      gyroOff();
      showCard('No motion sensor found', 'This device did not report motion data, so motion look is off. Dragging still works.');
    }
  }, 1800);
}

/** Points the camera with the device orientation; false when the gyro is not driving it. */
export function applyGyro(cam) {
  if (!gyro.on || !gyro.has) return false;
  cam.quaternion.copy(qOffset).multiply(gyro.q);
  return true;
}

export function initGyro() {
  if ('DeviceOrientationEvent' in window && (navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent))) {
    $('#gyro').hidden = false;
  }
  $('#gyro').onclick = () => {
    if (gyro.on) { gyroOff(); return; }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then((r) => {
          if (r === 'granted') gyroOn();
          else showCard('Motion access denied', 'Allow motion access in browser settings to look around by moving your phone.');
        })
        .catch(() => showCard('Motion look unavailable', 'This browser would not grant access to motion sensors.'));
    } else {
      gyroOn();
    }
  };
}
