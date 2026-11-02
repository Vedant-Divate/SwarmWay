import { useMemo } from 'react';
import { STRINGS } from '../strings';
import type { Trace } from '../types';
import { getAgentPermanentArrivalTick } from '../utils/mapf';
import { AgentIdentityBadge } from './VisualEncodings';

interface ComparePanelProps {
  cbsTrace: Trace;
  baselineTrace: Trace;
  activeTrace: Trace;
  onSelectActiveTrace: (trace: Trace) => void;
  onClose: () => void;
}

export function ComparePanel({
  cbsTrace,
  baselineTrace,
  activeTrace,
  onSelectActiveTrace,
  onClose,
}: ComparePanelProps) {
  const cbsSolved = cbsTrace.result.status === 'solved';
  const baseSolved = baselineTrace.result.status === 'solved';
  const socDelta =
    cbsSolved && baseSolved ? baselineTrace.result.soc - cbsTrace.result.soc : null;

  const activeIsCbs = activeTrace === cbsTrace;

  const perAgentArrivals = useMemo(() => {
    if (!cbsSolved || !baseSolved) return [];
    return cbsTrace.instance.agents.map((agent, idx) => {
      const cbsPath = cbsTrace.execution.paths[idx] ?? [];
      const baseAgent = baselineTrace.instance.agents[idx] ?? agent;
      const basePath = baselineTrace.execution.paths[idx] ?? [];
      const cbsTick = getAgentPermanentArrivalTick(cbsPath, agent.goal);
      const baseTick = getAgentPermanentArrivalTick(basePath, baseAgent.goal);
      return {
        agentId: agent.id,
        cbsTick,
        baseTick,
        delta: baseTick - cbsTick,
      };
    });
  }, [cbsSolved, baseSolved, cbsTrace, baselineTrace]);

  return (
    <section
      aria-label={STRINGS.workspace.compare.title}
      className="bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#E3DFD7]">
        <div>
          <h2 className="text-sm font-semibold text-[#171614]">
            {STRINGS.workspace.compare.title}
          </h2>
          {socDelta !== null && (
            <p className="mt-0.5 text-xs text-[#524F49] font-mono tabular-nums">
              {STRINGS.workspace.compare.socDeltaLabel}: {socDelta >= 0 ? `+${socDelta}` : socDelta}{' '}
              {STRINGS.workspace.compare.socDeltaSuffix}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-medium text-[#44413C] hover:text-[#171614] border border-[#D4CFC5] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          {STRINGS.workspace.compare.exitCompare}
        </button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E3DFD7] text-[#524F49]">
              <th className="py-2 pr-4 font-medium">{STRINGS.workspace.compare.colMetric}</th>
              <th className="py-2 px-4 font-semibold text-[#1E40AF]">
                {STRINGS.workspace.compare.colCbs}
              </th>
              <th className="py-2 pl-4 font-semibold text-[#92400E]">
                {STRINGS.workspace.compare.colBaseline} ({baselineTrace.solver.name})
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFECE4] font-mono tabular-nums">
            <tr>
              <td className="py-2 pr-4 font-sans text-[#524F49]">{STRINGS.workspace.stats.status}</td>
              <td className="py-2 px-4 font-semibold uppercase text-[#171614]">
                {cbsTrace.result.status}
              </td>
              <td
                className={`py-2 pl-4 font-semibold uppercase ${
                  baselineTrace.result.status === 'solved' ? 'text-[#171614]' : 'text-[#9F1239]'
                }`}
              >
                {baselineTrace.result.status}
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-sans text-[#524F49]">{STRINGS.workspace.stats.soc}</td>
              <td className="py-2 px-4 font-semibold text-[#171614]">
                {cbsSolved ? cbsTrace.result.soc : '—'}
              </td>
              <td className="py-2 pl-4 font-semibold text-[#171614]">
                {baseSolved ? baselineTrace.result.soc : '—'}
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-sans text-[#524F49]">{STRINGS.workspace.stats.makespan}</td>
              <td className="py-2 px-4 text-[#171614]">
                {cbsSolved ? cbsTrace.result.makespan : '—'}
              </td>
              <td className="py-2 pl-4 text-[#171614]">
                {baseSolved ? baselineTrace.result.makespan : '—'}
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-sans text-[#524F49]">{STRINGS.workspace.stats.runtime}</td>
              <td className="py-2 px-4 text-[#171614]">
                {cbsTrace.result.runtime_ms.toFixed(2)} {STRINGS.workspace.stats.msUnit}
              </td>
              <td className="py-2 pl-4 text-[#171614]">
                {baselineTrace.result.runtime_ms.toFixed(2)} {STRINGS.workspace.stats.msUnit}
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-sans text-[#524F49]">{STRINGS.workspace.stats.ctExpanded}</td>
              <td className="py-2 px-4 text-[#171614]">{cbsTrace.result.ct_expanded}</td>
              <td className="py-2 pl-4 text-[#524F49]">{baselineTrace.result.ct_expanded}</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-sans text-[#524F49]">{STRINGS.workspace.stats.lowLevel}</td>
              <td className="py-2 px-4 text-[#171614]">{cbsTrace.result.low_level_expansions}</td>
              <td className="py-2 pl-4 text-[#171614]">
                {baselineTrace.result.low_level_expansions}
              </td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-sans text-[#524F49]">{STRINGS.workspace.compare.colStage}</td>
              <td className="py-2.5 px-4 font-sans">
                {activeIsCbs ? (
                  <span className="text-xs font-semibold text-[#1E40AF]">
                    {STRINGS.workspace.compare.activeViewBadge}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectActiveTrace(cbsTrace)}
                    className="px-3 py-1 text-xs font-semibold text-white bg-[#1E40AF] rounded hover:bg-[#1E3A8A] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {STRINGS.workspace.compare.viewOnStage}
                  </button>
                )}
              </td>
              <td className="py-2.5 pl-4 font-sans">
                {!activeIsCbs ? (
                  <span className="text-xs font-semibold text-[#92400E]">
                    {STRINGS.workspace.compare.activeViewBadge}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectActiveTrace(baselineTrace)}
                    className="px-3 py-1 text-xs font-semibold text-white bg-[#92400E] rounded hover:bg-[#78350F] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {STRINGS.workspace.compare.viewOnStage}
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-agent arrival steps breakdown when both traces are solved */}
      {cbsSolved && baseSolved && perAgentArrivals.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#E3DFD7]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold text-[#171614]">
              {STRINGS.workspace.compare.perAgentTitle}
            </h3>
            <span className="text-[11px] font-mono text-[#524F49]">
              {STRINGS.workspace.compare.perAgentUnit}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_3.5rem] items-center gap-x-3 pb-1 border-b border-[#E3DFD7] text-[11px] text-[#524F49]">
            <span>{STRINGS.workspace.inspector.colAgent}</span>
            <span className="text-right font-semibold text-[#1E40AF] whitespace-nowrap">
              {STRINGS.workspace.compare.perAgentColCbs}
            </span>
            <span className="text-right font-semibold text-[#92400E] whitespace-nowrap">
              {STRINGS.workspace.compare.perAgentColBaseline}
            </span>
            <span className="text-right font-medium whitespace-nowrap">
              {STRINGS.workspace.compare.perAgentColDelta}
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-[#EFECE4]">
            {perAgentArrivals.map((row) => (
              <div
                key={row.agentId}
                className="py-1.5 grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_3.5rem] items-center gap-x-3 text-xs"
              >
                <AgentIdentityBadge agentId={row.agentId} />
                <span className="text-right font-mono tabular-nums text-[#171614]">
                  {row.cbsTick}
                </span>
                <span className="text-right font-mono tabular-nums text-[#171614]">
                  {row.baseTick}
                </span>
                <span className="flex justify-end">
                  {row.delta > 0 ? (
                    <span className="px-1.5 py-0.5 rounded bg-[#FFF7ED] text-[#92400E] font-mono font-semibold tabular-nums">
                      +{row.delta}
                    </span>
                  ) : row.delta < 0 ? (
                    <span className="px-1.5 py-0.5 rounded text-[#0F766E] font-mono font-semibold tabular-nums">
                      {row.delta}
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-[#524F49] font-mono tabular-nums">
                      0
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Required Honesty Copy for both solvers */}
      <div className="mt-4 pt-3 border-t border-[#E3DFD7] grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <p className="text-[#44413C]">
          <strong className="text-[#1E40AF]">{STRINGS.workspace.compare.cbsPrefix}</strong> {STRINGS.honesty.cbs}
        </p>
        <p className="text-[#44413C]">
          <strong className="text-[#92400E]">{STRINGS.workspace.compare.prioritizedPrefix}</strong> {STRINGS.honesty.prioritized}
        </p>
      </div>
    </section>
  );
}
