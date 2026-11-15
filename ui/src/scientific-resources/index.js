// Scientific Resources (CSA / NEOSSat): mounts the panel into the page and gives it its behaviour.
// FE 2 owns this file; the look and the DOM come from FE 1 (markup.js, scientific-resources.css via styles.js),
// the content from scientific_resources.json at the project root (BE 1 / BE 2) through content.js: live from the
// backend's /api/scientific-resources when it runs, else the same file bundled by Vite (works with no backend).
//
//   initScientificResources()                 auto: #scientific-resources-host if the page has one, else a host
//                                             created as the last entry of the header's Data menu
//   mountScientificResources({ container })   the sphere.md API: mount into a given (empty) host element
//   unmountScientificResources()              remove everything again (listeners included)
//
// Behaviour (sphere.md §4 item 3): open / close (entry point; close button, Esc, backdrop), Previous / Next and
// Left / Right (cycling through all records), touch swipe, focus trap, "Learn more", the https link in a new tab.
import { ensureStyles } from './styles.js';
import {
  createHost, createTrigger, createModal, renderCard, keyAction, focusReturnTarget, setDetailsExpanded, isDetailsExpanded,
} from './markup.js';
import gsap from 'gsap';
import { openModal, closeModal } from '../viewer/ui/modal.js';
import { getLenis } from '../core/smooth-scroll';
import { bundledCards, fetchCards, toCards } from './content.js';

const HOST_ID = 'scientific-resources-host';
// a swipe = a mostly horizontal touch move of at least SWIPE_MIN px (vertical moves keep scrolling the modal)
const SWIPE_MIN = 50;
const SWIPE_RATIO = 1.5;
const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
let instance = null;

/** Cards the panel can show (content.js: either schema; no id / title / https url = skipped, with a warning). */
function usable(data) {
  const cards = toCards(data);
  const total = Array.isArray(data) ? data.length : Array.isArray(data?.resources) ? data.resources : 0;
  if (cards.length !== total) console.warn('Scientific Resources: some records were skipped (need id, title, https url).');
  return cards;
}

/**
 * Mount the panel into `container` (an empty element outside any button / link). Mounting again into the same
 * live container returns the same instance; into another container, the old instance is removed first.
 * Without `data` it shows the bundled scientific_resources.json at once and then asks the backend for the live
 * copy (`live: false` skips that); with `data` (either schema) it shows exactly that.
 */
export function mountScientificResources({ container, data, live = data === undefined } = {}) {
  if (!container) throw new Error('mountScientificResources: a container element is required');
  if (instance) {
    if (instance.container === container && container.isConnected) return instance;
    instance.destroy();
  }
  const doc = container.ownerDocument;
  let items = data === undefined ? bundledCards() : usable(data);
  if (!items.length) return null;
  let source = data === undefined ? 'bundled' : 'given';

  ensureStyles(doc);
  container.classList.add('sr-host');
  const trigger = createTrigger(doc);
  container.appendChild(trigger);
  const modal = createModal(doc);
  doc.body.appendChild(modal); // on <body>: independent of the sky, the story and every image
  const dialog = modal.querySelector('.sr-dialog');
  const stage = modal.querySelector('.sr-stage');
  let index = 0;
  // our own state: in full motion closeModal() fades out for ~0.2s before it sets `hidden`, and the panel must
  // already count as closed then (focus goes back to the page, keys go back to the site)
  let opened = false;

  const isOpen = () => opened;
  const visibleFocusables = () => [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);

  /** Show record n (wraps around: after the last comes the first). Keeps focus inside the dialog. */
  function show(n) {
    const hadFocusInCard = stage.contains(doc.activeElement);
    index = ((n % items.length) + items.length) % items.length;
    renderCard(modal, items, index);
    // the focused link / button may have left with the old card: never let focus fall back to <body>
    if (isOpen() && (hadFocusInCard || !modal.contains(doc.activeElement))) dialog.focus();
  }
  const next = () => show(index + 1);
  const prev = () => show(index - 1);

  function open() {
    if (isOpen()) return;
    // re-opened while the closing fade still runs: stop it, or its end would hide the modal again
    gsap.killTweensOf([modal, dialog]);
    show(0);
    opened = true;
    openModal(modal, dialog); // the site's dialog opening: scroll lock, pager pause, calm-mode-aware entrance
    trigger.setAttribute('aria-expanded', 'true');
    dialog.focus();
  }
  function close() {
    if (!isOpen()) return;
    opened = false;
    trigger.setAttribute('aria-expanded', 'false');
    closeModal(modal, dialog);
    focusReturnTarget(trigger)?.focus();
  }

  // ---- buttons, "Learn more", backdrop: one delegated click handler ----
  let pressedOnBackdrop = false;
  const onPointerDownModal = (e) => { pressedOnBackdrop = e.target === modal; };
  const onClick = (e) => {
    if (e.target === modal) {
      // only a click that also STARTED on the backdrop closes (a text selection dragged out of the dialog does not)
      if (pressedOnBackdrop) close();
      pressedOnBackdrop = false;
      return;
    }
    pressedOnBackdrop = false;
    const t = e.target.closest('button');
    if (!t || !modal.contains(t)) return;
    if (t.classList.contains('sr-close')) close();
    else if (t.classList.contains('sr-next')) next();
    else if (t.classList.contains('sr-prev')) prev();
    else if (t.classList.contains('sr-more')) {
      const card = t.closest('.sr-card');
      setDetailsExpanded(card, !isDetailsExpanded(card));
    }
  };
  const onTrigger = () => open();

  // ---- keys: on document, before the site's window-level handlers (navigation Esc, globe arrows) ----
  const onKey = (e) => {
    if (!isOpen()) return;
    if (e.key === 'Tab') return trapTab(e);
    const action = keyAction(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (action === 'close') close();
    else if (action === 'next') next();
    else prev();
  };
  // focus trap: Tab / Shift+Tab cycle through the dialog's controls
  function trapTab(e) {
    const list = visibleFocusables();
    if (!list.length) { e.preventDefault(); dialog.focus(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    const active = doc.activeElement;
    if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !dialog.contains(active))) { e.preventDefault(); first.focus(); }
  }
  // anything that still moves focus outside (a click on the page through a screen reader, etc.) is pulled back
  const onFocusIn = (e) => {
    if (isOpen() && !modal.contains(e.target)) dialog.focus();
  };

  // ---- touch swipe on the card area ----
  let swipe = null;
  const onPointerDown = (e) => {
    swipe = e.pointerType === 'mouse' || !e.isPrimary ? null : { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO) {
      if (dx < 0) next(); else prev();
    }
  };
  const onPointerCancel = () => { swipe = null; };

  trigger.addEventListener('click', onTrigger);
  modal.addEventListener('pointerdown', onPointerDownModal);
  modal.addEventListener('click', onClick);
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerCancel);
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('focusin', onFocusIn);

  // ---- routing (FE-2 STEP 5): the site routes by hash (viewer/routes.js opens the explorer / IRSA studio).
  // A route change (back button, share link) closes the panel FIRST - capture phase, before the site's own
  // hashchange handler - so the next dialog opens on a clean page and keeps its own scroll lock ----
  const win = doc.defaultView;
  const onRoute = () => close();
  win.addEventListener('hashchange', onRoute, true);
  win.addEventListener('popstate', onRoute, true);

  // ---- the host leaves the page (a re-render, a router replacing the header): clean up everything ----
  const hostWatch = new MutationObserver(() => {
    if (!container.isConnected && instance && instance.container === container) instance.destroy();
  });
  hostWatch.observe(doc.documentElement, { childList: true, subtree: true });

  const self = {
    container, trigger, modal, open, close, isOpen, next, prev, show,
    get index() { return index; },
    get items() { return items; },
    /** where the cards came from: 'bundled' (the built-in copy), 'api' (the backend's live copy) or 'given' */
    get source() { return source; },
    /** settles once the backend has answered (or not); resolves to the source in use afterwards */
    ready: null,
    destroy() {
      trigger.removeEventListener('click', onTrigger);
      modal.removeEventListener('pointerdown', onPointerDownModal);
      modal.removeEventListener('click', onClick);
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerCancel);
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('focusin', onFocusIn);
      win.removeEventListener('hashchange', onRoute, true);
      win.removeEventListener('popstate', onRoute, true);
      hostWatch.disconnect();
      gsap.killTweensOf([modal, dialog]);
      if (isOpen()) {
        // removed while open: undo what openModal() did, or the page would stay locked
        opened = false;
        doc.body.classList.remove('modal-open');
        if (!doc.body.classList.contains('free-look-active')) getLenis()?.start();
      }
      trigger.remove();
      modal.remove();
      container.classList.remove('sr-host');
      if (container.dataset.srCreated === 'true') container.remove();
      if (instance && instance.container === container) instance = null;
    },
  };
  instance = self;

  // the backend's live copy (python server.py / npm run dev): replaces the bundled cards when it differs, also in
  // an open modal (same position, clamped). No backend = the bundled cards stay; nothing waits for this.
  self.ready = !live ? Promise.resolve(source) : fetchCards().then((cards) => {
    if (!cards || instance !== self) return source;
    source = 'api';
    if (JSON.stringify(cards) !== JSON.stringify(items)) {
      items = cards;
      index = Math.min(index, items.length - 1);
      if (isOpen()) show(index);
    }
    return source;
  });
  return self;
}

/** Remove the panel and stop the auto-mount watching (it stays unmounted until initScientificResources()). */
export function unmountScientificResources() {
  stopAutoMount();
  instance?.destroy();
}

let autoWatch = null;
function stopAutoMount() {
  autoWatch?.disconnect();
  autoWatch = null;
}

/** Mount into #scientific-resources-host, or into a host created in the Data menu; null when neither exists. */
function mountWhereAvailable(doc) {
  let host = doc.getElementById(HOST_ID);
  if (!host) {
    const menu = doc.getElementById('releaseMenuBtn')?.closest('.dd-menu');
    if (!menu) return null; // no header on this page (yet): nothing to attach to
    host = createHost(doc);
    host.id = HOST_ID;
    host.dataset.srCreated = 'true';
    menu.appendChild(host);
  }
  return mountScientificResources({ container: host });
}

/**
 * Auto-configuration: no index.html change needed. Uses #scientific-resources-host when the page provides one,
 * otherwise creates the host as the last entry of the header's Data menu (the team's choice, FE-1 STEP 2).
 * It mounts ONLY when such a host exists, and keeps watching: if the host is removed (re-render, router), the
 * instance cleans itself up, and the panel mounts again once a host / the Data menu is back.
 * Never throws: a problem here must not stop the rest of the viewer.
 */
export function initScientificResources(doc = document) {
  try {
    const mounted = mountWhereAvailable(doc);
    if (!autoWatch) {
      let queued = false;
      autoWatch = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        // once per batch of DOM changes, after the instance's own host watch has run
        queueMicrotask(() => {
          queued = false;
          if (!instance || !instance.container.isConnected) {
            try { mountWhereAvailable(doc); } catch (err) { console.warn('Scientific Resources could not re-mount:', err); }
          }
        });
      });
      autoWatch.observe(doc.documentElement, { childList: true, subtree: true });
    }
    return mounted;
  } catch (err) {
    console.warn('Scientific Resources could not start:', err);
    return null;
  }
}
