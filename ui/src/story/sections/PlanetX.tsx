import ShowcaseSection from '../ShowcaseSection';

// Section 2 — The hunt for Planet X at 450 AU.
// Element ids are driven by viewer/story/planetx.js (play / co-add / open-workbench handlers).
const METRICS: Array<{ label: string; value: string; id?: string }> = [
  { label: 'Annual Parallax (450 AU)', value: 'π = 458.4″' },
  { label: 'Equilibrium Temp.', value: '~40–47 K (Internal Heat)' },
  { label: 'Primary Bands', value: 'D5 & D6 (3.8–5.0 µm)' },
  { label: 'Per-Detector Stack SNR', value: '1.8σ → 3.6σ (×√4 Passes)', id: 'storyPxSnr' },
];

export default function PlanetX() {
  return (
    <ShowcaseSection
      id="secPlanetX"
      tag="NASA CHALLENGE MOTIVATION · HYPOTHETICAL 450 AU MODEL"
      title="The Search for Planet X at 450 AU (Illustrative Model)"
      desc="An outer Neptune-mass planet at 450 AU reflects virtually no sunlight (proportional to 1/r⁴ geometric loss; pure solar equilibrium ~13 K). Internal Kelvin–Helmholtz core heating warms it to ~40–47 K in thermal infrared, while Earth’s orbit induces an annual reflex parallax of π = 206,265″/450 ≈ 458.4″ across 6-month survey passes."
    >
      <div className="showcase-interactive">
        <div className="preview-media" id="storyPxMedia">
          <img src="assets/story_planetx_0.jpg" id="storyPxImg" alt="Planet X search field multi-epoch frame" />
          <div className="target-marker" id="storyPxMarker" style={{ left: '37.9%', top: '50.0%' }} />
          <div className="preview-overlay-badge" id="storyPxPassBadge">Pass 1: June 2025 (450 AU Model)</div>
        </div>
        <div className="showcase-controls">
          <div className="control-row">
            <button className="b pri" id="storyPxPlayBtn">Play 4-Pass Parallax Motion</button>
            <button className="b sec" id="storyPxCoaddBtn">Toggle Multi-Pass Band Co-Add (×√N SNR)</button>
          </div>
          <div className="metric-grid">
            {METRICS.map((m) => (
              <div className="metric-pill" key={m.label}>
                <span>{m.label}</span>
                <strong id={m.id}>{m.value}</strong>
              </div>
            ))}
          </div>
          <button className="b accent full-w" id="storyPxOpenFull">Inspect Search Field in Time-Domain Workbench →</button>
        </div>
      </div>
    </ShowcaseSection>
  );
}
