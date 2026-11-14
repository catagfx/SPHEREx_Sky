import { FIELD, EPOCHS, COLORS } from '../../data';

// State of the "See it change" explorer (#chg), shared by its five modes:
//   S  swipe two comet dates      F  flip through the comet dates      (explorer/epochs.js)
//   M  watch a fixed field move   D  difference B − A                 (series.js, difference.js)
//   C  scan the colors / spectrum                                       (spectrum.js)

const NE = EPOCHS.length;

// brightest comet color channel = the CO₂ band, shown first
let brightest = 0;
COLORS.forEach((e, i) => { if (e.f > COLORS[brightest].f) brightest = i; });

export const st = {
  mode: 'S',

  // S / F: comet epochs (indices into EPOCHS)
  ia: Math.max(0, NE - 2), // swipe: left image (A)
  ib: NE - 1,              // swipe: right image (B)
  cur: NE - 1,             // flip: current date
  pos: 50,                 // swipe divider, percent
  side: 0,                 // which of A / B the next timeline click sets

  // M / D: fixed-field series (index into FIELD) and frame
  si: 0,
  fi: 0,
  FR: FIELD[0].frames,     // frames of the selected series
  FN: FIELD[0].frames.length, // usable frames (Data Releases can cap it)

  // C: spectrum channel
  ci: brightest,
  CN: COLORS.length,

  // D: difference images
  ida: 0,
  idb: 1,
  diffGain: 2,
  diffInvert: false,

  // play buttons (setInterval ids)
  timers: { flip: null, motion: null, scan: null },
};

/** The selected fixed-field series (a FIELD entry). */
export const series = () => FIELD[st.si];
