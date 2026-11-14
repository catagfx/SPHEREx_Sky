import { $ } from '../dom';

// Small confirmation message at the bottom of the screen (#toast).
let hideTimer = null;

export function showToast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
