import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STRINGS } from '../strings';
import type { SearchEvent } from '../types';
import { ConflictEncodingTag, ConstraintEncodingTag } from './VisualEncodings';

interface SearchExplorerProps {
  searchEvents: SearchEvent[];
  activeSeq: number | null;
  onSelectEvent: (seq: number) => void;
}

// Threshold beyond which the event list is windowed (virtualized) so the
// DOM never holds more than a few hundred rows at once (Section 11.6).
const VIRTUALIZE_THRESHOLD = 500;
const VIRTUAL_BUFFER = 40;
const ITEM_HEIGHT_PX = 46;

// Tree glyphs for a tidy layered (root left, children right) rendering.
const GLYPH_VERTICAL = '│';
const GLYPH_LAST = '└';
const GLYPH_NON_LAST = '├';
const GLYPH_HORIZONTAL = '─';

interface TreeMeta {
  depth: number;
  children: number[]; // node ids
  isLastChild: boolean;
  // Connector prefix drawn before the final branch glyph, one 4-char cell
  // per ancestor level: "│   " when that ancestor has a younger sibling,
  // otherwise "    ".
  prefix: string;
}

export function SearchExplorer({ searchEvents, activeSeq, onSelectEvent }: SearchExplorerProps) {
  const [conflictsOnly, setConflictsOnly] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const [scrollTop, setScrollTop] = useState<number>(0);

  // Depth per CT node (root = 0; child = parent depth + 1). Events are
  // chronological, so parents are always logged before children.
  const depthByNode = useMemo(() => {
    const depth = new Map<number, number>();
    for (const ev of searchEvents) {
      if (depth.has(ev.node)) continue;
      depth.set(
        ev.node,
        ev.event === 'root' || ev.parent === undefined ? 0 : (depth.get(ev.parent) ?? 0) + 1
      );
    }
    return depth;
  }, [searchEvents]);

  // Children of each node (keyed by parent node id; undefined => roots).
  const childrenByParent = useMemo(() => {
    const map = new Map<number | undefined, number[]>();
    for (const ev of searchEvents) {
      const key = ev.parent === undefined ? undefined : ev.parent;
      const list = map.get(key) ?? [];
      list.push(ev.node);
      map.set(key, list);
    }
    return map;
  }, [searchEvents]);

  // Per-node tree metadata: depth, child list, last-child flag, prefix.
  const metaByNode = useMemo(() => {
    const meta = new Map<number, TreeMeta>();
    for (const ev of searchEvents) {
      const depth = depthByNode.get(ev.node) ?? 0;
      const parentKey = ev.parent === undefined ? undefined : ev.parent;
      const siblings = childrenByParent.get(parentKey) ?? [];
      const idx = siblings.indexOf(ev.node);
      const isLastChild = idx === siblings.length - 1;
      // Build the vertical connector prefix from the ancestor chain.
      let prefix = '';
      let ancestor: number | undefined = ev.parent;
      for (let level = depth - 1; level > 0; level--) {
        const ancSiblings = childrenByParent.get(
          ancestor === undefined ? undefined : ancestor
        ) ?? [];
        const ancIdx = ancSiblings.indexOf(ancestor ?? -1);
        const ancIsLast = ancIdx === ancSiblings.length - 1;
        prefix = (ancIsLast ? '    ' : `${GLYPH_VERTICAL}  `) + prefix;
        // Walk up: find this ancestor's own parent.
        const ancEv = searchEvents.find((e) => e.node === ancestor);
        ancestor = ancEv?.parent === undefined ? undefined : ancEv.parent;
      }
      meta.set(ev.node, {
        depth,
        children: siblings,
        isLastChild,
        prefix,
      });
    }
    return meta;
  }, [searchEvents, depthByNode, childrenByParent]);

  const truncated =
    searchEvents.some(
      (ev) => (ev as { search_truncated?: boolean }).search_truncated === true
    ) || false;

  const visibleEvents = useMemo(
    () => (conflictsOnly ? searchEvents.filter((ev) => ev.conflict) : searchEvents),
    [conflictsOnly, searchEvents]
  );

  // --- Virtualization -------------------------------------------------
  const total = visibleEvents.length;
  const virtualize = total > VIRTUALIZE_THRESHOLD;
  const [viewStart, setViewStart] = useState(0);

  const visibleRange = useMemo(() => {
    if (!virtualize || containerHeight <= 0) return { start: 0, end: total };
    const visibleCount = Math.max(1, Math.floor(containerHeight / ITEM_HEIGHT_PX));
    const start = Math.max(
      0,
      Math.floor(scrollTop / ITEM_HEIGHT_PX) - VIRTUAL_BUFFER
    );
    const end = Math.min(total, start + visibleCount + 2 * VIRTUAL_BUFFER);
    return { start, end };
  }, [virtualize, containerHeight, scrollTop, total]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const goToSeq = useCallback(
    (nextSeq: number) => {
      const clamped = Math.max(0, Math.min(total - 1, nextSeq));
      onSelectEvent(clamped);
    },
    [onSelectEvent, total]
  );

  const prevSeq = useCallback(() => {
    if (activeSeq === null) return goToSeq(0);
    goToSeq(activeSeq - 1);
  }, [activeSeq, goToSeq]);

  const nextSeq = useCallback(() => {
    if (activeSeq === null) return goToSeq(0);
    goToSeq(activeSeq + 1);
  }, [activeSeq, goToSeq]);

  const activeEvent = useMemo(
    () => (activeSeq === null ? null : searchEvents.find((ev) => ev.seq === activeSeq) ?? null),
    [activeSeq, searchEvents]
  );

  const isActive = (seq: number) => activeSeq === seq;

  const rowKeyPrefix = (seq: number) => `search-row-${seq}`;

  // Render one tree row (flat, chronological order; indented by depth).
  const renderRow = (ev: SearchEvent) => {
    const meta = metaByNode.get(ev.node);
    const depth = meta?.depth ?? 0;
    const selected = isActive(ev.seq);
    const hasChildren = (meta?.children.length ?? 0) > 0;
    const branch = hasChildren && !meta?.isLastChild ? GLYPH_NON_LAST : GLYPH_LAST;
    const connector = depth > 0 ? `${meta?.prefix ?? ''}${branch}${GLYPH_HORIZONTAL} ` : '';
    const conflict = ev.conflict;
    const constraint = ev.constraint;
    const summaryParts = [
      `#${ev.seq}`,
      ev.event.toUpperCase(),
      `node ${ev.node}`,
      `cost ${ev.cost}`,
    ];
    if (conflict) {
      summaryParts.push(
        `conflict ${conflict.type} A${conflict.agents[0]}×A${conflict.agents[1]} @t${conflict.t}`
      );
    }
    if (constraint) {
      summaryParts.push(
        `constraint A${constraint.agent} ${constraint.type} @t${constraint.t}`
      );
    }

    return (
      <button
        key={ev.seq}
        id={rowKeyPrefix(ev.seq)}
        type="button"
        onClick={() => onSelectEvent(ev.seq)}
        aria-pressed={selected}
        aria-label={summaryParts.join(' · ')}
        style={{ paddingLeft: `${10 + depth * 18}px` }}
        className={`w-full text-left p-1.5 pr-3 rounded-lg border flex flex-wrap items-center gap-x-3 gap-y-1 text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] ${
          selected
            ? 'bg-white border-[#1E40AF] shadow-sm'
            : 'bg-white border-[#E3DFD7] hover:border-[#C8C2B5] hover:bg-[#F8F7F3]'
        }`}
      >
        <span
          aria-hidden="true"
          className="font-mono text-[#C8C2B5] leading-none shrink-0 select-none"
        >
          {connector}
        </span>
        <span className="font-mono tabular-nums text-[#524F49] shrink-0">
          #{ev.seq} · {ev.event.toUpperCase()} node {ev.node} · cost {ev.cost}
        </span>
        {(ev.conflict || ev.constraint) && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-auto">
            {ev.conflict && <ConflictEncodingTag conflict={ev.conflict} />}
            {ev.constraint && <ConstraintEncodingTag constraint={ev.constraint} />}
          </span>
        )}
      </button>
    );
  };

  const rows = useMemo(() => {
    const { start, end } = visibleRange;
    return visibleEvents.slice(start, end).map(renderRow);
  }, [visibleEvents, visibleRange, renderRow]);

  const scrubberMax = total - 1;
  const scrubberValue = activeSeq ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#171614]">
          {STRINGS.workspace.search.title}
        </h2>
        <p className="mt-1 text-xs text-[#524F49] leading-relaxed max-w-2xl">
          {STRINGS.workspace.search.jumpHint}
        </p>
      </div>

      {/* Truncation badge (honest reporting when the event stream was capped) */}
      {truncated && (
        <div
          role="status"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-xs text-[#92400E] font-medium"
        >
          <span aria-hidden="true" className="font-mono font-bold">
            ⚠
          </span>
          Trace truncated — every k-th event kept; last 50 + goal event retained.
        </div>
      )}

      <div
        role="group"
        aria-label={STRINGS.workspace.search.title}
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          aria-pressed={!conflictsOnly}
          onClick={() => setConflictsOnly(false)}
          className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
            !conflictsOnly
              ? 'bg-white border-[#1E40AF] text-[#1E40AF] font-semibold'
              : 'bg-[#FAF9F6] border-[#DCD7CC] text-[#171614] font-medium hover:bg-white'
          }`}
        >
          {STRINGS.workspace.search.filterAll}
        </button>
        <button
          type="button"
          aria-pressed={conflictsOnly}
          onClick={() => setConflictsOnly(true)}
          className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
            conflictsOnly
              ? 'bg-white border-[#1E40AF] text-[#1E40AF] font-semibold'
              : 'bg-[#FAF9F6] border-[#DCD7CC] text-[#171614] font-medium hover:bg-white'
          }`}
        >
          {STRINGS.workspace.search.filterConflicts}
        </button>
      </div>

      {/* Seq scrubber + step buttons: walk events in order (synchronized walk) */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[#E3DFD7] pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevSeq}
            disabled={activeSeq === null || activeSeq <= 0}
            className="px-3 py-1.5 text-xs font-medium text-[#171614] bg-white border border-[#D4CFC5] rounded-lg hover:bg-[#EFECE4] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            ◀ Step
          </button>
          <button
            type="button"
            onClick={nextSeq}
            disabled={activeSeq === null || activeSeq >= scrubberMax}
            className="px-3 py-1.5 text-xs font-medium text-[#171614] bg-white border border-[#D4CFC5] rounded-lg hover:bg-[#EFECE4] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            Step ▶
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <label
            htmlFor="search-seq-scrubber"
            className="sr-only"
          >
            Search event sequence scrubber
          </label>
          <input
            id="search-seq-scrubber"
            type="range"
            min={0}
            max={scrubberMax}
            step={1}
            value={scrubberValue}
            onInput={(e) => goToSeq(Number(e.currentTarget.value))}
            className="w-full accent-[#1E40AF]"
          />
        </div>
        <span className="font-mono text-xs font-semibold tabular-nums text-[#171614] whitespace-nowrap shrink-0">
          {activeSeq === null ? '—' : `${activeSeq + 1} / ${total}`}
        </span>
      </div>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`space-y-0.5 max-h-[420px] overflow-y-auto pr-1 ${
          virtualize ? 'contain-paint' : ''
        }`}
      >
        {total === 0 ? (
          <div className="px-2 py-2 text-xs text-[#524F49]">
            No {conflictsOnly ? 'conflict' : 'search'} events to show.
          </div>
        ) : (
          rows
        )}
      </div>

      {/* Synchronized textual event log — the non-visual / accessible path. */}
      <div className="border border-[#E3DFD7] rounded-lg bg-[#FAF9F6] p-3 text-xs">
        <h3 className="sr-only">Textual event log</h3>
        <table role="table" aria-label="Constraint Tree event log" className="w-full text-left text-[11px]">
          <thead className="hidden">
            <tr>
              <th>seq</th>
              <th>event</th>
              <th>node</th>
              <th>cost</th>
              <th>conflict / constraint summary</th>
            </tr>
          </thead>
          <tbody>
            {visibleEvents.map((ev) => {
              const selected = isActive(ev.seq);
              const parts: string[] = [];
              if (ev.conflict) {
                parts.push(
                  `${ev.conflict.type} conflict A${ev.conflict.agents[0]}×A${ev.conflict.agents[1]} @ t=${ev.conflict.t}`
                );
              }
              if (ev.constraint) {
                const target = constraintTarget(ev.constraint);
                parts.push(`constraint A${ev.constraint.agent} ${ev.constraint.type} ${target} @ t=${ev.constraint.t}`);
              }
              return (
                <tr
                  key={ev.seq}
                  className={`${
                    selected
                      ? 'bg-white border-l-2 border-l-[#1E40AF]'
                      : 'hover:bg-[#F8F7F3]'
                  } text-xs`}
                >
                  <td className="pr-2 font-mono tabular-nums text-[#524F49]">
                    #{ev.seq}
                  </td>
                  <td className="pr-2 font-mono text-[#44413C]">
                    {ev.event.toUpperCase()}
                  </td>
                  <td className="pr-2 font-mono tabular-nums text-[#524F49]">
                    node {ev.node}
                  </td>
                  <td className="pr-2 font-mono tabular-nums text-[#524F49]">
                    {ev.cost}
                  </td>
                  <td className="font-mono text-[#171614]">
                    {parts.length > 0 ? parts.join('; ') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function constraintTarget(c: SearchEvent['constraint']): string {
  if (!c) return '';
  if (c.type === 'vertex' && c.pos) {
    return `vertex (${c.pos[0]},${c.pos[1]})`;
  }
  if (c.u && c.v) {
    return `edge (${c.u[0]},${c.u[1]})→(${c.v[0]},${c.v[1]})`;
  }
  return '';
}
