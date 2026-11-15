import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { view } from '../sky/view';
import { isEmbed, prefersReducedMotion } from '../../core/env';
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

// Cards with a 3D tilt (css/story.css reads --tilt, 0 = straight, 1 = tilted). The card shows up straight, then
// tilts over exactly the time (and easing) of the sky's flight (view.anim in sky/camera.js).
const TILTED = new Set(['secAbout', 'secGuide', 'secPlanetX', 'secDiff', 'secBenchmarks', 'secColors', 'secSpectro', 'secCitizen']);

// Scrolling UP, cards 3 (Guide), 5 (Diff), 6 (Benchmarks) and 7 (Colors) tilt the other way (--tdir = -1 in css/story.css).
const FLIP_UP = new Set(['secGuide', 'secDiff', 'secBenchmarks', 'secColors']);

function tiltIn(id, down) {
  const el = document.getElementById(id);
  if (!el || !TILTED.has(id)) return;
  gsap.killTweensOf(el);
  // the tilt lasts exactly as long as the sky's flight (same start, same duration, same easing)
  const dur = view.anim ? view.anim.dur / 1000 : 0;
  if (!dur || prefersReducedMotion) { gsap.set(el, { '--tilt': 1 }); return; }
  gsap.set(el, { '--tdir': !down && FLIP_UP.has(id) ? -1 : 1 });
  gsap.fromTo(el, { '--tilt': 0 }, { '--tilt': 1, duration: dur, ease: 'power3.inOut', overwrite: true });
}

function tiltOut(id) {
  const el = document.getElementById(id);
  if (!el || !TILTED.has(id)) return;
  gsap.killTweensOf(el);
  gsap.to(el, { '--tilt': 0, duration: prefersReducedMotion ? 0 : 0.5, ease: 'power2.out' });
}

function arrive(sec, scrollingDown) {
  if (sec.nav) setActiveNav(sec.nav);
  let l, b;
  if (sec.gal) [l, b] = sec.gal;
  else ({ l, b } = radecToGal(sec.radec[0], sec.radec[1]));
  fly([sec.label, l, b], sec.fov);
  tiltIn(sec.id, scrollingDown);
  if (sec.onArrive) sec.onArrive();
  if (scrollingDown && sec.onEnter) sec.onEnter();
}

export function initSkySync() {
  if (isEmbed) return;
  TILTED.forEach((id) => { const el = document.getElementById(id); if (el) gsap.set(el, { '--tilt': 0 }); });
  SECTIONS.forEach((sec) => {
    ScrollTrigger.create({
      trigger: '#' + sec.id,
      start: 'top center',
      end: 'bottom center',
      onEnter: () => arrive(sec, true),
      onEnterBack: () => arrive(sec, false),
      onLeave: () => tiltOut(sec.id),
      onLeaveBack: () => tiltOut(sec.id),
    });
  });
}
