import Hero from './Hero';
import PlanetX from './sections/PlanetX';
import Diff from './sections/Diff';
import Benchmarks from './sections/Benchmarks';
import Spectro from './sections/Spectro';
import Citizen from './sections/Citizen';
import ProgressNav from './ProgressNav';
import { useSectionPager } from './useSectionPager';

// The whole Story Tour page: <main id="storyContainer"> in index.html is its mount point.
// Order = scroll order (story/scroll.ts STORY_SECTIONS; the sky follows each section by id: viewer/story/sky-sync.js).
// Scrolling moves one whole section per gesture (useSectionPager).
export default function Story() {
  useSectionPager();
  return (
    <>
      <Hero />
      <PlanetX />
      <Diff />
      <Benchmarks />
      <Spectro />
      <Citizen />
      <ProgressNav />
    </>
  );
}
