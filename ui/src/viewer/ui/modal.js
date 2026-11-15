import gsap from 'gsap';
import { prefersReducedMotion as reduce } from '../../core/env';
import { getLenis } from '../../core/smooth-scroll';

// Every dialog (#chg, #gal, #how, #embedModal and the .glass-modal ones) opens and closes through these two.
// While one is open the page does not scroll: body.modal-open (also pauses the story pager) + Lenis stopped.

/**
 * A dialog never needs scrolling on a screen that is only a little too short: its box is scaled down (CSS zoom) until
 * it fits, like the story cards (story/useFitCard.ts). Phones (narrow screens) scroll instead. Re-fitted when the
 * window is resized and when the content of the box changes (a drawer opens, results appear, another mode renders).
 */
export function fitModalBox(box) {
  if (!box) return;
  box.style.zoom = '';
  box.style.maxHeight = '';
  if (window.innerWidth < 700) return;
  const avail = window.innerHeight - 54; // the overlay keeps 24px above and below the box
  const h = Math.max(box.scrollHeight, box.offsetHeight);
  if (h > avail + 1) {
    let z = Math.max(0.55, avail / h);
    box.style.zoom = z.toFixed(3);
    box.style.maxHeight = 'none'; // the box's own max-height would be scaled down too and make it scroll again
    // text can wrap differently once scaled: refine against what is really drawn
    for (let i = 0; i < 3; i++) {
      const drawn = box.getBoundingClientRect().height / (box._scale || 1);
      if (drawn <= avail + 1 || z <= 0.55) break;
      z = Math.max(0.55, z * (avail / drawn));
      box.style.zoom = z.toFixed(3);
    }
  }
}

let fitBox = null;
let fitObserver = null;
let fitRaf = 0;
const scheduleFit = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => fitModalBox(fitBox)); };
window.addEventListener('resize', () => { if (fitBox) scheduleFit(); });

function watchFit(box) {
  stopFit();
  if (!box) return;
  fitBox = box;
  fitObserver = new MutationObserver(scheduleFit);
  fitObserver.observe(box, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'open', 'class'] });
  scheduleFit();
}

function stopFit() {
  if (fitObserver) fitObserver.disconnect();
  fitObserver = null;
  if (fitBox) { fitBox.style.zoom = ''; fitBox.style.maxHeight = ''; }
  fitBox = null;
}

export function openModal(modalEl, innerEl) {
  if (!modalEl) return;
  modalEl.hidden = false;
  watchFit(innerEl || dialogOf(modalEl) || null);
  setTimeout(scheduleFit, 500); // once the opening animation is over, measure again
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
  stopFit();
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
