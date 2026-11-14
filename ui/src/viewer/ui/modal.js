import gsap from 'gsap';
import { prefersReducedMotion as reduce } from '../../core/env';
import { getLenis } from '../../core/smooth-scroll';

// Every dialog (#chg, #gal, #how, #embedModal and the .glass-modal ones) opens and closes through these two.
// While one is open the page does not scroll: body.modal-open (also pauses the story pager) + Lenis stopped.

export function openModal(modalEl, innerEl) {
  if (!modalEl) return;
  modalEl.hidden = false;
  document.body.classList.add('modal-open');
  getLenis()?.stop();
  if (reduce) return;
  gsap.fromTo(modalEl, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: 'power2.out' });
  if (innerEl) {
    gsap.fromTo(innerEl, { opacity: 0, y: 22, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.36, ease: 'power3.out' });
  }
}

export function closeModal(modalEl, innerEl, callback) {
  if (!modalEl) return;
  document.body.classList.remove('modal-open');
  if (!document.body.classList.contains('free-look-active')) getLenis()?.start();
  if (!reduce && innerEl) {
    gsap.to(innerEl, { opacity: 0, y: 14, scale: 0.97, duration: 0.2, ease: 'power2.in' });
    gsap.to(modalEl, {
      opacity: 0,
      duration: 0.22,
      ease: 'power2.in',
      onComplete() {
        modalEl.hidden = true;
        if (callback) callback();
      },
    });
  } else {
    modalEl.hidden = true;
    if (callback) callback();
  }
}

/** The .glass-modal dialogs share one inner box class. */
export const dialogOf = (modalEl) => modalEl && modalEl.querySelector('.modal-dialog');
