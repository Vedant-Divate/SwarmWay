import { Fragment, useEffect, useState } from 'react';
import { HERO_LANDING_TRACE } from '../data/heroTrace';
import { STRINGS } from '../strings';
import type { BundledReplayMeta, RoutePath } from '../types';
import { DioramaStage } from '../components/DioramaStage';
import { EncodingLegendStrip } from '../components/VisualEncodings';
import { BUNDLED_REPLAYS } from '../utils/mapf';

interface LandingScreenProps {
  isOffline: boolean;
  checkingHealth: boolean;
  reducedMotion: boolean;
  onNavigate: (route: RoutePath) => void;
  onPlayReplay?: (meta: BundledReplayMeta) => void;
}

// Deterministic teaser order: corridor yield, plaza rotary, warehouse aisles
const TEASER_REPLAY_IDS: ReadonlyArray<string> = [
  'corridor-yield',
  'plaza-rotary',
  'warehouse-aisles',
];

export function LandingScreen({
  isOffline,
  checkingHealth,
  reducedMotion,
  onNavigate,
  onPlayReplay,
}: LandingScreenProps) {
  const [heroTime, setHeroTime] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<number | null>(null);

  const makespan = HERO_LANDING_TRACE.execution.makespan;

  useEffect(() => {
    if (reducedMotion) {
      setHeroTime(3);
      return;
    }
    let rafId = 0;
    let lastTs = performance.now();
    const cycleSpan = makespan + 2.2;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      setHeroTime((prev) => {
        const next = prev + dt * 1.35;
        return next > cycleSpan ? 0 : next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [makespan, reducedMotion]);

  const clampedDisplayTime = Math.min(makespan, heroTime);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 lg:py-14">
      {/* Connection status notice (unboxed clean typography) */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[#524F49]">
        <span>{STRINGS.landing.kicker}</span>
        <span className="font-medium text-[#171614]" role="status">
          {checkingHealth
            ? STRINGS.connection.checking
            : isOffline
              ? STRINGS.connection.offlineBadge
              : STRINGS.connection.online}
        </span>
      </div>

      {/* Balanced 2-Column Hero Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        {/* Left Copy Column */}
        <div className="lg:col-span-5 flex flex-col justify-between py-2">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-bold tracking-tight text-[#171614] leading-[1.12] [text-wrap:balance]">
              {STRINGS.landing.headline}
            </h1>

            <p className="mt-5 text-base text-[#44413C] leading-relaxed max-w-[62ch]">
              {STRINGS.landing.paragraph}
            </p>

            {/* Primary & Secondary Navigation Buttons required on "/" */}
            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('/workspace')}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-[#1E40AF] rounded-lg hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {STRINGS.landing.openWorkspace}
              </button>

              <button
                type="button"
                onClick={() => onNavigate('/replays')}
                className="px-4 py-2.5 text-sm font-semibold text-[#171614] bg-[#FAF9F6] border border-[#D4CFC5] rounded-lg hover:bg-[#EFECE4] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {STRINGS.landing.watchReplays}
              </button>

              <button
                type="button"
                onClick={() => onNavigate('/benchmarks')}
                className="px-3 py-2.5 text-sm font-medium text-[#44413C] hover:text-[#171614] underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {STRINGS.landing.benchmarks}
              </button>

              <button
                type="button"
                onClick={() => onNavigate('/about')}
                className="px-3 py-2.5 text-sm font-medium text-[#44413C] hover:text-[#171614] underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {STRINGS.landing.about}
              </button>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-[#E3DFD7] text-xs text-[#524F49] space-y-2">
            <p className="leading-relaxed">{STRINGS.honesty.cbs}</p>
            {isOffline && (
              <p className="text-[#92400E] font-medium">{STRINGS.connection.offlineHint}</p>
            )}
          </div>
        </div>

        {/* Right Live 8×8 3D Diorama Stage */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="relative w-full h-[420px] sm:h-[480px] rounded-xl overflow-hidden border border-[#DCD7CC] bg-[#EAE6DD]">
            <DioramaStage
              mapWidth={HERO_LANDING_TRACE.instance.map.width}
              mapHeight={HERO_LANDING_TRACE.instance.map.height}
              mapRows={HERO_LANDING_TRACE.instance.map.rows}
              agents={HERO_LANDING_TRACE.instance.agents}
              paths={HERO_LANDING_TRACE.execution.paths}
              playbackTime={clampedDisplayTime}
              isPlaying={!reducedMotion}
              assembleProgress={1}
              reducedMotion={reducedMotion}
              autoOrbitIdle={!reducedMotion}
              selectedAgentId={selectedAgentId}
              hoveredAgentId={hoveredAgentId}
              onSelectAgent={setSelectedAgentId}
              onHoverAgent={setHoveredAgentId}
              ariaLabel={STRINGS.landing.heroAriaLabel}
            />

            {/* Subtle overlay caption */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-4 px-3.5 py-2 rounded-lg bg-[#FAF9F6]/92 border border-[#DCD7CC] text-xs text-[#44413C] pointer-events-none">
              <span className="truncate">{STRINGS.landing.heroSceneCaption}</span>
              <span className="font-mono tabular-nums font-semibold text-[#171614] shrink-0">
                {STRINGS.workspace.playback.timestepPrefix} {clampedDisplayTime.toFixed(1)} / {makespan}
              </span>
            </div>
          </div>

          {/* Quiet scenario teaser — one row, plain text links, wraps on mobile (Session 12) */}
          {onPlayReplay && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="text-[#524F49]">{STRINGS.landing.teaserLead}</span>
              {TEASER_REPLAY_IDS.map((replayId, index) => {
                const meta = BUNDLED_REPLAYS.find((r) => r.id === replayId);
                if (!meta) return null;
                return (
                  <Fragment key={meta.id}>
                    {index > 0 && (
                      <span aria-hidden="true" className="text-[#C8C2B5]">
                        ·
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onPlayReplay(meta)}
                      className="px-0.5 py-0.5 text-xs font-medium text-[#44413C] underline-offset-4 hover:text-[#171614] hover:underline transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {meta.title}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Consistent Conflict & Constraint Visual Encodings Strip */}
      <div className="mt-10">
        <EncodingLegendStrip />
      </div>
    </main>
  );
}
