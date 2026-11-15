import { $ } from '../dom';
import { st, series } from './state';
import { frameLabel } from './format';

// Mode D: digital difference imaging, pass B minus pass A of the selected field. Static stars cancel to neutral
// grey; anything that moved leaves a dark (A) / bright (B) pair.

const W = 720;
const H = 540;
const canvasA = document.createElement('canvas');
const canvasB = document.createElement('canvas');
canvasA.width = canvasB.width = W;
canvasA.height = canvasB.height = H;
const ctxA = canvasA.getContext('2d');
const ctxB = canvasB.getContext('2d');

function fillPassSelects() {
  const sda = $('#sda');
  const sdb = $('#sdb');
  sda.innerHTML = '';
  sdb.innerHTML = '';
  st.FR.forEach((f, i) => {
    [sda, sdb].forEach((sel) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = 'Pass ' + (i + 1) + ': ' + frameLabel(f);
      sel.appendChild(o);
    });
  });
  if (st.idb >= st.FR.length) st.idb = Math.max(0, st.FR.length - 1);
  if (st.ida >= st.FR.length) st.ida = 0;
  sda.value = st.ida;
  sdb.value = st.idb;
}

const luminance = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function ring(ctx, color, f) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(f.x * W, f.y * H, 22, 0, 2 * Math.PI);
  ctx.stroke();
}

function asideHtml(frameA, frameB) {
  return '<div class="metric-box" style="border-color:var(--warm);background:rgba(255,184,107,0.08);">' +
    '<strong style="color:var(--warm);">Digital Difference Imaging (B − A)</strong>' +
    '<div class="metric-grid" style="margin-top:6px;">' +
    '<div class="metric-item"><span>Reference Epoch A</span><strong>Pass ' + (st.ida + 1) + ' (' + frameLabel(frameA) + ')</strong></div>' +
    '<div class="metric-item"><span>Comparison Epoch B</span><strong>Pass ' + (st.idb + 1) + ' (' + frameLabel(frameB) + ')</strong></div>' +
    '<div class="metric-item"><span>Static Star Residual</span><strong style="color:#cfd5ea;">0 (128 Neutral Gray)</strong></div>' +
    '<div class="metric-item"><span>Motion Signature</span><strong style="color:var(--warm);">Bright/Dark Dipole</strong></div>' +
    '</div>' +
    '<p class="small" style="margin:8px 0 0;"><strong>Astrophysical Method:</strong> In digital difference imaging, stationary cosmic background stars cancel out completely to zero. Moving bodies (asteroids, high proper motion stars, and Planet X candidates) produce a classic negative dark depression at Epoch A and a positive bright peak at Epoch B.</p></div>' +
    (series().aside || '');
}

/** Mode D part of render(). Waits (re-runs on load) until both pass images are in. */
export function renderDifference() {
  const sda = $('#sda');
  const sdb = $('#sdb');
  if (!sda || !sdb) return;
  if (!sda.children.length || sda.children.length !== st.FR.length) fillPassSelects();
  st.ida = +sda.value || 0;
  st.idb = +sdb.value || (st.FR.length > 1 ? 1 : 0);

  const frameA = st.FR[st.ida];
  const frameB = st.FR[st.idb];
  if (!frameA || !frameB) return;
  let imA = frameA.im;
  let imB = frameB.im;
  if (!imA) { frameA.im = imA = new Image(); imA.onload = renderDifference; imA.src = frameA.u; }
  if (!imB) { frameB.im = imB = new Image(); imB.onload = renderDifference; imB.src = frameB.u; }
  if (!imA.complete || !imB.complete || !imA.naturalWidth || !imB.naturalWidth) return;

  ctxA.drawImage(imA, 0, 0, W, H);
  ctxB.drawImage(imB, 0, 0, W, H);
  const a = ctxA.getImageData(0, 0, W, H).data;
  const b = ctxB.getImageData(0, 0, W, H).data;
  const diffCtx = $('#diffC').getContext('2d');
  const out = diffCtx.createImageData(W, H);
  const o = out.data;
  const k = st.diffGain * (st.diffInvert ? -1 : 1);
  for (let i = 0; i < a.length; i += 4) {
    const v = Math.max(0, Math.min(255, 128 + (luminance(b, i) - luminance(a, i)) * k));
    o[i] = o[i + 1] = o[i + 2] = v;
    o[i + 3] = 255;
  }
  diffCtx.putImageData(out, 0, 0);

  if ($('#rgk') && $('#rgk').checked) { // where the target was (A, blue) and is (B, orange)
    diffCtx.lineWidth = 2.5;
    ring(diffCtx, '#8fd3ff', frameA);
    ring(diffCtx, '#ffb86b', frameB);
  }

  $('#diffT').textContent = 'Subtracted: Epoch ' + (st.idb + 1) + ' (' + frameLabel(frameB) + ') minus Epoch ' + (st.ida + 1) + ' (' + frameLabel(frameA) + ')';
  setGainDots();
  const aside = $('#asN');
  if (aside) aside.innerHTML = asideHtml(frameA, frameB);
}

/** Contrast slider: a dot for every step on the line (css/explorer.css reads --t, the pixel distance between two dots). */
function setGainDots() {
  const s = $('#diffGain');
  if (!s) return;
  const w = s.getBoundingClientRect().width;
  const steps = Math.max(1, Math.round((+s.max - +s.min) / (+s.step || 1)));
  if (w > 40) s.style.setProperty('--t', ((w - 20) / steps).toFixed(3) + 'px');
}

export function initDifference() {
  window.addEventListener('resize', setGainDots);
  $('#mD').addEventListener('click', () => requestAnimationFrame(() => requestAnimationFrame(setGainDots)));
  $('#sda').onchange = function () { st.ida = +this.value; renderDifference(); };
  $('#sdb').onchange = function () { st.idb = +this.value; renderDifference(); };
  $('#diffGain').oninput = function () { st.diffGain = +this.value; renderDifference(); };
  $('#invDiff').onclick = () => { st.diffInvert = !st.diffInvert; renderDifference(); };
}
