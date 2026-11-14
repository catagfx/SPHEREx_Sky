import { $ } from '../dom';

// Tools ▸ "Sky layers & compare": fade each SPHEREx layer (#cmpp panel), or split the screen between them
// with a draggable divider (#dv, labels #cl / #cr).

let sky = null;
let dividerX = 0.5;    // divider position, fraction of the screen width
let compareOn = false;
let panelOpen = false;

export function updateCompare() {
  const on = compareOn && !sky.ren.xr.isPresenting;
  sky.uniforms.split.value = on ? dividerX : 2;
  $('#dv').hidden = $('#cl').hidden = $('#cr').hidden = !compareOn;
  $('#cmpp').hidden = !panelOpen;
  $('#dv').style.left = dividerX * 100 + '%';
  $('#cl').style.left = Math.max(8, dividerX * innerWidth - 190) + 'px';
  $('#cr').style.left = Math.min(innerWidth - 170, dividerX * innerWidth + 10) + 'px';
}

function applyLayerMix() {
  sky.uniforms.mixA.value = $('#l1').checked ? $('#s1').value / 100 : 0;
  sky.uniforms.mixG.value = $('#l2').checked ? $('#s2').value / 100 : 0;
}

export function initLayers(s) {
  sky = s;
  $('#cmp').onclick = function () {
    panelOpen = !panelOpen;
    this.setAttribute('aria-pressed', panelOpen);
    updateCompare();
  };
  $('#cmpb').onclick = function () {
    compareOn = !compareOn;
    this.setAttribute('aria-pressed', compareOn);
    this.textContent = compareOn ? 'Hide the divider' : 'Compare with a divider';
    updateCompare();
  };
  $('#cmpr').onclick = () => {
    $('#l1').checked = $('#l2').checked = true;
    $('#s1').value = 40;
    $('#s2').value = 120;
    applyLayerMix();
  };
  ['#l1', '#l2', '#s1', '#s2'].forEach((sel) => {
    $(sel).addEventListener('input', applyLayerMix);
    $(sel).addEventListener('change', applyLayerMix);
  });
  applyLayerMix();

  const divider = $('#dv');
  let dragging = false;
  divider.addEventListener('pointerdown', (e) => { dragging = true; divider.setPointerCapture(e.pointerId); });
  divider.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dividerX = Math.max(0.05, Math.min(0.95, e.clientX / innerWidth));
    updateCompare();
  });
  divider.addEventListener('pointerup', () => { dragging = false; });
}
