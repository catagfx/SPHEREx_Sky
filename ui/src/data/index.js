// Curated SPHEREx datasets used by the viewer (6 NASA benchmark targets + Planet X).
import benchmarkField from './field/benchmarks.json';
import cometEpochs from './comet-epochs.json';
import cometColors from './comet-colors.json';
import landmarks from './landmarks.json';
import constellations from './constellations.json';

/** All-sky textures of the globe: stars & galaxies, dust & gas. */
export const SKY_STARS = 'assets/sky_stars.jpg';
export const SKY_DUST = 'assets/sky_dust.jpg';

/** Primary multi-epoch series on each observation date: { d, b, u, x, y, f, note }. */
export const EPOCHS = cometEpochs;

/**
 * Fixed-field series ("Watch it move"): the 6 NASA benchmark stars, brown dwarfs, variable stars, and Planet X.
 * Order matters (gallery order, default series). Targets ingested at runtime are pushed onto this array.
 */
export const FIELD = [...benchmarkField];

/** Multi-band spectrophotometric images across detectors D1–D6: { wl, d, t, f, x, y, b, u, det }. */
export const COLORS = cometColors;

/** Landmarks on the globe: [label, galactic l, galactic b, card title, card text, tour narration]. */
export const LANDMARKS = landmarks;

/** 20 SPHEREx Constellations (J2000 equatorial & Galactic centroids): [{ code, name, ra, dec, l, b, stars, edges, info }]. */
export const CONSTELLATIONS = constellations;

export const ABOUT = [
  'About SPHEREx SKY',
  "SPHEREx launched in March 2025. It maps the whole sky in 102 colors of near-infrared light (0.75 to 5.0 µm) every six months, making four all-sky maps in its two-year primary mission. The data are public through NASA's IRSA archive.",
];
