import { $ } from '../dom';
import BENCHMARKS from '../../data/benchmark-cards.json';
import { showToast } from '../ui/toast';
import { fly } from '../sky/camera';
import { radecToGal } from '../sky/coords';

// Story section 4 (story/sections/Benchmarks.tsx renders #storyBenchmarkGrid empty): one card per NASA
// benchmark target; a click flies the globe to it.

export function initBenchmarksSection() {
  const grid = $('#storyBenchmarkGrid');
  if (!grid) return;
  BENCHMARKS.forEach((bm) => {
    const card = document.createElement('div');
    card.className = 'benchmark-card';
    card.innerHTML = '<span class="bm-type">' + bm.type + '</span>' +
      '<h4>' + bm.name + '</h4>' +
      '<p class="bm-desc">' + bm.desc + '</p>' +
      '<span class="small" style="color:var(--cool);margin-top:auto;">RA ' + bm.ra.toFixed(2) + '°, Dec ' + bm.dec.toFixed(2) + '° →</span>';
    card.onclick = () => {
      const g = radecToGal(bm.ra, bm.dec);
      fly([bm.name, g.l, g.b], 35);
      showToast('Centered sky globe on ' + bm.name);
    };
    grid.appendChild(card);
  });
}
