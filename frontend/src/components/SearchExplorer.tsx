import { useMemo, useState } from 'react';
import { STRINGS } from '../strings';
import type { SearchEvent } from '../types';
import { ConflictEncodingTag, ConstraintEncodingTag } from './VisualEncodings';

interface SearchExplorerProps {
  searchEvents: SearchEvent[];
  activeSeq: number | null;
  onSelectEvent: (seq: number) => void;
}

/**
 * Interactive Constraint Tree explorer for the Workspace "Search" tab.
 * Renders the recorded high-level CBS search events in chronological order,
 * indented by Constraint Tree depth, and reports the selected node upward so
 * the 3D board can seek to the conflict timestep.
 */
export function SearchExplorer({ searchEvents, activeSeq, onSelectEvent }: SearchExplorerProps) {
  const [conflictsOnly, setConflictsOnly] = useState<boolean>(false);

  // Depth per CT node: depth(node) = depth(parent) + 1, root = 0.
  // Events are chronological (parents always logged before children); unknown
  // parents are guarded so an orphan node still renders at a sane depth.
  const depthByNode = useMemo(() => {
    const depth = new Map<number, number>();
    for (const ev of searchEvents) {
      if (depth.has(ev.node)) continue;
      if (ev.event === 'root' || ev.parent === undefined) {
        depth.set(ev.node, 0);
      } else {
        const parentDepth = depth.get(ev.parent);
        depth.set(ev.node, parentDepth !== undefined ? parentDepth + 1 : 1);
      }
    }
    return depth;
  }, [searchEvents]);

  const visibleEvents = useMemo(
    () => (conflictsOnly ? searchEvents.filter((ev) => ev.conflict) : searchEvents),
    [conflictsOnly, searchEvents]
  );

  if (searchEvents.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-[#171614]">{STRINGS.workspace.search.title}</h2>
        <p className="mt-2 text-sm text-[#44413C] leading-relaxed max-w-2xl">
          {STRINGS.workspace.search.emptyBody}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#171614]">{STRINGS.workspace.search.title}</h2>
        <p className="mt-1 text-xs text-[#524F49] leading-relaxed max-w-2xl">
          {STRINGS.workspace.search.jumpHint}
        </p>
      </div>

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

      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
        {visibleEvents.map((ev) => {
          const depth = depthByNode.get(ev.node) ?? 0;
          const selected = ev.seq === activeSeq;
          return (
            <button
              key={ev.seq}
              type="button"
              onClick={() => onSelectEvent(ev.seq)}
              aria-pressed={selected}
              style={{ paddingLeft: `${14 * depth + 10}px` }}
              className={`w-full text-left p-2 pr-3 rounded-lg border flex flex-wrap items-center gap-x-3 gap-y-1 text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] ${
                selected
                  ? 'bg-white border-[#1E40AF]'
                  : 'bg-white border-[#E3DFD7] hover:border-[#C8C2B5]'
              }`}
            >
              {depth > 0 && (
                <span aria-hidden="true" className="font-mono text-[#C8C2B5] leading-none shrink-0">
                  └
                </span>
              )}
              <span className="font-mono tabular-nums text-[#524F49]">
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
        })}
      </div>
    </div>
  );
}
