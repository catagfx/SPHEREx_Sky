import { $ } from '../dom';
import BENCHMARKS from '../../data/benchmark-cards.json';
import { fly } from '../sky/camera';
import { showCard } from '../sky/card';
import { LANDMARKS } from '../../data';
import { radecToGal } from '../sky/coords';

// Story section 4 (story/sections/Benchmarks.tsx renders #storyBenchmarkGrid empty): one card per NASA
// benchmark target; a click flies the globe to it.

// the landmark (index in LANDMARKS) of each benchmark target
const LANDMARK_OF = { barnard: 5, planetx: 6, wise0855: 7, epsindi: 8, rwaur: 9, rdraconis: 10 };

export function initBenchmarksSection() {
  const grid = $('#storyBenchmarkGrid');
  if (!grid) return;
  BENCHMARKS.forEach((bm) => {
    const card = document.createElement('div');
    card.className = 'benchmark-card';
    card.innerHTML = '<span class="bm-type">' + bm.type + '</span>' +
      '<h4>' + bm.name + '</h4>' +
      '<p class="bm-desc">' + bm.desc + '</p>' +
      '<span class="small" style="color:var(--cool);margin-top:auto;">RA ' + bm.ra.toFixed(2) + '°, Dec ' + bm.dec.toFixed(2) + '°</span>';
    card.onclick = () => {
      // go to the star itself: open the globe in Landmarks mode, fly to the target's landmark and show its info
      const h = LANDMARKS[LANDMARK_OF[bm.id]];
      window.dispatchEvent(new CustomEvent('spherex:free-look', { detail: { mode: 'landmarks' } }));
      if (h) { fly(h); showCard(h[3], h[4]); return; }
      const g = radecToGal(bm.ra, bm.dec);
      fly([bm.name, g.l, g.b], 35);
    };
    grid.appendChild(card);
  });
}
