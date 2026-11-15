import * as THREE from 'three';
import { FIELD, LANDMARKS, CONSTELLATIONS, ABOUT, COLORS } from '../../../data';
import { dir } from '../scene';
import { radecToGal } from '../coords';

// Complete VR content templates matching the desktop Story Tour (all 9 sections),
// Header navigation bar, Celestial Landmarks (with real SPHEREx photos & Galactic sky crops),
// 20 SPHEREx Constellations (with safe RA/Dec/Code computation & tangent-plane diagram),
// and the full Photo Gallery (NASA Benchmarks, Landmarks, Comets & Asteroids).

const IAU_CODES = {
  Draco: 'DRA',
  Dorado: 'DOR',
  Ophiuchus: 'OPH',
  Indus: 'IND',
  Hydra: 'HYA',
  Auriga: 'AUR',
  Taurus: 'TAU',
  Sagittarius: 'SGR',
  Orion: 'ORI',
  Cygnus: 'CYG',
  Carina: 'CAR',
  Tucana: 'TUC',
  Scorpius: 'SCO',
  Cassiopeia: 'CAS',
  Vela: 'VEL',
  Centaurus: 'CEN',
  Andromeda: 'AND',
  'Coma Berenices': 'COM',
  Virgo: 'VIR',
  Fornax: 'FOR',
};

export const BENCHMARK_TARGETS_VR = [
  {
    id: 'planetx',
    name: 'Planet X (450 AU Model)',
    type: 'Hypothetical Outer Planet Field',
    desc: 'π = 458.4″ annual reflex parallax model at 450 AU (~40–47 K).',
    ra: 63.0,
    dec: 18.5,
    img: 'assets/field_planetx_0.jpg',
    fx: 0.4972,
    fy: 0.4962,
  },
  {
    id: 'wise0855',
    name: 'WISE 0855-0714',
    type: 'Sub-Freezing Brown Dwarf',
    desc: '8.10″/yr drift, ~250 K cold thermal IR emission.',
    ra: 133.795,
    dec: -7.245,
    img: 'assets/field_wise0855_0.jpg',
    fx: 0.4934,
    fy: 0.4958,
  },
  {
    id: 'epsindi',
    name: 'Epsilon Indi B',
    type: 'Cold Binary Brown Dwarf',
    desc: '4.70″/yr proper motion, T1+T6 spectral absorption.',
    ra: 331.044,
    dec: -56.783,
    img: 'assets/field_epsindi_0.jpg',
    fx: 0.4998,
    fy: 0.4985,
  },
  {
    id: 'barnard',
    name: "Barnard's Star",
    type: 'High Proper-Motion Star',
    desc: '10.33″/yr fastest moving star in Earth’s sky.',
    ra: 269.452,
    dec: 4.693,
    img: 'assets/field_barnard_0.jpg',
    fx: 0.4968,
    fy: 0.4894,
  },
  {
    id: 'rwaur',
    name: 'RW Aurigae',
    type: 'Eruptive T Tauri Variable',
    desc: '3.4 magnitude circumstellar dust occultation drop.',
    ra: 76.956,
    dec: 30.401,
    img: 'assets/field_rwaur_0.jpg',
    fx: 0.4972,
    fy: 0.4962,
  },
  {
    id: 'rdraconis',
    name: 'R Draconis',
    type: 'Mira Pulsating Red Giant',
    desc: '245.6-day period stellar atmospheric pulsation shock.',
    ra: 248.168,
    dec: 66.755,
    img: 'assets/field_rdraconis_0.jpg',
    fx: 0.4971,
    fy: 0.4962,
  },
];

export const VR_LANDMARKS = [
  {
    id: 'milkyway',
    idx: 0,
    fieldId: null,
    audioSrc: 'assets/audio/landmarks/0.mp3',
    label: "The Milky Way's center",
    pillLabel: "Milky Way Center",
    cardTitle: "The Milky Way's center",
    l: 0.0,
    b: 0.0,
    cardSub: "Toward the middle of the map.\n\nThe middle of the map, where the Milky Way's glow is strongest.\n\nThe brightest, most crowded region of our galaxy, where stars and glowing dust pile up toward the constellation Sagittarius. A supermassive black hole sits at its heart, hidden behind thick dust that blocks visible light. That is why infrared maps like this one can reveal what our eyes cannot.",
    narration: "We start at the middle of the map. In ordinary light, thick dust hides this part of the sky. SPHEREx sees infrared light, which passes through much of that dust, so the glowing band is our own galaxy, the Milky Way, seen edge-on from inside. The center of the galaxy lies roughly twenty-six thousand light-years from us. The brightest, most crowded region of our galaxy, where stars and glowing dust pile up toward the constellation Sagittarius. A supermassive black hole sits at its heart, hidden behind thick dust that blocks visible light. That is why infrared maps like this one can reveal what our eyes cannot.",
  },
  {
    id: 'bubbles',
    idx: 1,
    fieldId: null,
    audioSrc: 'assets/audio/landmarks/1.mp3',
    label: "Bubbles above the plane",
    pillLabel: "Galactic Bubbles",
    cardTitle: "Bubbles above the plane",
    l: 6.0,
    b: 22.0,
    cardSub: "Gas and dust bubbles.\n\nRed shows cosmic dust, blue shows hot hydrogen gas, white shows stars.\n\nTwo enormous clouds of hot gas rising above and below the galaxy’s disk, like giant balloons. They are thought to be leftovers from violent outbursts of the central black hole, or from past waves of star formation. They show that the heart of our galaxy has not always been quiet.",
    narration: "Above the glowing band are bubbles and curls of gas and dust. In this map, red is cosmic dust, blue is hot hydrogen gas, and white is starlight. These are infrared colors our eyes cannot see, so they were mapped to visible ones. Two enormous clouds of hot gas rising above and below the galaxy’s disk, like giant balloons. They are thought to be leftovers from violent outbursts of the central black hole, or from past waves of star formation. They show that the heart of our galaxy has not always been quiet.",
  },
  {
    id: 'bluebubble',
    idx: 2,
    fieldId: null,
    audioSrc: 'assets/audio/landmarks/2.mp3',
    label: "A big blue bubble",
    pillLabel: "Local Bubble",
    cardTitle: "A big blue bubble",
    l: 259.0,
    b: 3.0,
    cardSub: "A shell of hot gas.\n\nA large shell of hot hydrogen gas, drawn in blue, at galactic longitude about 260 degrees.\n\nA vast cavity of very thin, hot gas surrounding our own Solar System, known as the Local Bubble. It was blown open by a chain of supernova explosions long ago. Its edges are now rich in gas and dust, and new stars are forming there.",
    narration: "Here is a large shell of hot hydrogen gas, drawn in blue. Bubbles like this are often blown out by the winds of massive stars and by exploding stars. A vast cavity of very thin, hot gas surrounding our own Solar System, known as the Local Bubble. It was blown open by a chain of supernova explosions long ago. Its edges are now rich in gas and dust, and new stars are forming there.",
  },
  {
    id: 'lmc',
    idx: 3,
    fieldId: null,
    audioSrc: 'assets/audio/landmarks/3.mp3',
    label: "Large Magellanic Cloud",
    pillLabel: "Large Magellanic Cloud",
    cardTitle: "Large Magellanic Cloud",
    l: 280.2,
    b: -33.1,
    cardSub: "Large Magellanic Cloud.\n\nA small neighbor galaxy of the Milky Way, a bright knot well below the glowing band.\n\nThe brightest companion galaxy of the Milky Way, a fuzzy patch of light in the southern sky. It is full of young stars and glowing nebulae, including the Tarantula Nebula, one of the most active star-forming regions nearby. Its shape is slowly being reshaped by the gravity of our galaxy.",
    narration: "Well below the band is the Large Magellanic Cloud, a small galaxy that orbits the Milky Way, about one hundred and sixty thousand light-years away. It shows up here as a bright knot of stars and glowing gas. The brightest companion galaxy of the Milky Way, a fuzzy patch of light in the southern sky. It is full of young stars and glowing nebulae, including the Tarantula Nebula, one of the most active star-forming regions nearby. Its shape is slowly being reshaped by the gravity of our galaxy.",
  },
  {
    id: 'smc',
    idx: 4,
    fieldId: null,
    audioSrc: 'assets/audio/landmarks/4.mp3',
    label: "Small Magellanic Cloud",
    pillLabel: "Small Magellanic Cloud",
    cardTitle: "Small Magellanic Cloud",
    l: 302.5,
    b: -44.1,
    cardSub: "Small Magellanic Cloud.\n\nAnother small galaxy next to the Milky Way, seen as a faint smudge.\n\nA smaller, fainter companion galaxy next to the Large Cloud, stretched and distorted by the gravitational pull of its neighbors. Streams of gas connect the two Clouds. Its pulsating stars also helped astronomers learn how to measure distances across the universe.",
    narration: "Nearby is the Small Magellanic Cloud, another companion galaxy, roughly two hundred thousand light-years away. It is fainter and smaller than its neighbor. A smaller, fainter companion galaxy next to the Large Cloud, stretched and distorted by the gravitational pull of its neighbors. Streams of gas connect the two Clouds. Its pulsating stars also helped astronomers learn how to measure distances across the universe.",
  },
  {
    id: 'barnard',
    idx: 5,
    fieldId: 'barnard',
    audioSrc: 'assets/audio/landmarks/5.mp3',
    label: "Barnard's Star (Proper Motion)",
    pillLabel: "Barnard's Star",
    cardTitle: "Barnard's Star",
    l: 31.0,
    b: 14.1,
    cardSub: "High proper-motion red dwarf star in Ophiuchus.\n\nA faint red dwarf very close to us that moves across the sky faster than any other known star. Over a human lifetime it visibly shifts against the background stars. This makes it the perfect example of what “proper motion” means.",
    narration: "Barnard's Star moves faster across our sky than any other known star, shifting over 10 arcseconds each year across SPHEREx scans. A faint red dwarf very close to us that moves across the sky faster than any other known star. Over a human lifetime it visibly shifts against the background stars. This makes it the perfect example of what “proper motion” means.",
  },
  {
    id: 'planetx',
    idx: 6,
    fieldId: 'planetx',
    audioSrc: 'assets/audio/landmarks/6.mp3',
    label: "Planet X Candidate (450 AU)",
    pillLabel: "Planet X Candidate",
    cardTitle: "Planet X Candidate (450 AU)",
    l: 175.4,
    b: -23.3,
    cardSub: "Hypothetical outer solar system world at 450 AU.\n\nA hypothetical giant planet far beyond Neptune, which has never been directly seen. Its existence is suggested by the strange alignment of orbits of distant icy objects. It remains unconfirmed, and finding it would change how we see our own Solar System.",
    narration: "At 450 AU from the Sun, a hypothetical outer planet reflects almost no sunlight, but SPHEREx can search for its thermal emission and parallactic shift across survey passes. A hypothetical giant planet far beyond Neptune, which has never been directly seen. Its existence is suggested by the strange alignment of orbits of distant icy objects. It remains unconfirmed, and finding it would change how we see our own Solar System.",
  },
  {
    id: 'wise0855',
    idx: 7,
    fieldId: 'wise0855',
    audioSrc: 'assets/audio/landmarks/7.mp3',
    label: "WISE 0855 (Cold Brown Dwarf)",
    pillLabel: "WISE 0855",
    cardTitle: "WISE 0855 (a fast-moving brown dwarf Right Ascension 08h55m10.831s, declination -7d14m42.53s)",
    l: 235.0,
    b: 23.4,
    cardSub: "Sub-freezing brown dwarf 7.5 light-years away drifting 8.1 arcsec/yr. Right Ascension 08h55m10.831s, declination -7d14m42.53s.\n\nA “failed star” so cold that its temperature is close to that of Earth. It gives off almost no visible light, only a faint infrared glow, so only infrared telescopes could discover it. That makes it a perfect target for an infrared mission like SPHEREx.",
    narration: "WISE 0855 is colder than water ice. Right Ascension 08h55m10.831s, declination -7d14m42.53s. Optical telescopes see blank sky, but SPHEREx detects it in infrared. A “failed star” so cold that its temperature is close to that of Earth. It gives off almost no visible light, only a faint infrared glow, so only infrared telescopes could discover it. That makes it a perfect target for an infrared mission like SPHEREx.",
  },
  {
    id: 'epsindi',
    idx: 8,
    fieldId: 'epsindi',
    audioSrc: 'assets/audio/landmarks/8.mp3',
    label: "Epsilon Indi B (Brown Dwarf Binary)",
    pillLabel: "Epsilon Indi B",
    cardTitle: "Epsilon Indi B (a pair of brown dwarfs orbiting a star)",
    l: 336.1,
    b: -48.1,
    cardSub: "Cold binary brown dwarf pair traveling 4.7 arcsec/yr.\n\nTwo brown dwarfs, objects too big to be planets but too small to become true stars, orbiting each other. They are the closest pair of their kind to us. Together they circle a nearby orange star that also hosts a giant planet.",
    narration: "A pair of sub-stellar brown dwarfs orbiting each other 11.9 light-years away in the southern constellation Indus. Two brown dwarfs, objects too big to be planets but too small to become true stars, orbiting each other. They are the closest pair of their kind to us. Together they circle a nearby orange star that also hosts a giant planet.",
  },
  {
    id: 'rwaur',
    idx: 9,
    fieldId: 'rwaur',
    audioSrc: 'assets/audio/landmarks/9.mp3',
    label: "RW Aurigae (Dust Eclipse)",
    pillLabel: "RW Aurigae",
    cardTitle: "RW Aurigae (variable star)",
    l: 174.2,
    b: -6.0,
    cardSub: "Young eruptive star occulted by tidal circumstellar dust streams.\n\nA young star still surrounded by leftover material from its birth. A close encounter with its companion star pulled streams of dust out of the disk, and when they pass in front of the star, it dims unpredictably. It is a rare chance to watch a planetary system’s raw material in action.",
    narration: "Periodic deep eclipses caused by dust filaments sweeping across the young T Tauri star. A young star still surrounded by leftover material from its birth. A close encounter with its companion star pulled streams of dust out of the disk, and when they pass in front of the star, it dims unpredictably. It is a rare chance to watch a planetary system’s raw material in action.",
  },
  {
    id: 'rdraconis',
    idx: 10,
    fieldId: 'rdraconis',
    audioSrc: 'assets/audio/landmarks/10.mp3',
    label: "R Draconis (Mira Variable)",
    pillLabel: "R Draconis",
    cardTitle: "R Draconis (variable star)",
    l: 98.5,
    b: 38.2,
    cardSub: "Pulsating red giant star with 245.6-day infrared brightness cycle.\n\nAn aging red giant that slowly swells and shrinks, so its brightness rises and falls in a regular cycle. It sheds dusty material into space as it pulsates. Stars like this offer a glimpse of the Sun’s far future.",
    narration: "R Draconis expands, cools, and pulses rhythmically, blowing enriched gas and dust into interstellar space. An aging red giant that slowly swells and shrinks, so its brightness rises and falls in a regular cycle. It sheds dusty material into space as it pulsates. Stars like this offer a glimpse of the Sun’s far future.",
  },
];

/** Matches a Landmark label to its corresponding FIELD target (if any) so we have its science cutout frames. */
export function matchLandmarkField(label = '') {
  const s = String(label).toLowerCase();
  let fieldId = null;
  if (s.includes('barnard')) fieldId = 'barnard';
  else if (s.includes('wise 0855') || s.includes('wise0855') || s.includes('0855')) fieldId = 'wise0855';
  else if (s.includes('epsilon indi') || s.includes('epsindi')) fieldId = 'epsindi';
  else if (s.includes('rw aur') || s.includes('rwaur')) fieldId = 'rwaur';
  else if (s.includes('r draconis') || s.includes('rdraconis')) fieldId = 'rdraconis';
  else if (s.includes('planet x')) fieldId = 'planetx';
  if (!fieldId) return null;
  return (FIELD || []).find((f) => f.id === fieldId) || null;
}

export function headerBarItems(activeTab = 'story') {
  return [
    { id: 'nav:story', navId: 'story', label: 'Story 360°', active: activeTab === 'story' },
    { id: 'nav:freelook', navId: 'freelook', label: 'Free-Look', active: activeTab === 'freelook' },
    { id: 'go:starmap', navId: 'starmap', label: 'Landmarks', active: activeTab === 'starmap' },
    { id: 'nav:constellations', navId: 'constellations', label: 'Constellations', active: activeTab === 'constellations' },
    { id: 'nav:planetx', navId: 'planetx', label: 'Planet X', active: activeTab === 'planetx' },
    { id: 'nav:diff', navId: 'diff', label: 'Difference', active: activeTab === 'diff' },
    { id: 'nav:colors', navId: 'colors', label: '102 Colors', active: activeTab === 'colors' },
    { id: 'nav:benchmarks', navId: 'benchmarks', label: 'Gallery', active: activeTab === 'benchmarks' },
    { id: 'go:settings', navId: 'settings', label: 'Settings', active: activeTab === 'settings' },
    { id: 'exitVR', navId: 'exit', label: 'Exit VR', variant: 'danger' },
  ];
}

function carouselFooter(idx, total = 9) {
  const num = String(idx + 1).padStart(2, '0');
  const tot = String(total).padStart(2, '0');
  return [
    { type: 'divider' },
    {
      type: 'buttonRow',
      compact: true,
      buttons: [
        { id: 'story:prev', label: '← Prev Panel (Drag Left)', variant: 'secondary' },
        { id: `story:jump:${(idx + 1) % total}`, label: `Panel ${num} / ${tot} · Next →`, variant: 'primary' },
      ],
    },
  ];
}

/**
 * All 9 Story sections from the desktop website arranged for the 360° VR Carousel.
 * Includes real SPHEREx images for Planet X, Difference Imaging, Benchmarks Gallery, and Spectroscopy.
 */
export function buildStoryCarouselPanels(state = {}) {
  const pxPass = (state.pxPass ?? 0) % 4;
  const pxCoadd = !!state.pxCoadd;
  const diffGain = state.diffGain ?? 4;
  const diffInvert = !!state.diffInvert;
  const spectroIdx = Math.max(0, Math.min((COLORS?.length || 1) - 1, state.spectroIdx ?? 6));
  const spectroEntry = (COLORS && COLORS[spectroIdx]) || {
    wl: '4.26 µm',
    d: '2025-12-08',
    t: 'CO₂ gas coma peak',
    u: 'assets/color_6_4.25um.jpg',
    x: 0.48,
    y: 0.52,
  };

  const pxCoords = radecToGal(63.0, 18.5);
  const barnardCoords = radecToGal(269.452, 4.693);
  const wiseCoords = radecToGal(133.795, -7.245);
  const epsIndiCoords = radecToGal(331.076, -56.794);

  // Planet X marker positions across 4 survey passes
  const pxMarkerX = [0.379, 0.465, 0.548, 0.625][pxPass] || 0.45;
  const pxPassLabels = [
    'Pass 1: June 2025 (450 AU Model)',
    'Pass 2: Dec 2025 (π = 458.4″ Shift)',
    'Pass 3: June 2026 (Annual Reflex)',
    'Pass 4: Dec 2026 (Multi-Pass Stack)',
  ];

  return [
    // 01 — HERO (secHero)
    {
      id: 'secHero',
      navId: 'story',
      title: '01 · SPHEREx VR — Revealing the Hidden Universe',
      l: 0,
      b: 0,
      body: [
        { type: 'tag', text: 'NASA / JPL-CALTECH & IPAC IRSA · 360° STORY CAROUSEL' },
        { type: 'heading', text: 'Revealing the Hidden Universe' },
        {
          type: 'paragraph',
          text: 'Mapping the entire sky across 102 infrared colors every six months. Drag left or right to rotate the 360° Story Panels around you, or use the Header Bar above.',
        },
        {
          type: 'cardGrid',
          cols: 2,
          cardHeight: 88,
          cards: [
            { badge: '102 BANDS', title: '0.75 – 5.0 µm', text: 'Full near-infrared spectral mapping.' },
            { badge: '6-MONTH CYCLE', title: 'All-Sky Survey', text: '4 complete sky passes in 2 years.' },
            { badge: 'TIME DOMAIN', title: 'Dynamic Motion', text: 'Parallax & high proper-motion stars.' },
            { badge: 'DUAL LAYERS', title: 'Stars & Dust', text: 'Galaxies, stars & molecular clouds.' },
          ],
        },
        {
          type: 'buttonRow',
          buttons: [
            { id: 'go:starmap', label: 'Open Landmarks', variant: 'primary' },
            { id: 'nav:constellations', label: '20 Constellations', variant: 'primary' },
          ],
        },
        {
          type: 'buttonRow',
          buttons: [
            { id: 'nav:benchmarks', label: 'Open Photo Gallery →', variant: 'warm' },
            { id: 'nav:freelook', label: 'Free-Look 360° Globe', variant: 'secondary' },
          ],
        },
        ...carouselFooter(0, 9),
      ],
    },

    // 02 — ABOUT (secAbout)
    {
      id: 'secAbout',
      navId: 'story',
      title: '02 · Project Overview & Live Data Sources',
      l: 0,
      b: 0,
      body: [
        { type: 'tag', text: 'PROJECT OVERVIEW · WHAT IT IS, WHY IT EXISTS' },
        { type: 'heading', text: 'A Hands-On Window Into the Infrared Sky' },
        {
          type: 'cardGrid',
          cols: 3,
          cardHeight: 124,
          cards: [
            { badge: 'SPHEREx', title: '102 Infrared Colors', text: 'Maps galaxies, stars, water ice and organic molecules every 6 months.' },
            { badge: 'PLANET X', title: 'Hidden Outer World', text: 'Cold distant planet beyond Neptune glowing faintly in thermal IR.' },
            { badge: 'TEAM PP.AP', title: 'Unified Sky Map', text: 'Combines SPHEREx, Gaia DR3 & AllWISE right on the 360° globe.' },
          ],
        },
        { type: 'tag', text: 'DATA SOURCES · LIVE & AVAILABLE' },
        {
          type: 'cardGrid',
          cols: 3,
          cardHeight: 112,
          cards: [
            { badge: 'SPHEREx', badgeColor: '#8fd3ff', title: 'All-Sky IR Survey', text: '102 bands (0.75–5.0 µm) across the full celestial sphere.' },
            { badge: 'Gaia DR3', badgeColor: '#9be5aa', title: '1.8B Stars Astrometry', text: 'Sub-milli-arcsecond positions & proper-motion vectors.' },
            { badge: 'AllWISE', badgeColor: '#ffb86b', title: '747M Mid-IR Sources', text: '3.4–22 µm cross-match catalog confirming detections.' },
          ],
        },
        {
          type: 'paragraph',
          dim: true,
          text: 'Six infrared detectors each split light into 17 bands = 102 maps. Bands near 3.05 µm trace water ice, 3.3 µm PAH dust, and 4.26 µm CO₂ gas.',
        },
        ...carouselFooter(1, 9),
      ],
    },

    // 03 — GUIDE (secGuide)
    {
      id: 'secGuide',
      navId: 'story',
      title: '03 · Zero-Experience Explorer Guide',
      l: 120,
      b: 20,
      body: [
        { type: 'tag', text: 'ZERO-EXPERIENCE GUIDE · FOR FIRST-TIME EXPLORERS' },
        { type: 'heading', text: 'Your First 5 Minutes With Real Telescope Data' },
        {
          type: 'cardGrid',
          cols: 2,
          cardHeight: 132,
          cards: [
            {
              id: 'go:starmap',
              badge: '01 · SPHEREx GLOBE',
              title: 'Pick a Target in the Sky',
              text: 'Navigate curated Landmarks or 20 Constellations directly on the 360° sphere.',
              skyCrop: { l: 0, b: 0, fov: 30 },
            },
            {
              id: 'story:jump:6',
              badge: '02 · 102 BANDS',
              title: 'See It in 102 IR Colors',
              text: 'Watch CO₂ at 4.26 µm, water ice at 3.05 µm, and PAH dust at 3.3 µm light up.',
              img: 'assets/color_6_4.25um.jpg',
              fx: 0.48,
              fy: 0.52,
            },
            {
              id: 'story:jump:4',
              badge: '03 · TIME-DOMAIN',
              title: 'Watch It Move Across Time',
              text: 'Compare multi-epoch snapshots taken months apart to spot moving stars & Planet X.',
              img: 'assets/field_barnard_0.jpg',
              fx: 0.4968,
              fy: 0.4894,
            },
            {
              id: 'nav:benchmarks',
              badge: '04 · PHOTO GALLERY',
              title: 'Inspect Target Cutouts',
              text: 'Browse all NASA Benchmarks, Landmarks, Comets & Asteroids with real SPHEREx photos.',
              img: 'assets/field_wise0855_0.jpg',
              fx: 0.4934,
              fy: 0.4958,
            },
          ],
        },
        {
          type: 'buttonRow',
          buttons: [
            { id: 'go:starmap', label: 'Open Landmarks →', variant: 'primary' },
            { id: 'nav:constellations', label: 'Open Constellations →', variant: 'primary' },
          ],
        },
        ...carouselFooter(2, 9),
      ],
    },

    // 04 — PLANET X (secPlanetX)
    {
      id: 'secPlanetX',
      navId: 'planetx',
      title: '04 · The Search for Planet X at 450 AU',
      l: pxCoords.l,
      b: pxCoords.b,
      body: [
        { type: 'tag', text: 'NASA CHALLENGE MOTIVATION · HYPOTHETICAL 450 AU MODEL' },
        { type: 'heading', text: 'The Search for Planet X at 450 AU' },
        {
          type: 'heroImage',
          height: 175,
          img: `assets/story_planetx_${pxPass}.jpg`,
          fx: pxMarkerX,
          fy: 0.5,
          zoom: 1.25,
          overlayBadge: `${pxPassLabels[pxPass]}${pxCoadd ? ' · Co-Add 3.6σ SNR' : ''}`,
        },
        {
          type: 'cardGrid',
          cols: 2,
          cardHeight: 82,
          cards: [
            { badge: 'ANNUAL PARALLAX (450 AU)', title: 'π = 458.4″', text: `Epoch: Pass ${pxPass + 1}/4 (${['Jun 2025', 'Dec 2025', 'Jun 2026', 'Dec 2026'][pxPass]})` },
            { badge: 'STACK SNR (D5 & D6)', title: pxCoadd ? '3.6σ (4-Pass Co-Added!)' : '1.8σ → 3.6σ (×√4)', text: '~40–47 K internal Kelvin–Helmholtz heat.' },
          ],
        },
        {
          type: 'buttonRow',
          compact: true,
          buttons: [
            { id: 'px:step', label: `Step 4-Pass Parallax (Pass ${pxPass + 1}/4)`, variant: 'primary' },
            { id: 'px:coadd', label: pxCoadd ? 'Co-Add SNR: ON (3.6σ)' : 'Toggle Multi-Pass Co-Add', variant: 'warm' },
          ],
        },
        {
          type: 'button',
          id: 'bench:planetx',
          label: 'Inspect Planet X Field & Center 360° Sky (RA 63.0°, Dec +18.5°) →',
          variant: 'primary',
          fullWidth: true,
          compact: true,
        },
        ...carouselFooter(3, 9),
      ],
    },

    // 05 — DIFFERENCE IMAGING (secDiff)
    {
      id: 'secDiff',
      navId: 'diff',
      title: '05 · Digital Difference Subtraction: I_B − I_A',
      l: barnardCoords.l,
      b: barnardCoords.b,
      body: [
        { type: 'tag', text: 'TIME-DOMAIN DIFFERENCE IMAGING' },
        { type: 'heading', text: 'Digital Difference Subtraction: I_B − I_A' },
        {
          type: 'heroImage',
          height: 185,
          diff: {
            srcA: 'assets/field_barnard_0.jpg',
            srcB: 'assets/field_barnard_2.jpg',
            gain: diffGain,
            invert: diffInvert,
          },
          overlayBadge: `Difference: Pass 3 − Pass 1 · Gain ${diffGain}× (${diffInvert ? 'Inverted' : 'Standard'})`,
        },
        {
          type: 'kv',
          k: 'Formula:',
          v: `D(x,y) = clamp(128 ${diffInvert ? '−' : '+'} ${diffGain}×(I_B − I_A)) · Stationary stars cancel to 128 gray`,
        },
        {
          type: 'slider',
          id: 'diffGainSlider',
          label: 'Contrast Gain (1× – 10×)',
          displayValue: `${diffGain}×`,
        },
        {
          type: 'buttonRow',
          compact: true,
          buttons: [
            { id: 'diff:invert', label: diffInvert ? 'Contrast: Inverted' : 'Invert Contrast', variant: 'secondary' },
            { id: 'bench:barnard', label: "Inspect Barnard's Star Cutouts →", variant: 'primary' },
          ],
        },
        ...carouselFooter(4, 9),
      ],
    },

    // 06 — BENCHMARKS & LANDMARKS PHOTO GALLERY (secBenchmarks)
    {
      id: 'secBenchmarks',
      navId: 'benchmarks',
      title: '06 · NASA Benchmarks & Landmarks Photo Gallery',
      l: wiseCoords.l,
      b: wiseCoords.b,
      body: [
        { type: 'tag', text: 'ASTROMETRIC VERIFICATION CATALOG · REAL SPHEREx CUTOUT PHOTOS' },
        { type: 'heading', text: 'NASA Benchmark Targets & Landmarks Gallery' },
        {
          type: 'buttonRow',
          compact: true,
          buttons: [
            { id: 'gal:filter:all', label: 'Open Full Photo Gallery (All 29) →', variant: 'warm' },
            { id: 'gal:filter:landmarks', label: 'View All 15 Landmark Photos →', variant: 'primary' },
          ],
        },
        {
          type: 'cardGrid',
          cols: 2,
          cardHeight: 112,
          cards: BENCHMARK_TARGETS_VR.slice(0, 6).map((t) => ({
            id: `bench:${t.id}`,
            badge: t.type,
            title: t.name,
            text: `${t.desc} (RA ${t.ra}°, Dec ${t.dec >= 0 ? '+' : ''}${t.dec}°)`,
            img: t.img,
            fx: t.fx,
            fy: t.fy,
            data: t,
          })),
        },
        ...carouselFooter(5, 9),
      ],
    },

    // 07 — 102 INFRARED COLORS (secColors)
    {
      id: 'secColors',
      navId: 'colors',
      title: '07 · One Sky, 102 Infrared Colors (0.75 – 5.0 µm)',
      l: 60,
      b: 10,
      body: [
        { type: 'tag', text: 'HOW IT SEES · 102 INFRARED COLORS' },
        { type: 'heading', text: 'One Sky, 102 Colors Our Eyes Cannot See' },
        {
          type: 'paragraph',
          text: 'SPHEREx splits near-infrared light into 102 narrow bands across six Linear Variable Filter detectors (D1–D6, 17 bands per detector):',
        },
        { type: 'spectrumStrip' },
        {
          type: 'cardGrid',
          cols: 3,
          cardHeight: 112,
          cards: [
            { badge: 'D1 · 0.75–1.10 µm', badgeColor: '#ff5a5a', title: 'Near-IR', text: 'Starlight, galaxy redshifts, H Paschen lines.' },
            { badge: 'D2 · 1.10–1.63 µm', badgeColor: '#ff8a4a', title: 'J / H-Band', text: 'Cool stars, young stellar objects, PAH 1.4 µm.' },
            { badge: 'D3 · 1.63–2.42 µm', badgeColor: '#ffb559', title: 'K-Band', text: 'Red giants, dust nurseries, H₂ shocks.' },
            { badge: 'D4 · 2.42–3.82 µm', badgeColor: '#f0c25a', title: 'Water-Ice Window', text: 'Water ice at 3.05 µm, PAH 3.3 µm, methanol.' },
            { badge: 'D5 · 3.82–4.42 µm', badgeColor: '#b7c76b', title: 'CO₂ / CO Gas', text: 'CO₂ at 4.26 µm, CO at 4.67 µm in comae.' },
            { badge: 'D6 · 4.42–5.00 µm', badgeColor: '#6eb5c9', title: 'Thermal IR', text: 'Brown dwarfs, warm dust & Planet X glow.' },
          ],
        },
        ...carouselFooter(6, 9),
      ],
    },

    // 08 — 102-BAND SPECTROSCOPY (secSpectro)
    {
      id: 'secSpectro',
      navId: 'colors',
      title: '08 · 102-Band Infrared Spectrophotometry',
      l: epsIndiCoords.l,
      b: epsIndiCoords.b,
      body: [
        { type: 'tag', text: '102-BAND SPECTROSCOPIC EXPLORER · INFRARED ABSORPTION SCAN' },
        { type: 'heading', text: '102 Infrared Bands & Molecular Absorption Lines' },
        {
          type: 'heroImage',
          height: 185,
          img: spectroEntry.u || 'assets/color_6_4.25um.jpg',
          fx: spectroEntry.x ?? 0.48,
          fy: spectroEntry.y ?? 0.52,
          zoom: 1.35,
          overlayBadge: `Wavelength: ${spectroEntry.wl} · ${spectroEntry.b || 'Detector D5 (Infrared Scan)'}`,
        },
        {
          type: 'slider',
          id: 'spectroSlider',
          label: 'Wavelength Band Selector (3.80 – 4.34 µm D5 Scan)',
          displayValue: spectroEntry.wl || '4.25 µm',
        },
        {
          type: 'buttonRow',
          compact: true,
          buttons: [
            { id: 'spectro:step', label: 'Step Next Wavelength Band →', variant: 'primary' },
            { id: 'bench:epsindi', label: 'Inspect Epsilon Indi B →', variant: 'warm' },
          ],
        },
        ...carouselFooter(7, 9),
      ],
    },

    // 09 — CITIZEN SCIENCE (secCitizen)
    {
      id: 'secCitizen',
      navId: 'story',
      title: '09 · Citizen Science & NASA IRSA Cutout Pipeline',
      l: 0,
      b: 0,
      body: [
        { type: 'tag', text: 'CITIZEN SCIENCE PIPELINE · NASA IRSA IPAC' },
        { type: 'heading', text: 'Flag Candidates & Query NASA IRSA Archive' },
        {
          type: 'paragraph',
          text: 'No single research team can inspect billions of pixels. Jump to any astrometric target or inspect real NASA IRSA IPAC Level 2 multi-epoch cutouts:',
        },
        {
          type: 'cardGrid',
          cols: 2,
          cardHeight: 118,
          cards: [
            {
              id: 'bench:wise0855',
              badge: 'ASTROMETRIC SEARCH',
              title: 'WISE 0855-0714',
              text: 'Sub-freezing brown dwarf at 2.28 pc (8.1″/yr drift).',
              img: 'assets/field_wise0855_0.jpg',
              fx: 0.4934,
              fy: 0.4958,
            },
            {
              id: 'bench:rwaur',
              badge: 'VARIABLE STAR',
              title: 'RW Aurigae',
              text: 'T Tauri circumstellar dust occultation target.',
              img: 'assets/field_rwaur_0.jpg',
              fx: 0.4972,
              fy: 0.4962,
            },
            {
              id: 'bench:rdraconis',
              badge: 'PULSATING GIANT',
              title: 'R Draconis',
              text: '245.6-day period Mira variable red giant.',
              img: 'assets/field_rdraconis_0.jpg',
              fx: 0.4971,
              fy: 0.4962,
            },
            {
              id: 'go:data',
              badge: 'IRSA LEVEL 2 ARCHIVE',
              title: 'SPHEREx Mission & Telemetry',
              text: 'Instrument parameters & DOI 10.26131/IRSA629 archive details.',
              skyCrop: { l: 280.2, b: -33.1, fov: 26 },
            },
          ],
        },
        ...carouselFooter(8, 9),
      ],
    },
  ];
}

/** Star Map 3D positions & photo metadata for the 5 Celestial Landmarks. */
export function starMapPoints() {
  return VR_LANDMARKS.map((lm, idx) => {
    const numL = Number(lm.l || 0);
    const numB = Number(lm.b || 0);
    const fieldMatch = (FIELD || []).find((f) => f.id === lm.fieldId) || matchLandmarkField(lm.label);
    const frame0 = fieldMatch && fieldMatch.frames && fieldMatch.frames[0];
    return {
      idx,
      id: lm.id,
      label: lm.label,
      pillLabel: lm.pillLabel || lm.label,
      l: numL,
      b: numB,
      cardTitle: lm.cardTitle || lm.label,
      cardSub: lm.cardSub,
      narration: lm.narration || lm.cardSub,
      audioSrc: lm.audioSrc,
      fieldId: fieldMatch ? fieldMatch.id : null,
      frames: fieldMatch ? fieldMatch.frames : null,
      img: frame0 ? frame0.u : null,
      fx: frame0 ? frame0.x : 0.5,
      fy: frame0 ? frame0.y : 0.5,
      skyCrop: { l: numL, b: numB, fov: 26 },
    };
  });
}

/** Explore: list of landmarks with real SPHEREx photo thumbnails the user can read and travel to. */
export function explorePanelBody(onPick) {
  const pts = starMapPoints();
  const items = [
    { type: 'tag', text: `${pts.length} CELESTIAL LANDMARKS · 360° OBSERVATORY`, align: 'center' },
    { type: 'heading', text: 'Celestial Landmarks Catalog', align: 'center' },
    {
      type: 'paragraph',
      text: 'Look around the 360° sky to see the Landmark pills, or select any Landmark card below to view its SPHEREx photo and fly there:',
      align: 'center',
    },
    {
      type: 'cardGrid',
      cols: 2,
      cardHeight: 120,
      cards: pts.map((p) => ({
        id: 'explore:' + p.idx,
        badge: p.fieldId ? 'SPHEREx CUTOUT' : `GALACTIC l=${p.l}° b=${p.b}°`,
        badgeColor: '#ffb86b',
        title: p.cardTitle || p.label,
        text: p.cardSub ? p.cardSub.split('\n')[0] : p.label,
        img: p.img,
        fx: p.fx,
        fy: p.fy,
        skyCrop: p.skyCrop,
        data: p,
      })),
    },
  ];
  return { items, onPick };
}

/** Detail card for a selected Landmark with its large SPHEREx photo, multi-pass switcher, and audio narration. */
export function landmarkDetailBody(p, passIdx = 0, isPlaying = false) {
  const frames = p.frames || [];
  const activeFrame = frames.length ? frames[passIdx % frames.length] : null;
  const body = [
    { type: 'tag', text: `CELESTIAL LANDMARK · GALACTIC l=${p.l}°, b=${p.b}°`, align: 'center' },
    { type: 'heading', text: p.cardTitle || p.label, align: 'center' },
    {
      type: 'heroImage',
      height: 215,
      img: activeFrame ? activeFrame.u : p.img,
      fx: activeFrame ? activeFrame.x : p.fx,
      fy: activeFrame ? activeFrame.y : p.fy,
      zoom: activeFrame ? 1.65 : 1.0,
      skyCrop: p.skyCrop,
      overlayBadge: activeFrame
        ? `Epoch ${(passIdx % frames.length) + 1}/${frames.length}: ${activeFrame.d} · ${activeFrame.b || ''}`.slice(0, 68)
        : `${p.label} · SPHEREx All-Sky Infrared Map (l=${p.l}°, b=${p.b}°)`,
    },
  ];

  if (frames.length > 1) {
    body.push({
      type: 'buttonRow',
      compact: true,
      buttons: frames.slice(0, 4).map((fr, fIdx) => ({
        id: `landmark:pass:${p.idx}:${fIdx}`,
        label: `Pass ${fIdx + 1} (${fr.d})`,
        variant: (passIdx % frames.length) === fIdx ? 'primary' : 'secondary',
      })),
    });
  }

  body.push(
    { type: 'paragraph', text: p.cardSub || p.narration || p.cardTitle, align: 'center' },
    {
      type: 'buttonRow',
      compact: true,
      buttons: [
        { id: 'travel:' + p.idx, label: 'Center 360° Sky Here →', variant: 'primary' },
        {
          id: 'landmark:audio:' + p.idx,
          label: isPlaying ? '⏸ Pause Narration' : '▶ Play Narration',
          variant: 'warm',
        },
      ],
    },
    {
      type: 'buttonRow',
      compact: true,
      buttons: [
        { id: 'back:starmap', label: '← Back to Landmarks', variant: 'secondary' },
        { id: 'gal:filter:landmarks', label: 'Open Photo Gallery', variant: 'secondary' },
      ],
    }
  );
  return body;
}

/**
 * Full VR Photo Gallery matching desktop `gallery.js` (#gal) + the 5 curated Landmarks!
 * Free of any Comet 3I/ATLAS targets. Categories: 'all', 'landmarks', 'benchmarks'.
 */
export function buildGalleryCatalogBody(filter = 'all') {
  const landmarkCards = starMapPoints().map((p) => ({
    id: `explore:${p.idx}`,
    category: 'landmarks',
    badge: p.fieldId ? 'LANDMARK · CUTOUT' : 'LANDMARK · SKY MAP',
    badgeColor: '#ffb86b',
    title: p.cardTitle || p.label,
    text: p.cardSub ? p.cardSub.split('\n')[0] : p.label,
    img: p.img,
    fx: p.fx,
    fy: p.fy,
    skyCrop: p.skyCrop,
    data: p,
  }));

  // Only include the verified scientific benchmarks (Planet X, WISE 0855, Epsilon Indi B, Barnard's Star, RW Aurigae, R Draconis)
  const allowedBenchmarkIds = new Set(['planetx', 'wise0855', 'epsindi', 'barnard', 'rwaur', 'rdraconis']);
  const fieldCards = (FIELD || []).filter((s) => allowedBenchmarkIds.has(String(s.id || '').toLowerCase())).map((s, idx) => {
    const f0 = (s.frames && s.frames[0]) || {};
    const isBench = (s.tags || []).includes('nasa-benchmark');
    return {
      id: `field:${idx}`,
      category: isBench ? 'benchmarks' : 'solar',
      badge: (s.kind || 'Moving Object').toUpperCase(),
      badgeColor: isBench ? '#ffb86b' : '#9be5aa',
      title: s.name || s.label,
      text: `${s.blurb || ''} (${s.span || ''})`,
      img: f0.u,
      fx: f0.x ?? 0.5,
      fy: f0.y ?? 0.5,
      data: { fieldIdx: idx, series: s },
    };
  });

  const benchmarkCards = fieldCards.filter((c) => c.category === 'benchmarks');

  let visibleCards = [];
  if (filter === 'landmarks') visibleCards = landmarkCards;
  else if (filter === 'benchmarks') visibleCards = benchmarkCards;
  else visibleCards = [...landmarkCards, ...benchmarkCards];

  return [
    { type: 'tag', text: 'SPHEREx PHOTO GALLERY · CELESTIAL LANDMARKS & BENCHMARKS', align: 'center' },
    { type: 'heading', text: 'Gallery of Landmarks & Shifting Celestial Bodies', align: 'center' },
    {
      type: 'buttonRow',
      compact: true,
      buttons: [
        { id: 'gal:filter:all', label: `All (${landmarkCards.length + benchmarkCards.length})`, variant: filter === 'all' ? 'primary' : 'secondary' },
        { id: 'gal:filter:landmarks', label: `Landmarks (${landmarkCards.length})`, variant: filter === 'landmarks' ? 'primary' : 'secondary' },
        { id: 'gal:filter:benchmarks', label: `Benchmarks (${benchmarkCards.length})`, variant: filter === 'benchmarks' ? 'primary' : 'secondary' },
      ],
    },
    {
      type: 'cardGrid',
      cols: 2,
      cardHeight: 118,
      cards: visibleCards,
    },
    {
      type: 'button',
      id: 'back:home',
      label: '← Back to Story 360° Carousel',
      variant: 'secondary',
      compact: true,
    },
  ];
}

/** Detail inspector for any `FIELD` target (Benchmarks, Comets, Asteroids) with multi-pass photo flipping. */
export function fieldTargetDetailBody(series, fieldIdx, passIdx = 0) {
  const frames = series.frames || [];
  const activeFrame = frames[passIdx % Math.max(1, frames.length)] || {};
  const body = [
    { type: 'tag', text: `${(series.kind || 'SPHEREx TARGET').toUpperCase()} · ${series.span || 'MULTI-EPOCH CUTOUT'}` },
    { type: 'heading', text: series.name || series.label },
    {
      type: 'heroImage',
      height: 220,
      img: activeFrame.u,
      fx: activeFrame.x ?? 0.5,
      fy: activeFrame.y ?? 0.5,
      zoom: 1.6,
      overlayBadge: `${activeFrame.d || ''} ${activeFrame.t || ''} · ${activeFrame.b || ''}`.slice(0, 70),
    },
  ];

  if (frames.length > 1) {
    body.push({
      type: 'buttonRow',
      compact: true,
      buttons: frames.slice(0, 4).map((fr, fIdx) => ({
        id: `field:pass:${fieldIdx}:${fIdx}`,
        label: `Frame ${fIdx + 1} (${fr.d})`,
        variant: (passIdx % frames.length) === fIdx ? 'primary' : 'secondary',
      })),
    });
  }

  body.push(
    { type: 'paragraph', text: series.caption || series.blurb || '' },
    {
      type: 'buttonRow',
      compact: true,
      buttons: [
        { id: `field:fly:${fieldIdx}`, label: 'Locate & Center in 360° Sky →', variant: 'primary' },
        { id: 'gal:filter:all', label: '← Back to Photo Gallery', variant: 'secondary' },
      ],
    }
  );
  return body;
}

/** SPHEREx Data: static informational panel from ABOUT + mission facts. */
export function spherexDataPanel() {
  return [
    { type: 'tag', text: 'NASA / JPL-CALTECH · MISSION TELEMETRY' },
    { type: 'heading', text: 'Mission Summary' },
    { type: 'paragraph', text: ABOUT[1] || 'SPHEREx surveys the whole sky in 102 bands of near-infrared light every six months.' },
    { type: 'divider' },
    { type: 'heading', text: 'Instrument' },
    { type: 'kv', k: 'Bands:', v: '102 wavelengths (0.75 – 5.0 µm)' },
    { type: 'kv', k: 'Cadence:', v: 'Complete all-sky map every 6 months' },
    { type: 'kv', k: 'Detectors:', v: '6 linear-variable-filter arrays' },
    { type: 'kv', k: 'Orbit:', v: 'Sun-synchronous, ~700 km altitude' },
    { type: 'divider' },
    { type: 'heading', text: 'Scientific Goals' },
    { type: 'paragraph', text: 'Build a three-dimensional map of hundreds of millions of galaxies to study the early Universe. Trace water ice, CO₂ and organic molecules in star-forming clouds. Hunt for faint moving objects such as a possible distant Planet X.' },
  ];
}

/** Settings sliders — each id is handled by the experience to tweak the live scene. */
export function settingsPanel() {
  return {
    items: [
      { type: 'tag', text: 'VR DISPLAY & LAYER CONTROLS' },
      { type: 'heading', text: 'Visual Settings' },
      { type: 'paragraph', text: 'Drag a slider with pinch or trigger to adjust infrared sky layers and UI opacity. Tip: Press B / Y or click the thumbstick on your VR controller anytime to Reset to Defaults.' },
      { type: 'divider' },
      { type: 'slider', id: 'bgIntensity', label: 'Cosmic Background' },
      { type: 'slider', id: 'starIntensity', label: 'Stars & Galaxies' },
      { type: 'slider', id: 'dustIntensity', label: 'Dust & Gas' },
      { type: 'slider', id: 'uiOpacity', label: 'UI Transparency' },
      { type: 'divider' },
      { type: 'button', id: 'resetSettings', label: 'Reset to Defaults', variant: 'secondary' },
    ],
    defaults: {
      bgIntensity: 0.7,
      starIntensity: 0.4,
      dustIntensity: 0.75,
      uiOpacity: 0.92,
    },
  };
}

/**
 * 20 SPHEREx Constellations with Galactic centroids, guaranteed numeric RA/Dec & IAU code,
 * and tangent-plane 2D diagram points. Never returns undefined for ra, dec, l, b, or code!
 */
export function constellationPoints() {
  return (CONSTELLATIONS || []).map((c, idx) => {
    const stars = Array.isArray(c.stars) && c.stars.length ? c.stars : [['Center', 0, 0]];
    const gal = stars.map(([, ra, dec]) => radecToGal(Number(ra || 0), Number(dec || 0)));
    const vs = gal.map((g) => dir(g.l, g.b, 1));
    const mean = vs.reduce((acc, v) => acc.add(v), new THREE.Vector3()).normalize();

    let l = typeof c.l === 'number' && !Number.isNaN(c.l) ? c.l : null;
    let b = typeof c.b === 'number' && !Number.isNaN(c.b) ? c.b : null;
    if (l === null || b === null) {
      b = (Math.asin(Math.max(-1, Math.min(1, mean.y))) * 180) / Math.PI;
      let pAngle = Math.atan2(mean.z, mean.x);
      if (pAngle < 0) pAngle += 2 * Math.PI;
      l = (((180 - (180 * pAngle) / Math.PI) % 360) + 360) % 360;
    }

    // Compute RA / Dec centroid from stars when not present on the JSON entry
    let ra = typeof c.ra === 'number' && !Number.isNaN(c.ra) ? c.ra : null;
    let dec = typeof c.dec === 'number' && !Number.isNaN(c.dec) ? c.dec : null;
    if (ra === null || dec === null) {
      let sinRa = 0, cosRa = 0, sumDec = 0;
      stars.forEach(([, sRa, sDec]) => {
        const rad = (Number(sRa || 0) * Math.PI) / 180;
        sinRa += Math.sin(rad);
        cosRa += Math.cos(rad);
        sumDec += Number(sDec || 0);
      });
      ra = (((Math.atan2(sinRa, cosRa) * 180) / Math.PI) % 360 + 360) % 360;
      dec = sumDec / stars.length;
    }

    const code = c.code || IAU_CODES[c.name] || String(c.name || 'CON').slice(0, 3).toUpperCase();

    // Tangent-plane projection matching buildMiniSVG() in constellations.js
    const worldUp = new THREE.Vector3(0, 1, 0);
    let east = new THREE.Vector3().crossVectors(worldUp, mean);
    if (east.lengthSq() < 1e-6) east = new THREE.Vector3(1, 0, 0);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(mean, east).normalize();
    const rawPts = vs.map((v) => ({ x: -v.dot(east), y: -v.dot(north) }));
    const xs = rawPts.map((p) => p.x);
    const ys = rawPts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const range = Math.max(maxX - minX, maxY - minY) || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const diagramPts = rawPts.map((p) => ({
      nx: 0.5 + ((p.x - cx) / range) * 0.82,
      ny: 0.5 + ((p.y - cy) / range) * 0.82,
    }));

    return {
      idx,
      code,
      name: c.name || `Constellation ${idx + 1}`,
      ra: Number(ra || 0),
      dec: Number(dec || 0),
      l: Number(l || 0),
      b: Number(b || 0),
      stars,
      edges: Array.isArray(c.edges) ? c.edges : [],
      info: c.info || c.name || '',
      diagramPts,
      skyCrop: { l: Number(l || 0), b: Number(b || 0), fov: 36 },
    };
  });
}

export function constellationDetailBody(c, isPlaying = false) {
  const raVal = Number(c.ra || 0);
  const decVal = Number(c.dec || 0);
  const lVal = Number(c.l || 0);
  const bVal = Number(c.b || 0);
  const coords = `RA ${raVal.toFixed(1)}° · Dec ${decVal >= 0 ? '+' : ''}${decVal.toFixed(1)}° (l=${lVal.toFixed(1)}°, b=${bVal.toFixed(1)}°)`;

  return [
    { type: 'tag', text: `CONSTELLATION (${c.code}) · SPHEREx SKY OVERLAY` },
    {
      type: 'constellationDiagram',
      points: c.diagramPts,
      edges: c.edges,
      starCount: c.stars.length,
      edgeCount: c.edges.length,
      coords,
      audioId: 'const:audio:' + c.idx,
      audioLabel: isPlaying ? '⏸ Pause Narration' : '▶ Play Narration (English)',
    },
    { type: 'heading', text: 'About This Constellation' },
    { type: 'paragraph', text: c.info || c.name },
    { type: 'tag', text: 'CHARTED STARS' },
    {
      type: 'chipList',
      chips: c.stars.map(([name]) => name),
    },
    {
      type: 'buttonRow',
      buttons: [
        { id: 'const:travel:' + c.idx, label: 'Center Sky on ' + c.name, variant: 'primary' },
        { id: 'nav:constellations', label: '← All 20 Constellations', variant: 'secondary' },
      ],
    },
  ];
}
