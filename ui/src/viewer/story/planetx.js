import { $ } from '../dom';
import { openChange } from '../explorer';

// Story section 2 (story/sections/PlanetX.tsx): four survey passes of the hypothetical 450 AU Planet X field,
// with play and multi-pass co-add toggles.

const PASSES = [
  { u: 'assets/story_planetx_0.jpg', lab: 'Pass 1: June 2025 (450 AU Model)', x: 37.9, y: 50.0 },
  { u: 'assets/story_planetx_1.jpg', lab: 'Pass 2: December 2025 (π = 458.4″ Annual Parallax)', x: 61.9, y: 48.3 },
  { u: 'assets/story_planetx_2.jpg', lab: 'Pass 3: June 2026 (Orbit Reflex)', x: 39.5, y: 51.9 },
  { u: 'assets/story_planetx_3.jpg', lab: 'Pass 4: December 2026 (Loop Closure)', x: 63.3, y: 50.4 },
];

let pass = 0;
let timer = null;
let coadded = false;

export function showPlanetXPass(idx) {
  pass = idx % PASSES.length;
  const f = PASSES[pass];
  const img = $('#storyPxImg');
  const marker = $('#storyPxMarker');
  const badge = $('#storyPxPassBadge');
  if (img) img.src = f.u;
  if (marker) {
    marker.style.left = f.x + '%';
    marker.style.top = f.y + '%';
  }
  if (badge) badge.textContent = f.lab + (coadded ? ' [Multi-Pass Band Co-Add: SNR 3.6σ]' : ' [Single Pass]');
}

export function initPlanetXSection() {
  showPlanetXPass(0);
  $('#storyPxPlayBtn').onclick = function () {
    const playing = !timer;
    this.textContent = playing ? 'Pause Parallax Motion' : 'Play 4-Pass Parallax Motion';
    if (playing) timer = setInterval(() => showPlanetXPass(pass + 1), 900);
    else { clearInterval(timer); timer = null; }
  };
  $('#storyPxCoaddBtn').onclick = function () {
    coadded = !coadded;
    this.classList.toggle('pri', coadded);
    this.classList.toggle('sec', !coadded);
    this.textContent = coadded ? 'Band Co-Add Active (×√4 SNR)' : 'Toggle Multi-Pass Band Co-Add (×√N SNR)';
    const snr = $('#storyPxSnr');
    if (snr) snr.textContent = coadded ? '3.6σ (×√4 Passes = +100% SNR)' : '1.8σ (Single Exposure)';
    const img = $('#storyPxImg');
    if (img) img.style.filter = coadded ? 'contrast(1.35) brightness(1.15) saturate(1.2)' : 'none';
    showPlanetXPass(pass);
  };
  $('#storyPxOpenFull').onclick = () => openChange('M', 'planetx');
}
