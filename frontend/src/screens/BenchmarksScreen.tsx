import { EncodingLegendStrip } from '../components/VisualEncodings';
import { STRINGS } from '../strings';
import type { RoutePath } from '../types';

interface BenchmarksScreenProps {
  isOffline: boolean;
  onNavigate: (route: RoutePath) => void;
}

export function BenchmarksScreen({ isOffline, onNavigate }: BenchmarksScreenProps) {
  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-6 border-b border-[#E3DFD7]">
        <div>
          <p className="text-xs font-medium text-[#524F49]">{STRINGS.benchmarks.kicker}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#171614]">
            {STRINGS.benchmarks.title}
          </h1>
        </div>
        {isOffline && (
          <span className="text-xs font-semibold text-[#92400E]" role="status">
            {STRINGS.connection.offlineBadge}
          </span>
        )}
      </div>

      <section className="mt-8 p-8 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl">
        <h2 className="text-xl font-semibold text-[#171614]">
          {STRINGS.benchmarks.placeholderHeading}
        </h2>
        <p className="mt-3 text-sm text-[#44413C] leading-relaxed max-w-2xl">
          {STRINGS.benchmarks.placeholderBody}
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => onNavigate('/replays')}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#1E40AF] rounded-lg hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {STRINGS.benchmarks.exploreReplaysCta}
          </button>
        </div>
      </section>

      <div className="mt-10">
        <EncodingLegendStrip />
      </div>
    </main>
  );
}
