import { useEffect, useState } from 'react';
import { fetchBundledTrace } from '../api/client';
import { ReplayPlanThumb } from '../components/ReplayPlanThumb';
import { EncodingLegendStrip } from '../components/VisualEncodings';
import { STRINGS } from '../strings';
import type { BundledReplayMeta, Trace } from '../types';
import { BUNDLED_REPLAYS } from '../utils/mapf';

interface ReplaysScreenProps {
  isOffline: boolean;
  onSelectReplay: (meta: BundledReplayMeta) => void;
}

export function ReplaysScreen({ isOffline, onSelectReplay }: ReplaysScreenProps) {
  const [loadedTraces, setLoadedTraces] = useState<Record<string, Trace>>({});

  useEffect(() => {
    let active = true;
    Promise.all(
      BUNDLED_REPLAYS.map(async (meta) => {
        try {
          const trace = await fetchBundledTrace(meta.file);
          return [meta.id, trace] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (!active) return;
      const map: Record<string, Trace> = {};
      for (const item of entries) {
        if (item) map[item[0]] = item[1];
      }
      setLoadedTraces(map);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-6 border-b border-[#E3DFD7]">
        <div>
          <p className="text-xs font-medium text-[#524F49]">{STRINGS.replays.kicker}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#171614]">
            {STRINGS.replays.title}
          </h1>
          <p className="mt-2 text-sm text-[#44413C] max-w-2xl leading-relaxed">
            {STRINGS.replays.subtitle}
          </p>
        </div>

        {isOffline && (
          <div className="text-right text-xs">
            <p className="font-semibold text-[#92400E]">{STRINGS.connection.offlineBadge}</p>
            <p className="mt-0.5 text-[#524F49]">{STRINGS.honesty.offlineReplay}</p>
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {BUNDLED_REPLAYS.map((meta) => {
          const trace = loadedTraces[meta.id];
          return (
            <article
              key={meta.id}
              className="flex flex-col justify-between p-6 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl"
            >
              <div>
                {/* Clean unboxed metadata row — zero pills */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#524F49] font-mono tabular-nums">
                  {trace ? (
                    <>
                      <span>{trace.instance.map.name}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {trace.instance.map.width}×{trace.instance.map.height} {STRINGS.replays.gridSizeSuffix}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {trace.instance.agents.length} {STRINGS.replays.agentsCountSuffix}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-[#171614]">
                        {trace.solver.name.toUpperCase()} ({trace.result.status.toUpperCase()})
                      </span>
                    </>
                  ) : (
                    <span>{meta.id}</span>
                  )}
                </div>

                <h2 className="mt-2.5 text-xl font-semibold text-[#171614]">{meta.title}</h2>

                <p className="mt-2 text-sm text-[#44413C] leading-relaxed">{meta.story}</p>

                {trace && (
                  <div className="mt-4 rounded-lg border border-[#E3DFD7] bg-white p-2">
                    <ReplayPlanThumb trace={trace} />
                  </div>
                )}

                {isOffline && (
                  <p className="mt-3 text-xs text-[#524F49] italic">
                    {STRINGS.honesty.offlineReplay}
                  </p>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-[#E3DFD7] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-[#524F49]">
                  {trace && trace.result.status === 'solved' && (
                    <>
                      <span>
                        {STRINGS.replays.socPrefix} <strong className="text-[#171614]">{trace.result.soc}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {STRINGS.replays.makespanPrefix} <strong className="text-[#171614]">{trace.result.makespan}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {trace.search.length} {STRINGS.replays.searchEventsSuffix}
                      </span>
                    </>
                  )}
                  {trace && trace.result.status !== 'solved' && (
                    <span className="text-[#9F1239] font-semibold">
                      {STRINGS.replays.outcomePrefix} {trace.result.status.toUpperCase()}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onSelectReplay(meta)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E40AF] rounded-lg hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {STRINGS.replays.loadIntoWorkspace}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-10">
        <EncodingLegendStrip />
      </div>
    </main>
  );
}
