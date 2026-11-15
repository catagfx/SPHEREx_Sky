import ShowcaseSection from '../ShowcaseSection';
import { useFitCard } from '../useFitCard';
import { useSliderDots } from '../useSliderDots';

// Section 5 — 102-band infrared spectroscopy across SPHEREx's 6 detectors (0.75–5.0 µm).
export default function Spectro() {
  const fitRef = useFitCard<HTMLDivElement>();
  useSliderDots('storyWavelengthSlider', 6); // 7 wavelengths
  return (
    <ShowcaseSection
      id="secSpectro"
      title="102-Band Infrared Spectrophotometry (0.75 – 5.0 µm)"
      desc="SPHEREx's Linear Variable Filters split the sky into 102 spectral channels across six detector arrays (D1–D6), isolating water-ice absorption (3.1 µm), brown dwarf methane bands, and vibrational molecular features at 4.26 µm."
    >
      <div className="showcase-interactive" ref={fitRef}>
        <div className="preview-media">
          <img src="assets/color_6_4.25um.jpg" id="storySpectroImg" alt="SPHEREx spectroscopy cutout" />
          <div className="preview-overlay-badge" id="storyWavelengthBadge">Wavelength: 4.26 µm (Detector D5 Peak)</div>
        </div>
        <div className="showcase-controls">
          <div className="diff-gain">
            <label htmlFor="storyWavelengthSlider">Infrared Wavelength</label>
            <input type="range" id="storyWavelengthSlider" min="0" max="6" defaultValue="6" />
            <span className="diff-gain-val" id="storyWlLabel">4.26 µm (Detector D5)</span>
          </div>
          <div className="control-row diff-actions">
            <button className="b pri" id="storyPlaySpectro">Play Color Scan</button>
            <button className="b sec" id="storyOpenSpectroFull">Full Spectral Graph</button>
          </div>
        </div>
      </div>
    </ShowcaseSection>
  );
}
