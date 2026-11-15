import gsap from 'gsap';
import { prefersReducedMotion as reduce } from '../../core/env';

// A <select> dressed like the header's dropdowns: a button-shaped box with a chevron that turns when it opens and
// closes, and a list that fades in / out. The native <select> stays in the page (hidden), so every reader of
// select.value keeps working; setting select.value from code updates the box too.

let openOne = null;

function closeOpen() {
  if (openOne) openOne();
}

export function enhanceSelect(select) {
  if (!select || select.dataset.enhanced) return;
  select.dataset.enhanced = '1';

  const wrap = document.createElement('div');
  wrap.className = 'sel-dd';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.add('sel-native');
  select.tabIndex = -1;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sel-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  // the button is named by the field's own label (or the select's aria-label / title)
  const lab = select.labels && select.labels[0];
  if (lab) { if (!lab.id) lab.id = 'sel-l-' + Math.random().toString(36).slice(2, 8); btn.setAttribute('aria-labelledby', lab.id); }
  else if (select.getAttribute('aria-label')) btn.setAttribute('aria-label', select.getAttribute('aria-label'));
  else if (select.title) btn.setAttribute('aria-label', select.title);
  btn.innerHTML = '<span class="sel-label"></span><svg class="sel-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  const label = btn.querySelector('.sel-label');

  const menu = document.createElement('div');
  menu.className = 'sel-menu';
  menu.setAttribute('role', 'listbox');
  menu.id = 'sel-m-' + Math.random().toString(36).slice(2, 8);
  btn.setAttribute('aria-controls', menu.id);
  if (btn.getAttribute('aria-labelledby')) menu.setAttribute('aria-labelledby', btn.getAttribute('aria-labelledby'));
  menu.hidden = true;

  let items = [];
  // the list is built from the current <option>s each time it opens (some selects are filled later by other code)
  function buildItems() {
    menu.innerHTML = '';
    items = Array.from(select.options).map((o) => {
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'sel-item';
      it.setAttribute('role', 'option');
      it.tabIndex = -1;
      it.dataset.value = o.value;
      it.textContent = o.textContent;
      it.onclick = (e) => {
        e.stopPropagation();
        setNative(o.value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close(true);
      };
      menu.appendChild(it);
      return it;
    });
    refresh();
  }

  wrap.appendChild(btn);
  wrap.appendChild(menu);

  // select.value = x from code (presets) refreshes the box
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const setNative = (v) => { proto.set.call(select, v); refresh(); };
  Object.defineProperty(select, 'value', { get() { return proto.get.call(this); }, set(v) { setNative(v); }, configurable: true });

  function refresh() {
    const cur = select.options[select.selectedIndex];
    label.textContent = cur ? cur.textContent : '';
    items.forEach((it) => {
      const on = it.dataset.value === proto.get.call(select);
      it.classList.toggle('is-selected', on);
      it.setAttribute('aria-selected', String(on));
    });
  }

  function open(focusItem) {
    closeOpen();
    buildItems();
    menu.hidden = false;
    // fixed position: the dialog scrolls / clips its content, the list must not be cut off by it
    const r = btn.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    const up = below < 180 && above > below;
    document.body.appendChild(menu);          // out of the dialog: it must neither clip nor offset the list
    menu.style.position = 'fixed';
    menu.style.right = 'auto';
    menu.style.left = r.left + 'px';
    menu.style.width = r.width + 'px';
    menu.style.maxHeight = Math.max(120, Math.min(260, up ? above : below)) + 'px';
    if (up) { menu.style.top = 'auto'; menu.style.bottom = (window.innerHeight - r.top + 6) + 'px'; }
    else { menu.style.bottom = 'auto'; menu.style.top = (r.bottom + 6) + 'px'; }
    btn.setAttribute('aria-expanded', 'true');
    wrap.classList.add('is-open');
    if (!reduce) gsap.fromTo(menu, { opacity: 0, y: -8, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: 'power2.out' });
    openOne = close;
    if (focusItem) { const cur = items.find((i) => i.classList.contains('is-selected')) || items[0]; if (cur) cur.focus({ preventScroll: true }); }
  }

  function close(returnFocus) {
    if (menu.hidden) return;
    if (returnFocus === true) btn.focus({ preventScroll: true });
    btn.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('is-open');
    if (openOne === close) openOne = null;
    if (reduce) { menu.hidden = true; wrap.appendChild(menu); return; }
    gsap.to(menu, { opacity: 0, y: -6, duration: 0.15, ease: 'power2.in', onComplete: () => { if (!wrap.classList.contains('is-open')) { menu.hidden = true; wrap.appendChild(menu); } } });
  }

  const dlg = wrap.closest('.modal-dialog');
  if (dlg) dlg.addEventListener('scroll', close, { passive: true });
  btn.onclick = (e) => { e.stopPropagation(); if (menu.hidden || !wrap.classList.contains('is-open')) open(); else close(); };
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && wrap.classList.contains('is-open')) { e.stopPropagation(); close(true); } }, true);

  // keyboard: arrows open the list / move through it, Home / End jump, Enter or Space choose, Tab leaves
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!wrap.classList.contains('is-open')) open(true); else if (items[0]) items[0].focus(); }
  });
  menu.addEventListener('keydown', (e) => {
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Tab') close();
  });
  // selects filled later by other code: keep the box in step with their options
  new MutationObserver(refresh).observe(select, { childList: true });

  refresh();
}
