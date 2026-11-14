import ShowcaseSection from '../ShowcaseSection';

// Section 6 — citizen-science discovery centre. Inputs are uncontrolled (defaultValue) because
// viewer/story/citizen.js reads / writes their values directly.
const FLAG_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);
const MAIL_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
  </svg>
);

export default function Citizen() {
  return (
    <ShowcaseSection
      id="secCitizen"
      tag="CITIZEN SCIENCE PIPELINE"
      title="Flag Candidates & Submit Discoveries to NASA"
      desc="No single research team can inspect billions of pixels. Use our astrometric search or report a candidate object directly to generate a standardized JSON discovery dossier."
    >
      <div className="citizen-actions-panel">
        <div className="citizen-box">
          <h3>Astrometric Coordinate Search</h3>
          <p className="small">Enter celestial coordinates in decimal degrees or sexagesimal notation:</p>
          <div className="search-inputs" style={{ marginTop: '10px' }}>
            <input type="text" id="storyRaInput" className="coord-input" placeholder="RA (e.g. 133.795°)" />
            <input type="text" id="storyDecInput" className="coord-input" placeholder="Dec (e.g. -7.245°)" />
          </div>
          <button className="b pri" id="storyCoordSearchBtn" style={{ marginTop: '12px', width: '100%' }}>
            Center 360° Globe on Coordinates
          </button>
        </div>

        <div className="citizen-box">
          <h3>Report Anomaly / Candidate</h3>
          <p className="small">Export a verifiable discovery dossier formatted for the SPHEREx mission team archive.</p>
          <button className="hero-btn primary" id="storyFlagBtn" style={{ marginTop: '20px', width: '100%', justifyContent: 'center' }}>
            {FLAG_ICON}
            <span>Generate Candidate Dossier</span>
          </button>
        </div>

        <div
          className="citizen-box"
          style={{
            gridColumn: '1 / -1',
            borderColor: 'rgba(255,184,107,0.45)',
            background: 'linear-gradient(135deg, rgba(16,24,46,0.92), rgba(28,22,42,0.88))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
            <h3 style={{ margin: 0, color: '#ffb86b' }}>On-Demand NASA IRSA IPAC Cutout &amp; Email Service</h3>
            <span className="feature-tag" style={{ margin: 0 }}>POWERED BY find_and_cut_movers.py</span>
          </div>
          <p className="small">
            Submit any sky coordinates (RA &amp; Dec) and your email address. Our backend queries the NASA IRSA IPAC SPHEREx Level 2 archive, performs WCS tangent-plane reprojection &amp; zodiacal light subtraction, and sends the processed multi-epoch cutouts, animated blink GIF, and FITS files to your email and directly to this page:
          </p>
          <div className="search-inputs" style={{ marginTop: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <input type="text" id="storyIrsaRa" className="coord-input" placeholder="RA (e.g. 133.795° or 08h 55m 10s)" defaultValue="133.795" />
            <input type="text" id="storyIrsaDec" className="coord-input" placeholder="Dec (e.g. -7.245° or -07° 14′ 43″)" defaultValue="-7.245" />
            <input type="text" id="storyIrsaName" className="coord-input" placeholder="Object label (e.g. WISE 0855)" defaultValue="WISE 0855-0714" />
            <input type="email" id="storyIrsaEmail" className="coord-input" placeholder="Your email (e.g. astronomer@domain.com)" />
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
            <button className="hero-btn primary" id="storyIrsaSubmitBtn" style={{ flex: 1, justifyContent: 'center' }}>
              {MAIL_ICON}
              <span>Process from IRSA &amp; Send to Email</span>
            </button>
            <button className="b sec" id="storyOpenIrsaModalBtn">Open Full IRSA Cutout Studio →</button>
          </div>
        </div>
      </div>
    </ShowcaseSection>
  );
}
