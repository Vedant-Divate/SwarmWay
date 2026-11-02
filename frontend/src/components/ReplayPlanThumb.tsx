import { STRINGS } from '../strings';
import type { Trace } from '../types';
import { getAgentIdentity, isPassableChar } from '../utils/mapf';

export function ReplayPlanThumb({ trace }: { trace: Trace }) {
  const { width, height, rows, name } = trace.instance.map;
  const agents = trace.instance.agents;
  const isSolved = trace.result.status === 'solved';

  const blockedCells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '.';
      if (!isPassableChar(ch)) {
        blockedCells.push({ x, y });
      }
    }
  }

  const thumbStrings = STRINGS.replays.thumb;
  const ariaLabel =
    (isSolved ? thumbStrings.planThumbAria : thumbStrings.planThumbUnsolvedAria) +
    thumbStrings.mapSeparator +
    name;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      className="block w-full h-auto max-h-40"
    >
      {blockedCells.map((cell) => (
        <rect
          key={`wall-${cell.x}-${cell.y}`}
          x={cell.x}
          y={cell.y}
          width={1}
          height={1}
          fill="#55524B"
        />
      ))}

      {isSolved &&
        trace.execution.paths.map((path, i) => {
          if (path.length === 0) return null;
          const agentId = agents[i]?.id ?? i;
          const color = getAgentIdentity(agentId).color;
          const points = path.map(([px, py]) => `${px + 0.5},${py + 0.5}`).join(' ');
          return (
            <polyline
              key={`route-${agentId}`}
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={0.14}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.45}
            />
          );
        })}

      {agents.map((agent, i) => {
        if (agent.start[0] === agent.goal[0] && agent.start[1] === agent.goal[1]) {
          return null;
        }
        const agentId = agent.id ?? i;
        const color = getAgentIdentity(agentId).color;
        return (
          <rect
            key={`start-${agentId}`}
            x={agent.start[0] + 0.22}
            y={agent.start[1] + 0.22}
            width={0.56}
            height={0.56}
            fill="none"
            stroke={color}
            strokeWidth={0.1}
            opacity={0.75}
          />
        );
      })}

      {agents.map((agent, i) => {
        const agentId = agent.id ?? i;
        const color = getAgentIdentity(agentId).color;
        return (
          <circle
            key={`goal-${agentId}`}
            cx={agent.goal[0] + 0.5}
            cy={agent.goal[1] + 0.5}
            r={0.24}
            fill="none"
            stroke={color}
            strokeWidth={0.12}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}
