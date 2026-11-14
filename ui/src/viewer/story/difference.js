import { $ } from '../dom';
import { openChange } from '../explorer';

// Story section 3 (story/sections/Diff.tsx): pass 4 minus pass 1 of the Planet X field on #storyDiffCanvas,
// with a gain slider and contrast inversion.

let gain = 4;
let invert = false;
let images = null; // [pass 1, pass 4], loaded on first use

function loadImages() {
  images = ['assets/field_planetx_0.jpg', 'assets/field_planetx_3.jpg'].map((src) => {
    const im = new Image();
    im.onload = renderStoryDiff;
    im.src = src;
    return im;
  });
}

function pixels(im, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(im, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

export function renderStoryDiff() {
  const canvas = $('#storyDiffCanvas');
  if (!canvas) return;
  if (!images) loadImages();
  if (!images.every((im) => im.complete && im.naturalWidth)) return; // onload renders
  const { width: w, height: h } = canvas;
  const d1 = pixels(images[0], w, h);
  const d2 = pixels(images[1], w, h);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(w, h);
  const od = out.data;
  const k = invert ? -1 : 1;
  for (let i = 0; i < d1.length; i += 4) {
    const g1 = 0.299 * d1[i] + 0.587 * d1[i + 1] + 0.114 * d1[i + 2];
    const g2 = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
    od[i] = od[i + 1] = od[i + 2] = Math.max(0, Math.min(255, Math.round(128 + k * gain * (g2 - g1))));
    od[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}

export function initDiffSection() {
  $('#storyDiffGain').oninput = function () {
    gain = +this.value;
    $('#storyDiffGainVal').textContent = gain + '×';
    $('#storyDiffBadge').textContent = 'Difference: Pass 4 − Pass 1 (Gain ' + gain + '×)';
    renderStoryDiff();
  };
  $('#storyDiffInvert').onclick = function () {
    invert = !invert;
    this.textContent = invert ? 'Normal Contrast' : 'Invert Contrast';
    renderStoryDiff();
  };
  $('#storyDiffOpenFull').onclick = () => openChange('D', 'planetx');
  renderStoryDiff();
}
