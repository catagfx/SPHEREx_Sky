import { $ } from '../dom';
import { EPOCHS } from '../../data';
import { st } from './state';
import { niceDate, fmtFlux } from './format';
import { render } from './index';

// Modes S (swipe two dates with a divider) and F (flip through the dates) for Barnard's Star:
// the two images, the observation timeline and the brightness bar chart.

const NE = EPOCHS.length;
const days = EPOCHS.map((e) => Date.parse(e.d) / 864e5);

/** Epoch i was observed in August. */
export const isAugust = (i) => EPOCHS[i].d.slice(5, 7) === '08';

const dMin = Math.min.apply(0, days);
const dMax = Math.max.apply(0, days);
/** Timeline position (percent): spread evenly across 6–92 %. */
const MIN_GAP = 12; // percent: two dates close in time never overlap
const xs = [];
days.forEach((d, i) => {
  const proportional = 6 + ((d - dMin) / Math.max(1, dMax - dMin)) * 86;
  xs.push(i === 0 ? proportional : Math.max(proportional, xs[i - 1] + MIN_GAP));
});
const timelineX = (i) => xs[i];

const ticks = [];

function setImage(img, i) {
  if (img.dataset.i === String(i)) return;
  img.src = EPOCHS[i].u;
  img.dataset.i = i;
  img.alt = "SPHEREx image of Barnard's Star on " + niceDate(EPOCHS[i].d);
}

function placeRing(el, e) {
  el.style.left = e.x * 100 + '%';
  el.style.top = e.y * 100 + '%';
  el.hidden = !$('#rgk').checked;
}

function brightnessChart(swipe) {
  const max = Math.max.apply(0, EPOCHS.map((e) => e.f));
  const w = 284 / NE;
  let h = '<svg viewBox="0 0 300 122" role="img" aria-label="Brightness inside the ring on each date.">';
  EPOCHS.forEach((e, i) => {
    const ht = Math.max(1.5, (e.f / max) * 74);
    const x = 8 + i * w;
    const on = swipe ? i === st.ia || i === st.ib : i === st.cur;
    h += '<rect x="' + x + '" y="' + (96 - ht) + '" width="' + (w - 8) + '" height="' + ht + '" rx="2" fill="' + (on ? '#ffb86b' : '#5a6a8c') + '"/>' +
      '<text x="' + (x + (w - 8) / 2) + '" y="' + (92 - ht) + '" text-anchor="middle" fill="#cfd5ea" font-size="9">' + fmtFlux(e.f) + '</text>' +
      '<text x="' + (x + (w - 8) / 2) + '" y="110" text-anchor="middle" fill="#8e98b8" font-size="9">P' + (i + 1) + '</text>';
  });
  return h + '</svg><p class="small">Calibrated surface brightness inside the target aperture (MJy/sr) across 6 survey passes.</p>';
}

/** Mode S / F part of render(). */
export function renderEpochs() {
  const swipe = st.mode === 'S';
  const B = swipe ? st.ib : st.cur;
  const A = EPOCHS[st.ia];
  const b = EPOCHS[B];
  setImage($('#imB'), B);
  placeRing($('#rgB'), b);
  $('#lyA').hidden = $('#hd').hidden = $('#tgA').hidden = $('#grS').hidden = !swipe;
  $('#grF').hidden = swipe;
  $('#mS').setAttribute('aria-pressed', swipe);
  $('#mF').setAttribute('aria-pressed', !swipe);

  if (swipe) {
    setImage($('#imA'), st.ia);
    placeRing($('#rgA'), A);
    $('#lyA').style.clipPath = 'inset(0 ' + (100 - st.pos) + '% 0 0)';
    $('#hd').style.left = st.pos + '%';
    $('#tgA').textContent = 'A  ' + niceDate(A.d);
    $('#sa').value = st.ia;
    $('#sb').value = st.ib;
  } else {
    $('#fs').value = st.cur;
    setDateDots();
  }

  $('#tgB').textContent = (swipe ? 'B  ' : '') + niceDate(b.d);
  $('#cap2').innerHTML = (swipe
    ? '<b>Left, ' + niceDate(A.d) + ':</b> ' + A.note + '.<br><b>Right, ' + niceDate(b.d) + ':</b> ' + b.note + '.'
    : '<b>' + niceDate(b.d) + ':</b> ' + b.note + '.') + '<br><span class="dm">' + b.b + '</span>';
  ticks.forEach((k, i) => {
    k.className = 'tk' + (swipe ? (i === st.ia ? ' a on' : i === st.ib ? ' c on' : '') : i === st.cur ? ' c on' : '');
  });
  $('#chart').innerHTML = brightnessChart(swipe);
}

function buildTimeline() {
  const tl = $('#tlx');
  EPOCHS.forEach((e, i) => {
    const b = document.createElement('button');
    b.className = 'tk';
    b.style.left = timelineX(i) + '%';
    b.setAttribute('aria-label', 'Choose ' + niceDate(e.d));
    b.innerHTML = '<span>' + +e.d.slice(8) + '</span>';
    b.onclick = () => {
      if (st.mode === 'F') st.cur = i;
      else {
        if (st.side === 0) st.ib = i; else st.ia = i; // clicks alternate between B and A
        st.side = 1 - st.side;
      }
      render();
    };
    tl.appendChild(b);
    ticks.push(b);
  });
  // one month label under each group of dates, centred exactly on its numbers
  const groups = new Map();
  EPOCHS.forEach((e, i) => {
    const key = e.d.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(timelineX(i));
  });
  groups.forEach((list, key) => {
    const s = document.createElement('span');
    s.className = 'gl';
    s.textContent = new Date(key + '-15T00:00:00Z').toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    s.style.left = (list.reduce((a, b) => a + b, 0) / list.length) + '%';
    s.style.transform = 'translateX(-50%)';
    tl.appendChild(s);
  });
}

function initSwipeDrag() {
  const sw = $('#sw');
  let dragging = false;
  const move = (e) => {
    const r = sw.getBoundingClientRect();
    st.pos = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    render();
  };
  sw.addEventListener('dragstart', (e) => e.preventDefault()); // a dragged <img> would cancel the pointer events
  sw.addEventListener('pointerdown', (e) => {
    if (st.mode !== 'S') return;
    e.preventDefault();
    dragging = true;
    sw.setPointerCapture(e.pointerId);
    move(e);
  });
  sw.addEventListener('pointermove', (e) => { if (dragging) move(e); });
  ['pointerup', 'pointercancel'].forEach((n) => sw.addEventListener(n, () => { dragging = false; }));
}

/** Date slider (Flip timeline): a dot for every date on the line (css/explorer.css reads --t, the pixel distance between two dots). */
function setDateDots() {
  const s = $('#fs');
  if (!s) return;
  const w = s.getBoundingClientRect().width;
  if (w > 40) s.style.setProperty('--t', ((w - 20) / Math.max(1, NE - 1)).toFixed(3) + 'px');
}

export function initEpochs() {
  window.addEventListener('resize', setDateDots);
  $('#mF').addEventListener('click', () => requestAnimationFrame(() => requestAnimationFrame(setDateDots)));
  ['#sa', '#sb'].forEach((sel) => {
    EPOCHS.forEach((e, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = niceDate(e.d);
      $(sel).appendChild(o);
    });
  });
  $('#fs').max = Math.max(0, NE - 1);
  buildTimeline();
  initSwipeDrag();

  $('#sa').onchange = function () { st.ia = +this.value; render(); };
  $('#sb').onchange = function () { st.ib = +this.value; render(); };
  $('#fs').oninput = function () { st.cur = +this.value; render(); };
}

/** Flip ▸ Play: next date. */
export function nextEpoch() {
  st.cur = (st.cur + 1) % NE;
}
