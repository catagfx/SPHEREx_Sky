import { $ } from './dom';
import { getLenis } from '../core/smooth-scroll';
import { glideTo, topOf } from '../story/scroll';
import { closeModal, dialogOf } from './ui/modal';
import { showToast } from './ui/toast';
import { setActiveNav, closeDropdowns } from './ui/header';
import { setSpin } from './sky/view';
import { hideCard } from './sky/card';
import { openChange, closeChange } from './explorer';
import { closeGallery } from './panels/gallery';
import { isTourOn, endTour, toggleTour } from './panels/tour';

// The two views of the page and how to move between them:
//   story page (body.hero-mode): the Story Tour scrolls section by section over the sky
//   free-look (body.free-look-active): the story hides, the globe is yours (Explore ▸ Free-Look / Landmarks)
// plus the header shortcuts, the hero buttons, the brand (= home) and the Esc key.

export function setFreeLook(active, withLandmarks, navId) {
  const body = document.body;
  body.classList.toggle('free-look-active', active);
  body.classList.toggle('landmarks-active', active && !!withLandmarks);
  body.classList.toggle('hero-mode', !active);
  const banner = $('#freeLookBanner');
  if (banner) {
    banner.hidden = !active;
    const text = banner.querySelector('span:not(.live-dot)');
    if (text) text.textContent = withLandmarks ? '360° Celestial Observatory · 11 Landmarks Active' : '360° Free-Look Celestial Observatory';
  }
  if (active) getLenis()?.stop();
  else getLenis()?.start();
  setActiveNav(active ? (withLandmarks ? 'landmarks' : 'sky') : navId || 'story');
  setSpin(active); // free-look starts with a slow auto-orbit
}

/** Back on the story page, glide to a section (or the top) like the section pager does. */
function showStory(sectionId, navId) {
  setFreeLook(false, false, navId);
  setActiveNav(navId);
  getLenis()?.resize(); // the story was hidden in free-look: page height changed
  requestAnimationFrame(() => {
    const el = sectionId ? document.getElementById(sectionId) : null;
    if (sectionId && !el) return;
    glideTo(el ? topOf(el) : 0);
  });
}

function goHome() {
  if (isTourOn()) endTour();
  closeChange();
  if (!$('#gal').hidden) closeGallery();
  hideCard();
  showStory(null, 'story');
}

const freeLook = () => { setFreeLook(true, false); showToast('360° Free-Look Mode · Clean Sky View'); };

// Esc closes the topmost dialog (one per press), then dropdowns and the explorer.
const ESC_DIALOGS = [
  ['#how', () => closeModal($('#how'), $('#hw2'))],
  ['#gal', () => closeGallery()],
  ['#embedModal', () => closeModal($('#embedModal'), $('#modalBox'))],
  ...['#searchModal', '#releaseModal', '#anomalyModal', '#irsaModal'].map((sel) => [sel, () => closeModal($(sel), dialogOf($(sel)))]),
];

function onEscape(e) {
  if (e.key !== 'Escape') return;
  for (const [sel, close] of ESC_DIALOGS) {
    const el = $(sel);
    if (el && !el.hidden) {
      close();
      return;
    }
  }
  closeDropdowns();
  if (!$('#chg').hidden) closeChange();
}

export function initNavigation() {
  $('#home').onclick = goHome;
  $('#tabStory').onclick = () => showStory(null, 'story');
  $('#tabPlanetX').onclick = () => showStory('secPlanetX', 'planetx');
  $('#tabSky').onclick = freeLook;
  $('#tabLandmarks').onclick = () => { setFreeLook(true, true); showToast('11 Celestial Landmarks Active'); };
  $('#tabColors').onclick = () => openChange('C');
  $('#planetxMenuBtn').onclick = () => { closeDropdowns(); openChange('M', 'planetx'); };

  // hero buttons (story/Hero.tsx) and the free-look banner
  $('#btnExploreStory').onclick = () => showStory('secPlanetX', 'planetx');
  $('#btnFreeLook').onclick = freeLook;
  $('#h1').onclick = () => openChange('S');
  $('#h3').onclick = toggleTour;
  $('#btnResumeStory').onclick = () => setFreeLook(false);

  addEventListener('keydown', onEscape);
}
