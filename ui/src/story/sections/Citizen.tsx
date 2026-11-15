import ShowcaseSection from '../ShowcaseSection';
import { useFitCard } from '../useFitCard';

// Section 6 — citizen-science discovery centre. Inputs are uncontrolled (defaultValue) because
// viewer/story/citizen.js reads / writes their values directly.
export default function Citizen() {
  const fitRef = useFitCard<HTMLDivElement>();
  return (
    <ShowcaseSection
      id="secCitizen"
      title="Flag Candidates & Submit Discoveries to NASA"
      desc="No single research team can inspect billions of pixels. Use our astrometric search or report a candidate object directly to generate a standardized JSON discovery dossier."
    >
      <div className="citizen-actions-panel" ref={fitRef}>
        <div className="citizen-box">
          <h3>Astrometric Coordinate Search</h3>
          <p className="small">Enter celestial coordinates in decimal degrees or sexagesimal notation:</p>
          <div className="search-inputs" >
            <input type="text" id="storyRaInput" aria-label="Right ascension" className="coord-input" placeholder="RA (e.g. 133.795°)" />
            <input type="text" id="storyDecInput" aria-label="Declination" className="coord-input" placeholder="Dec (e.g. -7.245°)" />
          </div>
          <button className="b pri" id="storyCoordSearchBtn">
            Center 360° Globe on Coordinates
          </button>
        </div>

        <div className="citizen-box">
          <h3>Report Anomaly / Candidate</h3>
          <p className="small">Export a verifiable discovery dossier formatted for the SPHEREx mission team archive.</p>
          <button className="b pri" id="storyFlagBtn">Generate Candidate Dossier</button>
        </div>

        <div className="citizen-box citizen-wide">
          <h3>On-Demand NASA IRSA IPAC Cutout &amp; Email Service</h3>
          <p className="small">
            Submit any sky coordinates (RA &amp; Dec) and your email address. Our backend queries the NASA IRSA IPAC SPHEREx Level 2 archive, performs WCS tangent-plane reprojection &amp; zodiacal light subtraction, and sends the processed multi-epoch cutouts, animated blink GIF, and FITS files to your email and directly to this page:
          </p>
          <div className="search-inputs" style={{ marginTop: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <input type="text" id="storyIrsaRa" aria-label="Right ascension" className="coord-input" placeholder="RA (e.g. 133.795° or 08h 55m 10s)" defaultValue="133.795" />
            <input type="text" id="storyIrsaDec" aria-label="Declination" className="coord-input" placeholder="Dec (e.g. -7.245° or -07° 14′ 43″)" defaultValue="-7.245" />
            <input type="text" id="storyIrsaName" aria-label="Object label" className="coord-input" placeholder="Object label (e.g. WISE 0855)" defaultValue="WISE 0855-0714" />
            <input type="email" id="storyIrsaEmail" aria-label="Your email" className="coord-input" placeholder="Your email (e.g. astronomer@domain.com)" />
          </div>
          <div className="citizen-irsa-actions">
            <button className="b pri" id="storyIrsaSubmitBtn">Process from IRSA &amp; Send to Email</button>
            <button className="b sec" id="storyOpenIrsaModalBtn">Open Full IRSA Cutout Studio</button>
          </div>
        </div>
      </div>
    </ShowcaseSection>
  );
}
