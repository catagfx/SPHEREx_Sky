import gsap from 'gsap';
import { $ } from '../dom';
import { prefersReducedMotion as reduce } from '../../core/env';
import { FIELD } from '../../data';
import { openModal, closeModal } from '../ui/modal';
import { borrowNav, restoreNav } from '../ui/header';
import { openChange, closeChange } from '../explorer';
import { setSeries } from '../explorer/series';

// Science ▸ Gallery (#gal): one card per target (the 6 NASA benchmark targets + Planet X), filterable by kind.

const FILTERS = [
  ['all', 'All'],
  ['nasa-benchmark', 'NASA Benchmarks'],
  ['planet-x', 'Planet X (450 AU)'],
  ['brown-dwarf', 'Brown Dwarfs'],
  ['star', 'Stars & Variables'],
];

const gallery = () => $('#gal');
const galleryBox = () => $('#gal .gw');

/** Card with a 3× zoomed thumbnail centred on the target (frame e, image aspect asp). */
function addCard({ name, kind, blurb, meta, frame, aspect, tags, onOpen }) {
  const b = document.createElement('button');
  const zoom = 300;
  b.className = 'gc';
  b.dataset.tags = (tags || []).join(' ');
  b.innerHTML = '<div class="th"><img alt="" src="' + frame.u + '" style="width:' + zoom + '%;left:calc(50% - ' + frame.x * zoom + '%);top:calc(50% - ' + frame.y * zoom * aspect + '%)"></div>' +
    '<div class="tx"><div class="kd">' + kind + '</div><h3>' + name + '</h3><p class="small">' + blurb + '</p><p class="small">' + meta + '</p></div>';
  b.onclick = () => closeGallery(onOpen);
  $('#gg').appendChild(b);
}

function buildFilters() {
  FILTERS.forEach(([tag, label], i) => {
    const c = document.createElement('button');
    c.className = 'b';
    c.textContent = label;
    c.setAttribute('aria-pressed', i === 0);
    c.onclick = () => {
      Array.prototype.forEach.call($('#gf').children, (x) => x.setAttribute('aria-pressed', x === c));
      Array.prototype.forEach.call($('#gg').children, (card) => {
        const show = tag === 'all' || (' ' + card.dataset.tags + ' ').indexOf(' ' + tag + ' ') >= 0;
        card.hidden = !show;
        if (show && !reduce) gsap.fromTo(card, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' });
      });
    };
    $('#gf').appendChild(c);
  });
}

export function openGallery() {
  closeChange();
  openModal(gallery(), galleryBox());
  borrowNav('gallery');
  $('#gx').focus();
}

/** Close; `callback` runs once it is gone (a card opens the explorer). */
export function closeGallery(callback) {
  closeModal(gallery(), galleryBox(), () => {
    restoreNav();
    if (callback) callback();
  });
}

export function initGallery() {
  FIELD.forEach((s, n) => {
    addCard({
      name: s.name || s.label, kind: s.kind || 'Moving object', blurb: s.blurb || '', meta: s.span || '',
      frame: s.frames[0], aspect: 0.75, tags: s.tags || ['nasa-benchmark'],
      onOpen: () => { openChange('M'); setSeries(n); },
    });
  });
  buildFilters();

  if ($('#galb')) $('#galb').onclick = openGallery;
  $('#gx').onclick = () => closeGallery();
}
