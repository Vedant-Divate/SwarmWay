import { STRINGS } from '../strings';
import type { AgentSpec, GridPoint } from '../types';
import { getAgentIdentity, sampleAgentPose } from '../utils/mapf';

interface AccessibleInspectorProps {
  agents: AgentSpec[];
  paths: GridPoint[][];
  playbackTime: number;
  selectedAgentId: number | null;
  onSelectAgent: (id: number | null) => void;
}

export function AccessibleInspector({
  agents,
  paths,
  playbackTime,
  selectedAgentId,
  onSelectAgent,
}: AccessibleInspectorProps) {
  const intTick = Math.round(playbackTime);

  const insp = STRINGS.workspace.inspector;

  return (
    <section
      aria-label={insp.title}
      className="bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-[#E3DFD7]">
        <div>
          <h2 className="text-sm font-semibold text-[#171614]">{insp.title}</h2>
          <p className="text-xs text-[#524F49]">{insp.subtitle}</p>
        </div>
        <span className="font-mono text-xs font-semibold tabular-nums text-[#171614]">
          {STRINGS.workspace.playback.timestepPrefix} {intTick}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto max-h-60">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E3DFD7] text-[#524F49] font-medium">
              <th className="py-2 pr-3">{insp.colAgent}</th>
              <th className="py-2 px-3">{insp.colStart}</th>
              <th className="py-2 px-3">{insp.colCurrent}</th>
              <th className="py-2 px-3">{insp.colGoal}</th>
              <th className="py-2 px-3">{insp.colState}</th>
              <th className="py-2 pl-3 text-right">{insp.colRoute}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFECE4] font-mono tabular-nums">
            {agents.map((agent, idx) => {
              const idInfo = getAgentIdentity(agent.id);
              const path = paths[idx] ?? [agent.start];
              const pose = sampleAgentPose(path, agent, playbackTime, true);
              const isSelected = selectedAgentId === agent.id;

              const statusText = pose.settledAtGoal
                ? insp.stateArrived
                : pose.isMovingThisStep
                  ? insp.stateMoving
                  : insp.stateWaiting;

              return (
                <tr
                  key={agent.id}
                  className={isSelected ? 'bg-[#1E40AF]/8' : 'hover:bg-[#EFECE4]/60'}
                >
                  <td className="py-2 pr-3 font-sans font-semibold text-[#171614] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: idInfo.color }}
                        aria-hidden="true"
                      >
                        {idInfo.badgeText}
                      </span>
                      <span>
                        {idInfo.shapeSymbol} {insp.colAgent} {agent.id}
                      </span>
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[#524F49]">
                    ({agent.start[0]}, {agent.start[1]})
                  </td>
                  <td className="py-2 px-3 font-semibold text-[#171614]">
                    ({pose.cellX}, {pose.cellY})
                  </td>
                  <td className="py-2 px-3 text-[#524F49]">
                    ({agent.goal[0]}, {agent.goal[1]})
                  </td>
                  <td className="py-2 px-3 font-sans text-[#44413C]">{statusText}</td>
                  <td className="py-2 pl-3 text-right font-sans">
                    <button
                      type="button"
                      onClick={() => onSelectAgent(isSelected ? null : agent.id)}
                      aria-pressed={isSelected}
                      aria-label={`${insp.focusAgentAction} ${insp.colAgent} ${agent.id}`}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                        isSelected
                          ? 'bg-[#1E40AF] text-white'
                          : 'text-[#1E40AF] hover:bg-[#1E40AF]/10'
                      }`}
                    >
                      {isSelected
                        ? insp.focusedState
                        : insp.focusAgentAction}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
