import ShowcaseSection from '../ShowcaseSection';

// Section 4 — NASA benchmark targets. The card grid (#storyBenchmarkGrid) is filled by
// viewer/story/benchmarks.js (data/benchmark-cards.json), so React renders it empty and never re-renders it.
export default function Benchmarks() {
  return (
    <ShowcaseSection
      id="secBenchmarks"
      tag="ASTROMETRIC VERIFICATION CATALOG"
      title="NASA Benchmark Verification Targets"
      desc="Explore verified astrometric benchmark targets from the challenge specification. Click any target card to glide the 3D celestial sphere directly to its coordinates."
      cardStyle={{ maxWidth: '1200px' }}
    >
      <div className="benchmark-grid" id="storyBenchmarkGrid" />
    </ShowcaseSection>
  );
}
