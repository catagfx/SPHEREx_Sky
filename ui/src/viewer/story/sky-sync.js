import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { isEmbed } from '../../core/env';
import { setActiveNav } from '../ui/header';
import { fly } from '../sky/camera';
import { radecToGal } from '../sky/coords';
import { showPlanetXPass } from './planetx';
import { renderStoryDiff } from './difference';

// The sky follows the story: each section flies the globe to its own target when it reaches the middle of the
// screen, scrolling down (onEnter) AND back up (onEnterBack). In calm mode fly() cuts there instead.

const SECTIONS = [
  { id: 'secHero', nav: 'story', label: 'Galactic Plane', gal: [0, 0], fov: 75 },
  { id: 'secAbout', label: 'Milky Way Overview', gal: [0, 0], fov: 95 },
  { id: 'secGuide', label: 'Wide Infrared Sky', gal: [120, 20], fov: 90 },
  { id: 'secPlanetX', nav: 'planetx', label: 'Planet X Region', radec: [63.0, 18.5], fov: 50, onEnter: () => showPlanetXPass(0) },
  { id: 'secDiff', nav: 'change', label: "Barnard's Star Field", radec: [269.452, 4.693], fov: 45, onArrive: renderStoryDiff },
  { id: 'secBenchmarks', label: 'WISE 0855 Field', radec: [133.795, -7.245], fov: 45 },
  { id: 'secColors', nav: 'colors', label: 'Infrared Sky Overview', gal: [60, 10], fov: 90 },
  { id: 'secSpectro', nav: 'colors', label: 'Epsilon Indi B', radec: [331.076, -56.794], fov: 40 },
  { id: 'secCitizen', label: 'Galactic Plane', gal: [0, 0], fov: 85 }, // wide view: the whole sky is there to search
];

function arrive(sec, scrollingDown) {
  if (sec.nav) setActiveNav(sec.nav);
  let l, b;
  if (sec.gal) [l, b] = sec.gal;
  else ({ l, b } = radecToGal(sec.radec[0], sec.radec[1]));
  fly([sec.label, l, b], sec.fov);
  if (sec.onArrive) sec.onArrive();
  if (scrollingDown && sec.onEnter) sec.onEnter();
}

export function initSkySync() {
  if (isEmbed) return;
  SECTIONS.forEach((sec) => {
    ScrollTrigger.create({
      trigger: '#' + sec.id,
      start: 'top center',
      end: 'bottom center',
      onEnter: () => arrive(sec, true),
      onEnterBack: () => arrive(sec, false),
    });
  });
}
