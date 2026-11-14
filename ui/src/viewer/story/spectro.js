import { $ } from '../dom';
import { openChange } from '../explorer';

// Story section 5 (story/sections/Spectro.tsx): sweep the wavelength toward the 4.26 µm CO₂ peak of the comet.

const STEPS = [
  { wl: '3.79 µm', lab: '3.79 µm (Detector D5 Baseline)' },
  { wl: '3.92 µm', lab: '3.92 µm (Continuum)' },
  { wl: '4.05 µm', lab: '4.05 µm (Continuum)' },
  { wl: '4.15 µm', lab: '4.15 µm (CO₂ Wing)' },
  { wl: '4.20 µm', lab: '4.20 µm (CO₂ Rising)' },
  { wl: '4.24 µm', lab: '4.24 µm (Strong Emission)' },
  { wl: '4.26 µm', lab: '4.26 µm (Peak CO₂ Gas Halo)' },
];
const IMAGE = 'assets/color_6_4.25um.jpg';
const PEAK = STEPS.length - 1;

function showStep(value) {
  const idx = Math.min(PEAK, Math.max(0, +value));
  const step = STEPS[idx];
  $('#storyWlLabel').textContent = step.lab;
  $('#storyWavelengthBadge').textContent = 'Wavelength: ' + step.wl;
  const img = $('#storySpectroImg');
  if (img) {
    img.src = IMAGE;
    img.style.filter = idx === PEAK ? 'brightness(1.2) contrast(1.3)' : 'brightness(' + (0.6 + idx * 0.08) + ')';
  }
}

export function initSpectroSection() {
  const slider = $('#storyWavelengthSlider');
  slider.oninput = () => showStep(slider.value);
  $('#storyPlaySpectro').onclick = () => {
    let v = 0;
    const timer = setInterval(() => {
      slider.value = v;
      showStep(v);
      v++;
      if (v > PEAK) clearInterval(timer);
    }, 280);
  };
  $('#storyOpenSpectroFull').onclick = () => openChange('C', 'barnard');
}
