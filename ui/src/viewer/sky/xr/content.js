import { LANDMARKS, ABOUT } from '../../../data';

// Content templates for the holographic panels. Keeps the VR module focused on interaction and
// uses the existing SPHEREx data (landmarks.json, ABOUT blurb) as the source of truth.

/** Explore: list of landmarks the user can read and travel to. */
export function explorePanelBody(onPick) {
  const items = [
    { type: 'heading', text: 'Celestial Catalog' },
    { type: 'paragraph', text: 'Pinch a destination to open its science card. Pinch again on Travel to move the sky to it.' },
    { type: 'divider' },
  ];
  LANDMARKS.forEach(([label, l, b, cardTitle, cardSub], idx) => {
    items.push({
      type: 'listItem',
      id: 'explore:' + idx,
      title: label,
      sub: cardSub || cardTitle || (`l=${l}°  b=${b}°`),
      data: { idx, label, l, b, cardTitle, cardSub },
    });
  });
  return { items, onPick };
}

/** SPHEREx Data: static informational panel from ABOUT + mission facts. */
export function spherexDataPanel() {
  return [
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
    { type: 'divider' },
    { type: 'heading', text: 'Data Source' },
    { type: 'paragraph', text: 'All imagery shown here is derived from NASA / JPL-Caltech and NASA / IPAC IRSA Level 2 Quick Release products (DOI: 10.26131/IRSA629).' },
  ];
}

/** Settings sliders — each id is handled by the experience to tweak the live scene. */
export function settingsPanel() {
  return {
    items: [
      { type: 'heading', text: 'Visual Settings' },
      { type: 'paragraph', text: 'Drag a slider with pinch to adjust. These only affect the VR view.' },
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
      uiOpacity: 0.86,
    },
  };
}

/** Star Map 3D positions use the landmarks (galactic l/b). Converted to 3D by the starmap module. */
export function starMapPoints() {
  return LANDMARKS.map(([label, l, b, cardTitle, cardSub], idx) => ({
    idx, label, l: +l, b: +b, cardTitle, cardSub,
  }));
}
