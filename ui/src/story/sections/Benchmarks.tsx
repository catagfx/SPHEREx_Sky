import ShowcaseSection from '../ShowcaseSection';
import { useFitCard } from '../useFitCard';

// Section 4 — NASA benchmark targets. The card grid (#storyBenchmarkGrid) is filled by
// viewer/story/benchmarks.js (data/benchmark-cards.json), so React renders it empty and never re-renders it.
export default function Benchmarks() {
  const fitRef = useFitCard<HTMLDivElement>();
  return (
    <ShowcaseSection
      id="secBenchmarks"
      title="NASA Benchmark Verification Targets"
      desc="Explore verified astrometric benchmark targets from the challenge specification. Click any target card to glide the 3D celestial sphere directly to its coordinates."
      cardStyle={{ maxWidth: '1200px' }}
    >
      <div className="benchmark-fit" ref={fitRef}>
        <div className="benchmark-grid" id="storyBenchmarkGrid" />
      </div>
    </ShowcaseSection>
  );
}
