import { useMemo, useState } from 'react';
import ShowcaseSection from '../ShowcaseSection';

// Section — SPHEREx's 102 infrared bands made tangible. A horizontal strip of 102 colored bars across
// 0.75 – 5.0 µm (one bar per band), plus the six detectors (D1 – D6) with their wavelength ranges and
// the molecules / scenes each one reveals. Hovering a bar shows the exact wavelength + the matching
// detector. Pure frontend: numbers are the public SPHEREx mission facts, no backend hook needed.

interface Detector {
  id: string;
  low: number;
  high: number;
  title: string;
  signatures: string;
  swatch: string;
}

const DETECTORS: Detector[] = [
  { id: 'D1', low: 0.75, high: 1.10, title: 'Near-IR', signatures: 'Starlight, galaxy shapes, hydrogen Paschen lines.', swatch: '#ff5a5a' },
  { id: 'D2', low: 1.10, high: 1.63, title: 'J / H-band', signatures: 'Cool stars, young stellar objects, PAH 1.4 µm.', swatch: '#ff8a4a' },
  { id: 'D3', low: 1.63, high: 2.42, title: 'K-band', signatures: 'Red giants, dust-embedded nurseries, H₂ shocks.', swatch: '#ffb559' },
  { id: 'D4', low: 2.42, high: 3.82, title: 'Water-ice window', signatures: 'Ice at 3.05 µm, PAH 3.3 µm, methanol, HCN.', swatch: '#f0c25a' },
  { id: 'D5', low: 3.82, high: 4.42, title: 'CO₂ / CO gas', signatures: 'CO₂ at 4.26 µm, CO at 4.67 µm — comet comae light up here.', swatch: '#b7c76b' },
  { id: 'D6', low: 4.42, high: 5.00, title: 'Thermal IR', signatures: 'Brown dwarfs, hidden warm dust, Planet X candidate glow.', swatch: '#6eb5c9' },
];

const BAND_COUNT = 102;

// Map a wavelength (0.75 – 5.0 µm) to a plausible visualization colour: warm red at the short end,
// cool infrared teal at the long end — purely illustrative, infrared is invisible by definition.
function bandColor(wl: number): string {
  const t = (wl - 0.75) / (5.0 - 0.75);
  // deep red → orange → yellow → warm → dusky teal
  const r = Math.round(255 * Math.max(0, 1 - 0.65 * t));
  const g = Math.round(255 * Math.max(0, Math.min(1, 1.3 * (1 - Math.abs(t - 0.45) * 1.8))));
  const b = Math.round(255 * Math.max(0, (t - 0.55) * 1.5));
  return `rgb(${r}, ${g}, ${b})`;
}

function detectorFor(wl: number): Detector {
  return DETECTORS.find((d) => wl >= d.low && wl <= d.high) ?? DETECTORS[DETECTORS.length - 1];
}

export default function Colors() {
  const bands = useMemo(() => {
    const step = (5.0 - 0.75) / (BAND_COUNT - 1);
    return Array.from({ length: BAND_COUNT }, (_, i) => {
      const wl = 0.75 + i * step;
      return { wl, color: bandColor(wl), detector: detectorFor(wl).id };
    });
  }, []);

  const [hover, setHover] = useState<number | null>(null);
  const hoverBand = hover !== null ? bands[hover] : null;
  const hoverDet = hoverBand ? detectorFor(hoverBand.wl) : null;

  return (
    <ShowcaseSection
      id="secColors"
      tag="HOW IT SEES · 102 INFRARED COLORS"
      title="One sky, 102 colors our eyes cannot see"
      desc="SPHEREx splits near-infrared light into 102 narrow bands between 0.75 and 5.0 microns. Each band is sensitive to a different substance — water ice, carbon dioxide, hot hydrogen, cosmic dust. Hover a band to see what it reveals."
    >
      <div className="ir-spectrum-wrap">
        <div className="ir-spectrum-strip" role="group" aria-label="102 SPHEREx spectral bands from 0.75 to 5.0 microns">
          {bands.map((b, i) => (
            <div
              key={i}
              className="ir-band"
              style={{ background: b.color }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              aria-label={`Band ${i + 1}: ${b.wl.toFixed(2)} µm, detector ${b.detector}`}
              title={`${b.wl.toFixed(2)} µm · ${b.detector}`}
            />
          ))}
        </div>
        <div className="ir-scale" aria-hidden="true">
          <span>0.75 µm</span>
          <span>1.63 µm</span>
          <span>2.42 µm</span>
          <span>3.82 µm</span>
          <span>4.42 µm</span>
          <span>5.00 µm</span>
        </div>

        <div className="ir-readout" aria-live="polite">
          {hoverBand && hoverDet ? (
            <>
              <strong>Band #{(hover ?? 0) + 1} · {hoverBand.wl.toFixed(2)} µm</strong>{' '}
              · Detector {hoverDet.id} ({hoverDet.title}) — {hoverDet.signatures}
            </>
          ) : (
            <>Each SPHEREx detector carries a <strong>linear variable filter</strong> that picks out <strong>17 narrow bands</strong>. Six detectors × 17 = <strong>102 maps of the same sky</strong>.</>
          )}
        </div>

        <div className="ir-detectors">
          {DETECTORS.map((d) => (
            <div key={d.id} className="ir-det">
              <div className="ir-det-head">
                <span className="ir-det-id" style={{ background: d.swatch }}>{d.id}</span>
                <span className="ir-det-range">{d.low.toFixed(2)} – {d.high.toFixed(2)} µm</span>
              </div>
              <h4 className="ir-det-title">{d.title}</h4>
              <p className="ir-det-sig">{d.signatures}</p>
            </div>
          ))}
        </div>
      </div>
    </ShowcaseSection>
  );
}
