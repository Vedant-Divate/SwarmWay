import { EncodingLegendStrip } from '../components/VisualEncodings';
import { STRINGS } from '../strings';

interface AboutScreenProps {
  isOffline: boolean;
}

export function AboutScreen({ isOffline }: AboutScreenProps) {
  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-6 border-b border-[#E3DFD7]">
        <div>
          <p className="text-xs font-medium text-[#524F49]">{STRINGS.about.kicker}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#171614]">
            {STRINGS.about.title}
          </h1>
        </div>
        {isOffline && (
          <span className="text-xs font-semibold text-[#92400E]" role="status">
            {STRINGS.connection.offlineBadge}
          </span>
        )}
      </div>

      <div className="mt-8 space-y-8 divide-y divide-[#E3DFD7]">
        <section className="pt-2">
          <h2 className="text-lg font-semibold text-[#171614]">{STRINGS.about.optimalTitle}</h2>
          <p className="mt-2 text-sm text-[#44413C] leading-relaxed max-w-[70ch]">
            {STRINGS.about.optimalBody}
          </p>
          <p className="mt-2 text-xs font-medium text-[#1E40AF]">{STRINGS.honesty.cbs}</p>
        </section>

        <section className="pt-8">
          <h2 className="text-lg font-semibold text-[#171614]">{STRINGS.about.movementTitle}</h2>
          <p className="mt-2 text-sm text-[#44413C] leading-relaxed max-w-[70ch]">
            {STRINGS.about.movementBody}
          </p>
        </section>

        <section className="pt-8">
          <h2 className="text-lg font-semibold text-[#171614]">{STRINGS.about.baselineTitle}</h2>
          <p className="mt-2 text-sm text-[#44413C] leading-relaxed max-w-[70ch]">
            {STRINGS.about.baselineBody}
          </p>
          <p className="mt-2 text-xs font-medium text-[#92400E]">{STRINGS.honesty.prioritized}</p>
        </section>

        <section className="pt-8">
          <h2 className="text-lg font-semibold text-[#171614]">{STRINGS.about.attributionTitle}</h2>
          <p className="mt-2 text-sm text-[#44413C] leading-relaxed max-w-[70ch]">
            {STRINGS.about.attributionBody}
          </p>
        </section>

        <section className="pt-8">
          <h2 className="text-lg font-semibold text-[#171614]">{STRINGS.about.aiDisclosureTitle}</h2>
          <p className="mt-2 text-sm text-[#44413C] leading-relaxed">
            {STRINGS.about.aiDisclosureBody}
          </p>
        </section>
      </div>

      <div className="mt-10">
        <EncodingLegendStrip />
      </div>
    </main>
  );
}
