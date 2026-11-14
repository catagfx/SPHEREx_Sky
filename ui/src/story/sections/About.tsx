import ShowcaseSection from '../ShowcaseSection';

// Section 2 — plain-language overview of SPHEREx, Planet X, our project, its features and the
// 102-band spectroscopy technique. Pure content; no viewer bindings.
// Two rows of three boxes that fit one screen (one scroll gesture = one section, tests/intro.mjs): keep it short.
export default function About() {
  return (
    <ShowcaseSection
      id="secAbout"
      tag="PROJECT OVERVIEW · WHAT IT IS, WHY IT EXISTS"
      title="A Hands-On Window Into the Infrared Sky"
      desc="What SPHEREx is, what Planet X would be, and why Team PP.AP built this interactive map."
    >
      <div className="about-grid">
        <div className="citizen-box about-card">
          <span className="feature-tag">SPHEREx</span>
          <h3>What the Telescope Does</h3>
          <p className="small">
            A NASA space telescope that maps the whole sky every <strong>six months</strong> in <strong>102 infrared
            colors</strong> our eyes cannot see: galaxies, Milky Way stars, and the <strong>water and organic
            molecules</strong> in the clouds where stars and planets form.
          </p>
        </div>

        <div className="citizen-box about-card">
          <span className="feature-tag">PLANET X</span>
          <h3>The Hidden World We Haven’t Found</h3>
          <p className="small">
            A suspected <strong>distant planet beyond Neptune</strong>, nicknamed <em>Planet X</em>. Far-flung orbits
            hint at it, but nobody has seen it: so cold and far away, it would glow only faintly in infrared,
            exactly what SPHEREx sees.
          </p>
        </div>

        <div className="citizen-box about-card">
          <span className="feature-tag">THE PROJECT</span>
          <h3>Built by Team PP.AP</h3>
          <p className="small">
            A sky map you explore yourself: <strong>SPHEREx, Gaia and WISE</strong> data in one place, a hunt for
            Planet X clues, and whatever you find shown right on the map, even in VR. No astronomy background needed.
          </p>
        </div>
      </div>

      <div className="data-sources" aria-label="Data sources used in this project">
        <span className="feature-tag">DATA SOURCES · LIVE &amp; AVAILABLE</span>
        <div className="data-sources-grid">
          <div className="data-source-card ds-spherex">
            <div className="ds-badge">SPHEREx</div>
            <div className="ds-body">
              <strong>All-sky infrared survey</strong>
              <p className="small">102 bands, 0.75 – 5.0 µm. The globe behind you and every cutout in the map.</p>
            </div>
          </div>
          <div className="data-source-card ds-gaia">
            <div className="ds-badge">Gaia DR3</div>
            <div className="ds-body">
              <strong>Astrometry &amp; proper motion</strong>
              <p className="small">1.8 billion stars with sub-milli-arcsecond positions. Overlaid on any cutout — one click in the explorer.</p>
            </div>
          </div>
          <div className="data-source-card ds-wise">
            <div className="ds-badge">WISE / AllWISE</div>
            <div className="ds-body">
              <strong>Cross-match catalog</strong>
              <p className="small">747 million mid-infrared sources (3.4 – 22 µm). Confirms SPHEREx detections — same button, same panel.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="about-lists">
        <div className="citizen-box">
          <span className="feature-tag">WHAT YOU CAN DO</span>
          <h3>Features</h3>
          <ul className="about-list">
            <li>Search for signs of Planet X yourself.</li>
            <li>See constellations drawn on the sky map.</li>
            <li>Step inside the sky in VR.</li>
            <li>Query combined Gaia and WISE data.</li>
            <li>Learn what each infrared color reveals.</li>
          </ul>
        </div>

        <div className="citizen-box">
          <span className="feature-tag">WHY IT’S DIFFERENT</span>
          <h3>Advantages</h3>
          <ul className="about-list">
            <li>Real telescope data, not artist illustrations.</li>
            <li>Every term explained in plain language.</li>
            <li>SPHEREx, Gaia and WISE in one place.</li>
            <li>Your discoveries appear right on the map.</li>
            <li>You move inside the sky, not a static image.</li>
          </ul>
        </div>

        <div className="citizen-box">
          <span className="feature-tag">HOW IT WORKS · 102 BANDS</span>
          <h3>Why One Sky Becomes 102 Maps</h3>
          <p className="small about-tech-body">
            Six infrared detectors each split the light into <strong>17 bands</strong>: <strong>102 maps</strong> of
            the same sky. Every substance leaves its own light <em>fingerprint</em>: bands near <strong>3.3 µm</strong>{' '}
            show star-forming dust, near <strong>4 µm</strong> hot hydrogen gas; others trace water ice, CO₂, CO and
            methanol.
          </p>
        </div>
      </div>
    </ShowcaseSection>
  );
}
