import { STRINGS } from '../strings';
import type { SearchConflict, SearchConstraint } from '../types';
import { getAgentIdentity } from '../utils/mapf';

/**
 * Consistent visual encodings for Agents, Conflicts, and Constraints used across every screen.
 * Never relies on color alone:
 * - Conflict: Crimson diamond glyph ◆ + explicit "Conflict" + Vertex/Edge label
 * - Constraint: Ochre shield/bar glyph ⊘ + explicit "Constraint" + Vertex/Edge label
 */

export function AgentIdentityBadge({
  agentId,
  compact = false,
}: {
  agentId: number;
  compact?: boolean;
}) {
  const id = getAgentIdentity(agentId);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#171614] whitespace-nowrap">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold text-white shrink-0"
        style={{ backgroundColor: id.color }}
        aria-hidden="true"
      >
        {id.badgeText}
      </span>
      {!compact && (
        <span className="text-[#524F49] font-normal">
          {id.shapeSymbol} A{agentId}
        </span>
      )}
    </span>
  );
}

export function ConflictEncodingTag({ conflict }: { conflict?: SearchConflict }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9F1239] whitespace-nowrap">
      <span aria-hidden="true" className="font-mono font-bold text-sm leading-none">
        ◆
      </span>
      <span className="font-semibold">{STRINGS.encodings.conflictLabel}</span>
      {conflict && (
        <span className="font-mono text-[#524F49]">
          · {conflict.type === 'vertex' ? STRINGS.encodings.vertexBadge : STRINGS.encodings.edgeBadge}{' '}
          A{conflict.agents[0]}×A{conflict.agents[1]} @ t={conflict.t}
        </span>
      )}
    </span>
  );
}

export function ConstraintEncodingTag({ constraint }: { constraint?: SearchConstraint }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#92400E] whitespace-nowrap">
      <span aria-hidden="true" className="font-mono font-bold text-sm leading-none">
        ⊘
      </span>
      <span className="font-semibold">{STRINGS.encodings.constraintLabel}</span>
      {constraint && (
        <span className="font-mono text-[#524F49]">
          · forbid A{constraint.agent}{' '}
          {constraint.type === 'vertex' && constraint.pos
            ? `(${constraint.pos[0]},${constraint.pos[1]})`
            : constraint.u && constraint.v
              ? `(${constraint.u[0]},${constraint.u[1]})→(${constraint.v[0]},${constraint.v[1]})`
              : ''}{' '}
          @ t={constraint.t}
        </span>
      )}
    </span>
  );
}

export function EncodingLegendStrip() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#524F49] py-2 border-t border-[#E3DFD7]">
      <span className="font-semibold text-[#171614]">{STRINGS.encodings.sectionTitle}:</span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="text-[#9F1239] font-mono font-bold">
          ◆
        </span>
        <strong className="font-semibold text-[#9F1239]">{STRINGS.encodings.conflictLabel}</strong>
        <span>— {STRINGS.encodings.conflictDesc}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="text-[#92400E] font-mono font-bold">
          ⊘
        </span>
        <strong className="font-semibold text-[#92400E]">{STRINGS.encodings.constraintLabel}</strong>
        <span>— {STRINGS.encodings.constraintDesc}</span>
      </span>
    </div>
  );
}
