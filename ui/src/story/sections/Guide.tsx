import ShowcaseSection from '../ShowcaseSection';

// Section — a plain-language "how to use the data" guide for visitors who have never opened a FITS
// file in their life. Four steps, each paired with a button that clicks the real header control for
// them, so they land straight in the tool with no searching. Pure frontend: the buttons just forward
// to the existing viewer actions wired in ui/src/viewer/navigation.js.

function trigger(id: string) {
  const el = document.getElementById(id);
  if (el) el.click();
}

export default function Guide() {
  return (
    <ShowcaseSection
      id="secGuide"
      tag="ZERO-EXPERIENCE GUIDE · FOR FIRST-TIME EXPLORERS"
      title="Your first 5 minutes with real telescope data"
      desc="Never opened a FITS file, never heard of Gaia DR3? That's exactly who this is for. Four steps, one button per step — each one opens the tool for you, no searching needed."
    >
      <div className="guide-grid">
        <article className="guide-step">
          <div className="guide-step-head">
            <span className="guide-step-num">01</span>
            <span className="guide-step-source">SPHEREx</span>
          </div>
          <h3>Pick a target in the sky</h3>
          <p>
            Open the 360° globe and choose how you want to navigate: 11 curated <strong>Landmarks</strong>,
            20 <strong>Constellations</strong>, or type exact <strong>RA / Dec</strong> coordinates.
            You're always one click away from a labelled piece of the real SPHEREx all-sky map.
          </p>
          <div className="guide-actions">
            <button type="button" className="guide-btn" onClick={() => trigger('tabLandmarks')}>Open Landmarks →</button>
            <button type="button" className="guide-btn" onClick={() => trigger('tabConstellations')}>Open Constellations →</button>
            <button type="button" className="guide-btn ghost" onClick={() => trigger('searchBtn')}>Search RA/Dec →</button>
          </div>
        </article>

        <article className="guide-step">
          <div className="guide-step-head">
            <span className="guide-step-num">02</span>
            <span className="guide-step-source">SPHEREx · 102 bands</span>
          </div>
          <h3>See it in 102 infrared colors</h3>
          <p>
            SPHEREx splits light into <strong>102 narrow wavelength bands</strong> between 0.75 and 5.0 µm.
            Open the <em>Color Scan</em> and watch hidden gas light up — <strong>CO₂ at 4.26 µm</strong>,
            water ice at 3.05 µm, PAH dust at 3.3 µm. Each slider position = one real SPHEREx band.
          </p>
          <div className="guide-actions">
            <button type="button" className="guide-btn" onClick={() => trigger('tabColors')}>Open the color scan →</button>
          </div>
        </article>

        <article className="guide-step">
          <div className="guide-step-head">
            <span className="guide-step-num">03</span>
            <span className="guide-step-source">SPHEREx · time-domain</span>
          </div>
          <h3>Watch it move across time</h3>
          <p>
            Two snapshots of the same patch of sky taken months apart. The target shifts, the background
            stars don't. That's how comets, asteroids and a potential <strong>Planet X</strong> betray
            themselves. The viewer has 5 modes: swipe, flip, difference, follow-the-motion, color-scan.
          </p>
          <div className="guide-actions">
            <button type="button" className="guide-btn" onClick={() => trigger('chb')}>Open time-domain viewer →</button>
          </div>
        </article>

        <article className="guide-step">
          <div className="guide-step-head">
            <span className="guide-step-num">04</span>
            <span className="guide-step-source">Gaia DR3 · AllWISE</span>
          </div>
          <h3>Cross-check with Gaia + WISE</h3>
          <p>
            Inside the time-domain viewer, tick <strong>“Gaia + WISE Overlay”</strong>. ESA Gaia DR3
            (<strong>1.8 billion stars</strong>, sub-milli-arcsecond positions) and NASA AllWISE
            (<strong>747 million</strong> mid-infrared sources) are drawn on top of the SPHEREx cutout.
            If a dot has a match in both, it's a known star. If only SPHEREx sees it — you may have
            found a mover.
          </p>
          <div className="guide-actions">
            <button type="button" className="guide-btn" onClick={() => trigger('chb')}>Jump in &amp; toggle the overlay →</button>
          </div>
        </article>
      </div>

      <div className="guide-footnote">
        <strong>No login, no download, no setup.</strong> Every dataset is public —
        SPHEREx via <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noopener">NASA/IPAC IRSA</a>,
        Gaia via <a href="https://gea.esac.esa.int/archive/" target="_blank" rel="noopener">ESA Gaia Archive</a>,
        WISE via <a href="https://irsa.ipac.caltech.edu/Missions/wise.html" target="_blank" rel="noopener">IPAC WISE</a>.
        You can grab the raw FITS files yourself from the links inside each viewer.
      </div>
    </ShowcaseSection>
  );
}
