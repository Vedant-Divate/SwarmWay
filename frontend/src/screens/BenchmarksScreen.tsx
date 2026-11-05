import { useEffect, useState } from 'react';
import { STRINGS } from '../strings';
import type { RoutePath } from '../types';
import type { BenchmarkEnvironment, CellAggregate, SummaryJson } from '../types';
import { EncodingLegendStrip } from '../components/VisualEncodings';

interface BenchmarksScreenProps {
  isOffline: boolean;
  onNavigate: (route: RoutePath) => void;
}

/* ------------------------------------------------------------------ */
/* Small bar chart: one SVG bar per value, value printed beside it      */
/* (bars are never the only signal — Section 11.8 / 10.6).             */
/* ------------------------------------------------------------------ */
function ValueBar({
  value,
  max,
  label,
  color,
}: {
  value: number;
  max: number;
  label: string;
  color: string;
}) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2 mb-1">
      <svg
        width="120"
        height="10"
        className="block"
        aria-label={`${label}: ${value.toFixed(1)}`}
        role="img"
      >
        <rect width="120" height="10" fill="#EFECE4" rx="2" />
        <rect width={width} height="10" fill={color} rx="2" />
      </svg>
      <span className="text-[10px] font-mono tabular-nums text-[#524F49] w-[48px]">
        {value.toFixed(1)}
      </span>
      <span className="text-[11px] text-[#44413C]">{label}</span>
    </div>
  );
}

interface CellTableProps {
  cell: CellAggregate;
}

function CellTable({ cell }: CellTableProps) {
  const arms = Object.entries(cell.arms)
    .map(([name, agg]) => ({ name, agg }))
    .sort(({ name: nameA }, { name: nameB }) => {
      const order: Record<string, number> = { cbs: 0, 'pp-fixed': 1, 'pp-best-of-n': 2 };
      return (order[nameA] ?? 99) - (order[nameB] ?? 99);
    });

  return (
    <section className="mt-8 p-6 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-[#171614]">
          {cell.map} · {cell.agents} agents
        </h3>
        <span className="text-[11px] font-mono text-[#524F49]">
          {cell.agents} agents
        </span>
      </div>

      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#E3DFD7] text-[#524F49]">
            <th className="py-2 pr-4 font-medium">{STRINGS.benchmarks.colArm}</th>
            <th className="py-2 px-4 font-medium">{STRINGS.benchmarks.colStatus}</th>
            <th className="py-2 px-4 font-medium">{STRINGS.benchmarks.colSuccessRate}</th>
            <th className="py-2 px-4 font-medium">{STRINGS.benchmarks.colMedianSoc}</th>
            <th className="py-2 px-4 font-medium">{STRINGS.benchmarks.colMedianRuntime}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFECE4] font-mono tabular-nums">
          {arms.map(({ name: armName, agg }) => {
            const solved = agg.solved;
            const total = agg.total;
            const ratePct = (agg.success_rate * 100).toFixed(1);
            const timeout = agg.timeout;
            const unsat = agg.unsat;
            const medianSoc =
              agg.median_soc !== null
                ? `${agg.median_soc.toFixed(1)} (n=${agg.median_soc_solved_count})`
                : '—';
            const medianRuntime =
              agg.median_runtime_ms !== null
                ? `${agg.median_runtime_ms.toFixed(0)} ms (n=${agg.median_runtime_solved_count})`
                : '—';
            const statusSummary = [
              solved > 0 && `${solved} solved`,
              timeout > 0 && `${timeout} timeout`,
              unsat > 0 && `${unsat} unsat`,
              agg.error > 0 && `${agg.error} error`,
              agg.skipped > 0 && `${agg.skipped} skipped`,
              agg.aborted > 0 && `${agg.aborted} aborted`,
            ]
              .filter(Boolean)
              .join(', ') || 'no runs';
            return (
              <tr key={armName} className="hover:bg-[#F8F7F3]">
                <td className="py-2 pr-4 font-semibold text-[#171614]">
                  {armName === 'pp-best-of-n' ? 'pp-best-of-8' : armName}
                </td>
                <td className="py-2 px-4 text-[#44413C]">{statusSummary}</td>
                <td className="py-2 px-4">
                  <ValueBar
                    value={agg.success_rate * 100}
                    max={100}
                    label={`${ratePct}% (${solved}/${total})`}
                    color="#1E40AF"
                  />
                </td>
                <td className="py-2 px-4 text-[#171614]">{medianSoc}</td>
                <td className="py-2 px-4 text-[#171614]">{medianRuntime}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function BenchmarksScreen({ isOffline, onNavigate }: BenchmarksScreenProps) {
  const [summary, setSummary] = useState<SummaryJson | null>(null);
  const [environment, setEnvironment] = useState<BenchmarkEnvironment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [sumRes, envRes] = await Promise.all([
          fetch('/public/benchmarks/summary.json', {
            headers: { Accept: 'application/json' },
          }),
          fetch('/public/benchmarks/environment.json', {
            headers: { Accept: 'application/json' },
          }),
        ]);
        if (!active) return;
        if (!sumRes.ok || !envRes.ok) {
          setError(
            'No benchmark results bundled yet. Run the headline benchmark and sync its artifacts (see scripts/sync-results.py).'
          );
          setLoading(false);
          return;
        }
        const sum = (await sumRes.json()) as SummaryJson;
        const env = (await envRes.json()) as BenchmarkEnvironment;
        setSummary(sum);
        setEnvironment(env);
      } catch {
        if (!active) return;
        setError(
          'No benchmark results bundled yet. Run the headline benchmark and sync its artifacts (see scripts/sync-results.py).'
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between gap-4 pb-6 border-b border-[#E3DFD7]">
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
          <p className="text-sm text-[#524F49]">Loading benchmark results…</p>
        </section>
      </main>
    );
  }

  if (error || !summary || !environment) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-baseline justify-between gap-4 pb-6 border-b border-[#E3DFD7]">
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
        <section className="mt-8 p-8 bg-[#FFF1F2] border border-[#FECDD3] rounded-xl">
          <h2 className="text-sm font-semibold text-[#9F1239]">
            {STRINGS.benchmarks.noResultsHeading}
          </h2>
          <p className="mt-2 text-sm text-[#524F49] leading-relaxed">
            {error || STRINGS.benchmarks.noResultsBody}
          </p>
          <p className="mt-2 text-[11px] text-[#524F49] font-mono whitespace-pre-wrap">
            {STRINGS.benchmarks.noResultsDetail}
          </p>
        </section>
        <div className="mt-10">
          <EncodingLegendStrip />
        </div>
      </main>
    );
  }

  const runId = summary.run_id;
  const cells = summary.cells;
  const totalSolved = cells.reduce(
    (sum, c) => sum + Object.values(c.arms).reduce((s, a) => s + a.solved, 0),
    0
  );
  const totalCells = cells.length;

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-6 border-b border-[#E3DFD7]">
        <div>
          <p className="text-xs font-medium text-[#524F49]">{STRINGS.benchmarks.kicker}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#171614]">
            {STRINGS.benchmarks.title}
          </h1>
          <p className="mt-2 text-sm text-[#44413C] max-w-2xl leading-relaxed">
            Benchmark results for run <strong className="text-[#171614]">{runId}</strong>. Every
            figure is read from the committed bundled artifacts — none is hand-typed.
          </p>
        </div>
        {isOffline && (
          <span className="text-xs font-semibold text-[#92400E]" role="status">
            {STRINGS.connection.offlineBadge}
          </span>
        )}
      </div>

      {/* Run ID + environment + reproduce command */}
      <section className="mt-8 p-6 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <p className="font-semibold text-[#171614]">{STRINGS.benchmarks.runId}</p>
            <p className="mt-1 font-mono text-[#1E40AF]">{runId}</p>
          </div>
          <div>
            <p className="font-semibold text-[#171614]">{STRINGS.benchmarks.environment}</p>
            <p className="mt-1 font-mono text-[#524F49] truncate">
              {environment.python_implementation} {environment.python_version} ·
              {environment.platform} · {environment.cpu} · {environment.ram_gb} RAM
            </p>
          </div>
          <div>
            <p className="font-semibold text-[#171614]">{STRINGS.benchmarks.reproduceCommand}</p>
            <p className="mt-1 font-mono text-[#1E40AF] truncate">
              {STRINGS.benchmarks.reproduceHint}
            </p>
          </div>
        </div>
      </section>

      {/* Honesty copy under every table */}
      <section className="mt-6 p-5 rounded-lg border border-[#E3DFD7] bg-[#FFFBEB]">
        <p className="text-xs text-[#92400E] leading-relaxed">
          {STRINGS.benchmarks.honestyTimeouts}
        </p>
        <p className="mt-1 text-xs text-[#92400E] leading-relaxed">
          {STRINGS.benchmarks.honestyMedians}
        </p>
        <p className="mt-1 text-xs text-[#92400E] leading-relaxed">
          {STRINGS.benchmarks.honestyComparable}
        </p>
        <p className="mt-3 text-xs text-[#44413C]">
          {STRINGS.benchmarks.honestyCaveat}
        </p>
      </section>

      {/* Per-cell tables */}
      {cells.length === 0 ? (
        <section className="mt-8 p-8 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl">
          <p className="text-sm text-[#524F49]">No benchmark cells recorded.</p>
        </section>
      ) : (
        <>
          {cells.map((cell) => (
            <CellTable key={`${cell.map}-${cell.agents}`} cell={cell} />
          ))}
        </>
      )}

      <div className="mt-8">
        <p className="text-[11px] text-[#524F49] font-mono">
          {totalSolved} of {totalCells * 3} solver cells solved across this run.
        </p>
        <EncodingLegendStrip />
      </div>
    </main>
  );
}
