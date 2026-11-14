import ShowcaseSection from '../ShowcaseSection';

// Section 5 — 102-band infrared spectroscopy across SPHEREx's 6 detectors (0.75–5.0 µm).
export default function Spectro() {
  return (
    <ShowcaseSection
      id="secSpectro"
      tag="102-BAND SPECTROSCOPIC EXPLORER"
      title="102-Band Infrared Spectrophotometry (0.75 – 5.0 µm)"
      desc="SPHEREx's Linear Variable Filters split the sky into 102 spectral channels across six detector arrays (D1–D6), isolating water-ice absorption (3.1 µm), brown dwarf methane bands, and vibrational molecular features at 4.26 µm."
    >
      <div className="showcase-interactive">
        <div className="preview-media">
          <img src="assets/color_6_4.25um.jpg" id="storySpectroImg" alt="SPHEREx spectroscopy cutout" />
          <div className="preview-overlay-badge" id="storyWavelengthBadge">Wavelength: 4.26 µm (Detector D5 Peak)</div>
        </div>
        <div className="showcase-controls">
          <label htmlFor="storyWavelengthSlider">
            Infrared Wavelength: <strong id="storyWlLabel" style={{ color: 'var(--warm)' }}>4.26 µm (Detector D5)</strong>
          </label>
          <input type="range" id="storyWavelengthSlider" min="0" max="6" defaultValue="6" style={{ width: '100%' }} />
          <div className="control-row" style={{ marginTop: '14px' }}>
            <button className="b pri" id="storyPlaySpectro">Play Color Scan</button>
            <button className="b sec" id="storyOpenSpectroFull">Full Spectral Graph →</button>
          </div>
        </div>
      </div>
    </ShowcaseSection>
  );
}
