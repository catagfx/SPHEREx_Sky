import gsap from 'gsap';
import { $, $$ } from '../dom';
import { prefersReducedMotion as reduce } from '../../core/env';

// Header: the five category dropdowns (Explore, Science, Data, Share, Tools), the highlight of the active view,
// and the glowing scroll-progress line (its star markers are added by story/ProgressNav.tsx).

let activeNav = 'story';
let savedNav = null;

/** Highlight the header item whose data-nav matches (story, sky, landmarks, tour, planetx, change, colors, gallery). */
export function setActiveNav(id) {
  activeNav = id;
  $$('.nav-tab').forEach((tab) => tab.classList.toggle('active', tab.getAttribute('data-nav') === id));
}

/** A dialog takes the highlight while it is open; restoreNav() gives it back to the view underneath. */
export function borrowNav(id) {
  if (savedNav === null) savedNav = activeNav;
  setActiveNav(id);
}

export function restoreNav() {
  if (savedNav === null) return;
  const id = savedNav;
  savedNav = null;
  setActiveNav(id);
}

/** Close every open dropdown except `except`. */
export function closeDropdowns(except) {
  $$('.dd-menu').forEach((menu) => {
    if (menu === except || menu.hidden) return;
    menu.hidden = true;
    const btn = menu.parentNode.querySelector('.dd-btn');
    if (btn) btn.setAttribute('aria-expanded', false);
  });
}

function initDropdowns() {
  $$('.dd > .dd-btn').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const menu = btn.parentNode.querySelector('.dd-menu');
      if (!menu) return;
      closeDropdowns(menu);
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', !menu.hidden);
      if (!menu.hidden && !reduce) {
        gsap.fromTo(menu, { opacity: 0, y: -8, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: 'power2.out' });
      }
    };
  });
  // menus marked data-autoclose close once an item is chosen (Tools stays open: its items are toggles)
  $$('.dd-menu[data-autoclose]').forEach((menu) => {
    menu.addEventListener('click', (e) => {
      if (e.target.closest('.dd-item')) closeDropdowns();
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dd')) closeDropdowns();
  });
}

// The line glides to each new position instead of jumping (in calm mode the page itself jumps section to
// section, so the line is what shows the travel).
function initScrollProgress() {
  const fill = $('#spFill');
  if (!fill) return;
  const update = () => {
    const d = document.documentElement;
    const max = Math.max(1, d.scrollHeight - window.innerHeight);
    const pct = Math.min(1, Math.max(0, (window.scrollY || d.scrollTop || 0) / max));
    gsap.to(fill, { width: (pct * 100).toFixed(2) + '%', duration: reduce ? 0.9 : 0.5, ease: 'power2.out', overwrite: true });
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}

export function initHeader() {
  initDropdowns();
  initScrollProgress();
}
