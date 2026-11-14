import gsap from 'gsap';
import { $ } from '../dom';
import { prefersReducedMotion as reduce } from '../../core/env';
import { ABOUT } from '../../data';
import { zoomBack } from './camera';

// The small info card (#card) shown for a landmark, a tour stop, "About SPHEREx" or a sensor message.

const card = () => $('#card');

export function showCard(title, text) {
  const el = card();
  el.querySelector('h2').textContent = title;
  el.querySelector('p').textContent = text;
  el.hidden = false;
  if (!reduce) gsap.fromTo(el, { opacity: 0, scale: 0.92, y: 16 }, { opacity: 1, scale: 1, y: 0, duration: 0.32, ease: 'back.out(1.4)' });
}

/** Fade the card out, then ease the camera back out if it had zoomed in. */
export function hideCard() {
  const el = card();
  if (!reduce && !el.hidden) {
    gsap.to(el, {
      opacity: 0, scale: 0.94, y: 10, duration: 0.2, ease: 'power2.in',
      onComplete() { el.hidden = true; zoomBack(); },
    });
  } else {
    el.hidden = true;
    zoomBack();
  }
}

/** Hide at once, no camera move (a dialog is opening over it). */
export function hideCardNow() {
  card().hidden = true;
}

export function initCard() {
  $('#x').onclick = hideCard;
  $('#about').onclick = () => showCard(ABOUT[0], ABOUT[1]);
}
