import ShowcaseSection from '../ShowcaseSection';

// Section 3 — digital difference imaging (I_B − I_A). The canvas is painted by viewer/story/difference.js.
export default function Diff() {
  return (
    <ShowcaseSection
      id="secDiff"
      tag="TIME-DOMAIN DIFFERENCE IMAGING"
      title="Digital Difference Subtraction: I_B − I_A"
      desc="Stationary background stars cancel completely to neutral mid-gray (128 flux level). Moving Kuiper Belt bodies, high proper-motion stars, and transient flares emerge as high-contrast dipolar flux signatures."
    >
      <div className="showcase-interactive">
        <div className="preview-media">
          <canvas
            id="storyDiffCanvas"
            width={540}
            height={400}
            style={{ borderRadius: '14px', background: '#808080' }}
          />
          <div className="preview-overlay-badge" id="storyDiffBadge">Difference: Pass 4 − Pass 1 (Gain 4×)</div>
        </div>
        <div className="showcase-controls">
          <div className="control-row">
            <label htmlFor="storyDiffGain">Contrast Gain: <span id="storyDiffGainVal">4×</span></label>
            <input type="range" id="storyDiffGain" min="1" max="10" defaultValue="4" />
          </div>
          <div className="control-row">
            <button className="b sec" id="storyDiffInvert">Invert Contrast</button>
            <button className="b pri" id="storyDiffOpenFull">Open Difference Workbench →</button>
          </div>
          <p className="small" style={{ marginTop: '8px' }}>
            Difference formula: D(x,y) = clamp(128 + gain × (I_B − I_A)). Perfectly matched stationary stars cancel to 128 gray, making target displacement immediately obvious.
          </p>
        </div>
      </div>
    </ShowcaseSection>
  );
}
