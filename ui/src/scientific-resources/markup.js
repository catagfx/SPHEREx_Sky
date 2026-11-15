// The panel's markup (FE 1 owns it; FE 2's index.js wires behaviour onto it). Pure DOM factories: no listeners,
// no global state, so FE 1 and FE 2 never edit the same file.

export const TRIGGER_ID = 'sr-trigger';
export const HOST_CLASS = 'sr-host';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Small decorative icon (an open book with a star): stroke = currentColor, hidden from screen readers. */
function icon(doc) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'sr-trigger-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  [
    'M3 5.5c2.6-1 5.4-1 8 .8v13c-2.6-1.8-5.4-1.8-8-.8z',  // left page
    'M21 5.5c-2.6-1-5.4-1-8 .8v13c2.6-1.8 5.4-1.8 8-.8z', // right page
    'M17 1.8l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z', // star
  ].forEach((d) => {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  });
  return svg;
}

/**
 * The single "Scientific Resources" entry point: a menu item that looks and behaves like its neighbours in the
 * header's Data menu (class dd-item: same style, and the menu closes when it is chosen). Singleton: if the
 * trigger already exists it is returned, so the page can never show two entry points.
 */
export function createTrigger(doc = document) {
  const existing = doc.getElementById(TRIGGER_ID);
  if (existing) return existing;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.id = TRIGGER_ID;
  btn.className = 'dd-item sr-trigger';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.title = 'Canadian Space Agency NEOSSat mission, archive, tutorial and dataset';
  const label = doc.createElement('span');
  label.className = 'sr-trigger-label';
  label.textContent = 'Scientific Resources';
  btn.append(icon(doc), label);
  return btn;
}

/**
 * The container the trigger lives in: an empty <div class="sr-host"> (outside any other button or link), with a
 * thin divider above it when it follows other menu items.
 */
export function createHost(doc = document) {
  const host = doc.createElement('div');
  host.className = HOST_CLASS;
  return host;
}

// ---------------------------------------------------------------------------------------------------------------
// FE1-3  the modal and its single card
//
// <div id="sr-modal" class="sr-root sr-overlay" hidden data-lenis-prevent>     full-screen backdrop
//   <div class="sr-dialog" role="dialog" aria-modal="true" aria-labelledby=…>   the centred glass box
//     <header class="sr-dialog-head">  eyebrow + title  |  close button
//     <div class="sr-stage">           exactly ONE <article class="sr-card"> at a time
//     <footer class="sr-nav">          Previous | "Resource 1 of 4" + dots | Next
//
// FE 2 opens it with the site's own openModal(modal, modal.querySelector('.sr-dialog')) (viewer/ui/modal.js:
// scroll lock, pager pause, Lenis stop, calm-mode aware entrance) and wires the buttons.
// Text is always set with textContent: nothing from resources.json is ever parsed as HTML.
// ---------------------------------------------------------------------------------------------------------------

export const MODAL_ID = 'sr-modal';
const TITLE_ID = 'sr-modal-title';

/** Visible label of each category badge. */
export const CATEGORY_LABELS = { MISSION: 'Mission', ARCHIVE: 'Archive', LEARNING: 'Learning', DATASET: 'Dataset' };

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Stroke icon (24-unit box), decorative. */
function strokeIcon(doc, className, paths, size = 18) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  paths.forEach((d) => {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  });
  return svg;
}

const ICON_CLOSE = ['M6 6l12 12', 'M18 6L6 18'];
const ICON_PREV = ['M15 6l-6 6 6 6'];
const ICON_NEXT = ['M9 6l6 6-6 6'];
const ICON_EXTERNAL = ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'];

/** Only https:// links are ever rendered (anything else in the data is dropped). */
export function safeUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * The modal shell (hidden). Singleton like the trigger. Returns the overlay; its parts are found by class:
 * .sr-dialog, .sr-close, .sr-stage, .sr-prev, .sr-next, .sr-position, .sr-dots.
 */
export function createModal(doc = document) {
  const existing = doc.getElementById(MODAL_ID);
  if (existing) return existing;

  const overlay = el(doc, 'div', 'sr-root sr-overlay');
  overlay.id = MODAL_ID;
  overlay.hidden = true;
  overlay.setAttribute('data-lenis-prevent', ''); // the page's smooth scroll must not swallow wheel events here

  const dialog = el(doc, 'div', 'sr-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  dialog.tabIndex = -1;

  const head = el(doc, 'header', 'sr-dialog-head');
  const headings = el(doc, 'div', 'sr-dialog-headings');
  const title = el(doc, 'h2', 'sr-title', 'Scientific Resources');
  title.id = TITLE_ID;
  headings.append(el(doc, 'p', 'sr-eyebrow', 'Canadian Space Agency · NEOSSat'), title);
  const close = el(doc, 'button', 'sr-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close Scientific Resources');
  close.setAttribute('aria-keyshortcuts', 'Escape'); // FE1-7: announced to screen readers
  close.title = 'Close (Esc)';                        // and shown on hover
  close.appendChild(strokeIcon(doc, 'sr-close-icon', ICON_CLOSE));
  head.append(headings, close);

  const stage = el(doc, 'div', 'sr-stage');

  const nav = el(doc, 'footer', 'sr-nav');
  const prev = el(doc, 'button', 'sr-nav-btn sr-prev');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous resource');
  prev.append(strokeIcon(doc, 'sr-nav-icon', ICON_PREV, 16), el(doc, 'span', 'sr-nav-label', 'Previous'));
  const next = el(doc, 'button', 'sr-nav-btn sr-next');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next resource');
  next.append(el(doc, 'span', 'sr-nav-label', 'Next'), strokeIcon(doc, 'sr-nav-icon', ICON_NEXT, 16));
  const middle = el(doc, 'div', 'sr-nav-middle');
  const position = el(doc, 'p', 'sr-meta sr-position');
  position.setAttribute('aria-live', 'polite');
  const dots = el(doc, 'div', 'sr-dots');
  dots.setAttribute('aria-hidden', 'true');
  middle.append(position, dots);
  nav.append(prev, middle, next);

  dialog.append(head, stage, nav);
  overlay.appendChild(dialog);
  return overlay;
}

/** One resource card (an <article>); `resource` follows the resources.json contract (sphere.md §5). */
export function createCard(resource, index, total, doc = document) {
  const category = String(resource.category || '').toUpperCase();
  const card = el(doc, 'article', 'sr-card');
  card.dataset.id = String(resource.id || '');
  card.dataset.category = category;
  card.setAttribute('aria-roledescription', 'resource');
  card.setAttribute('aria-label', `${index + 1} of ${total}: ${resource.title || ''}`);

  const top = el(doc, 'div', 'sr-card-top');
  const badge = el(doc, 'span', 'sr-badge', CATEGORY_LABELS[category] || category);
  badge.dataset.category = category;
  top.append(badge, el(doc, 'p', 'sr-meta sr-provider', resource.provider || ''));

  card.append(top, el(doc, 'h3', 'sr-card-title', resource.title || ''), el(doc, 'p', 'sr-summary', resource.summary || ''));

  // FE1-5: the short text above is all a card shows at first; the details wait behind "Learn more"
  const facts = (Array.isArray(resource.details) ? resource.details : []).map((d) => String(d).trim()).filter(Boolean);
  const actions = el(doc, 'div', 'sr-card-actions');

  const href = safeUrl(resource.url);
  if (href) {
    const link = el(doc, 'a', 'sr-cta');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(el(doc, 'span', '', 'Open official page'), strokeIcon(doc, 'sr-cta-icon', ICON_EXTERNAL, 16),
      el(doc, 'span', 'sr-visually-hidden', ' (opens in a new tab)'));
    actions.appendChild(link);
  }

  let details = null;
  if (facts.length) {
    const detailsId = `sr-details-${String(resource.id || index).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
    const more = el(doc, 'button', 'sr-more');
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', detailsId);
    // both labels share one spot (CSS shows the one that matches aria-expanded): the button keeps the width of
    // the longer one, so nothing moves when it toggles; the hidden label is not read out
    const labels = el(doc, 'span', 'sr-more-label');
    labels.append(el(doc, 'span', 'sr-more-closed', MORE_LABELS.closed), el(doc, 'span', 'sr-more-open', MORE_LABELS.open));
    more.append(labels, strokeIcon(doc, 'sr-more-icon', ICON_CHEVRON, 16));
    actions.appendChild(more);

    // below the buttons, so the button that was clicked never moves when the details open
    details = el(doc, 'div', 'sr-details');
    details.id = detailsId;
    details.hidden = true;
    const list = el(doc, 'ul', 'sr-details-list');
    facts.forEach((fact) => list.appendChild(el(doc, 'li', 'sr-text', fact)));
    details.appendChild(list);
  }

  if (actions.children.length) card.appendChild(actions);
  if (details) card.appendChild(details);
  return card;
}

const ICON_CHEVRON = ['M6 9l6 6 6-6'];
export const MORE_LABELS = { closed: 'Learn more', open: 'Show less' };

/**
 * Open (true) or close (false) a card's "Learn more" details; FE 2 calls it from the button's click. State only:
 * the details' `hidden` and the button's aria-expanded (CSS swaps the label and turns the chevron).
 * While open, the dialog is pinned where it is and grows downward, so the clicked button stays under the pointer
 * (a centred dialog would otherwise move up by half the new height); closing re-centres it exactly where it was.
 * Returns the new state (false if the card has no details).
 */
export function setDetailsExpanded(card, expanded) {
  const more = card.querySelector('.sr-more');
  const details = more && card.querySelector('.sr-details');
  if (!details) return false;
  const dialog = card.closest('.sr-dialog');
  if (dialog && expanded) anchorDialog(dialog);
  details.hidden = !expanded;
  more.setAttribute('aria-expanded', String(!!expanded));
  if (dialog && !expanded) releaseDialog(dialog);
  return !!expanded;
}

/** Pin the dialog at its current top (inside its overlay), so it grows downward only. */
function anchorDialog(dialog) {
  const overlay = dialog.parentElement;
  if (!overlay || dialog.classList.contains('sr-dialog--anchored')) return;
  const padTop = parseFloat(overlay.ownerDocument.defaultView.getComputedStyle(overlay).paddingTop) || 0;
  const top = dialog.getBoundingClientRect().top - overlay.getBoundingClientRect().top + overlay.scrollTop - padTop;
  dialog.style.setProperty('--sr-anchor-top', `${Math.max(0, top)}px`); // exact (often fractional): rounding moved it 1px
  dialog.classList.add('sr-dialog--anchored');
}

/** Back to the centred position. */
function releaseDialog(dialog) {
  dialog.classList.remove('sr-dialog--anchored');
  dialog.style.removeProperty('--sr-anchor-top');
}

/** Whether a card's details are open. */
export function isDetailsExpanded(card) {
  return card.querySelector('.sr-more')?.getAttribute('aria-expanded') === 'true';
}

/** Show resource `index` of `resources` in the modal: replaces the one card, updates position text and dots. */
export function renderCard(modal, resources, index) {
  const doc = modal.ownerDocument;
  const total = resources.length;
  releaseDialog(modal.querySelector('.sr-dialog')); // a new card starts closed, so the dialog is centred again
  modal.querySelector('.sr-stage').replaceChildren(createCard(resources[index], index, total, doc));
  modal.querySelector('.sr-position').textContent = `Resource ${index + 1} of ${total}`;
  modal.querySelector('.sr-dots').replaceChildren(...resources.map((_, i) => {
    const dot = el(doc, 'span', i === index ? 'sr-dot is-current' : 'sr-dot');
    return dot;
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// FE1-7  keyboard contract (FE 2 wires one keydown listener to keyAction and acts on the answer)
// ---------------------------------------------------------------------------------------------------------------

/**
 * What a key press means inside the open modal: 'close' (Escape), 'prev' (ArrowLeft), 'next' (ArrowRight) or
 * null. Ignored with Ctrl / Alt / Meta (browser and screen-reader shortcuts), during IME composition, when already
 * handled, and - for the arrows - while typing in a text field.
 */
export function keyAction(event) {
  if (!event || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === 'Escape' || event.key === 'Esc') return 'close';
  const t = event.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return null;
  if (event.key === 'ArrowLeft') return 'prev';
  if (event.key === 'ArrowRight') return 'next';
  return null;
}

/**
 * Where focus goes back after closing: the trigger if it can take focus, else - it lives in the header's Data
 * menu, which has closed by then - the Data menu's own button, so keyboard users land where they started.
 */
export function focusReturnTarget(trigger) {
  if (!trigger) return null;
  if (trigger.isConnected && trigger.checkVisibility?.()) return trigger;
  const menuButton = trigger.closest('.dd')?.querySelector(':scope > .dd-btn');
  return menuButton || null;
}
