import { initPlanetXSection } from './planetx';
import { initDiffSection } from './difference';
import { initBenchmarksSection } from './benchmarks';
import { initSpectroSection } from './spectro';
import { initCitizenSection } from './citizen';
import { initSkySync } from './sky-sync';

// The interactive parts of the Story Tour sections (rendered by React in ui/src/story/), and the sky that
// follows the scroll.
export function initStory() {
  initPlanetXSection();
  initDiffSection();
  initBenchmarksSection();
  initSpectroSection();
  initCitizenSection();
  initSkySync();
}
