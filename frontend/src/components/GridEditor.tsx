import { type ChangeEvent, useCallback, useMemo, useState } from 'react';
import { STRINGS } from '../strings';
import type { AgentSpec, GridPoint } from '../types';

type EditorMode = 'place' | 'paint';

interface GridEditorProps {
  width: number;
  height: number;
  maxCells: number;
  rows: string[];
  agents: AgentSpec[];
  pendingStartCell: GridPoint | null;
  onGridChange: (rows: string[]) => void;
  onSizeChange: (width: number, height: number) => void;
  onAgentPlace: (agent: AgentSpec) => void;
  onAgentRemove: (id: number) => void;
  onClearAgents: () => void;
  onClearGrid: () => void;
  onPendingStartChange: (cell: GridPoint | null) => void;
}

interface CellState {
  blocked: boolean;
  start: boolean;
  goal: boolean;
}

export function GridEditor({
  width,
  height,
  maxCells,
  rows,
  agents,
  pendingStartCell,
  onGridChange,
  onSizeChange,
  onAgentPlace,
  onAgentRemove,
  onClearAgents,
  onClearGrid,
  onPendingStartChange,
}: GridEditorProps) {
  const [mode, setMode] = useState<EditorMode>('place');
  const focusRing = 'focus-visible:outline-2 focus-visible:outline-[#171614] focus-visible:outline-offset-2';

  const maxWidth = Math.max(1, Math.floor(maxCells / Math.max(1, height)));
  const maxHeight = Math.max(1, Math.floor(maxCells / Math.max(1, width)));

  const grid = useMemo<CellState[][]>(
    () =>
      rows.map((row, y) =>
        row.split('').map((ch, x) => ({
          blocked: ch === '@',
          start: agents.some((a) => a.start[0] === x && a.start[1] === y),
          goal: agents.some((a) => a.goal[0] === x && a.goal[1] === y),
        }))
      ),
    [rows, agents]
  );

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      const cell = grid[y][x];
      const agentAtStart = agents.find(
        (a) => a.start[0] === x && a.start[1] === y
      );
      const agentAtGoal = agents.find(
        (a) => a.goal[0] === x && a.goal[1] === y
      );

      if (mode === 'paint') {
        const agentOnCell = agentAtStart || agentAtGoal;
        if (agentOnCell) {
          onAgentRemove(agentOnCell.id);
        }
        const nextRows = rows.map((row, rowY) => {
          if (rowY !== y) return row;
          const ch = row.split('');
          ch[x] = cell.blocked ? '.' : '@';
          return ch.join('');
        });
        onGridChange(nextRows);
        onPendingStartChange(null);
        return;
      }

      // Place mode: start, then goal, per agent
      if (pendingStartCell) {
        if (
          pendingStartCell[0] === x &&
          pendingStartCell[1] === y
        ) {
          onPendingStartChange(null);
          return;
        }
        if (!cell.blocked && !agentAtStart && !agentAtGoal) {
          const nextId =
            agents.length === 0
              ? 0
              : Math.max(...agents.map((a) => a.id)) + 1;
          onAgentPlace({
            id: nextId,
            start: pendingStartCell,
            goal: [x, y],
          });
        }
        onPendingStartChange(null);
        return;
      }

      if (cell.blocked) return;
      if (agentAtGoal) {
        onAgentRemove(agentAtGoal.id);
        return;
      }
      if (agentAtStart) return;
      onPendingStartChange([x, y]);
    },
    [grid, agents, pendingStartCell, mode, onGridChange, onAgentRemove, onAgentPlace, onPendingStartChange, rows]
  );

  const resizeRows = useCallback(
    (nextWidth: number, nextHeight: number): string[] => {
      const nextRows = rows.map((r) =>
        (r.slice(0, nextWidth) + '.'.repeat(nextWidth)).slice(0, nextWidth)
      );
      while (nextRows.length < nextHeight) {
        nextRows.push('.'.repeat(nextWidth));
      }
      return nextRows.slice(0, nextHeight);
    },
    [rows]
  );

  const handleWidthChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const w = Math.max(1, Math.min(maxWidth, parseInt(e.target.value, 10) || 1));
      if (w === width) return;
      onSizeChange(w, height);
      onGridChange(resizeRows(w, height));
    },
    [width, height, maxWidth, onSizeChange, onGridChange, resizeRows]
  );

  const handleHeightChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const h = Math.max(1, Math.min(maxHeight, parseInt(e.target.value, 10) || 1));
      if (h === height) return;
      onSizeChange(width, h);
      onGridChange(resizeRows(width, h));
    },
    [width, height, maxHeight, onSizeChange, onGridChange, resizeRows]
  );

  const cellClasses = (cell: CellState) => {
    if (cell.blocked) return 'bg-[#55524B]';
    if (cell.start) return 'bg-[#1E40AF]';
    if (cell.goal) return 'bg-[#B45309]';
    return 'bg-[#EAE6DD]';
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="block text-xs font-medium text-[#44413C]">
          {STRINGS.workspace.customGridWidth}
        </label>
        <input
          type="number"
          min={1}
          max={maxWidth}
          value={width}
          onChange={handleWidthChange}
          className="w-16 px-2 py-1 text-xs bg-white border border-[#D4CFC5] rounded text-center"
          aria-label={`${STRINGS.workspace.customGridWidth} ${width} cells`}
        />
        <span className="text-[11px] text-[#524F49]">×</span>
        <input
          type="number"
          min={1}
          max={maxHeight}
          value={height}
          onChange={handleHeightChange}
          className="w-16 px-2 py-1 text-xs bg-white border border-[#D4CFC5] rounded text-center"
          aria-label={`${STRINGS.workspace.customGridHeight} ${height} cells`}
        />
        <span className="text-[11px] text-[#524F49]">
          {width}×{height} {STRINGS.workspace.gridEditor.capHint.replace('{maxCells}', String(maxCells))}
        </span>
        <button
          type="button"
          onClick={() => {
            setMode('place');
            onPendingStartChange(null);
          }}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer border ${
            mode === 'place'
              ? 'bg-[#1E40AF] text-white border-[#1E40AF]'
              : 'bg-white text-[#524F49] border-[#D4CFC5]'
          } ${focusRing}`}
          aria-pressed={mode === 'place'}
        >
          {STRINGS.workspace.gridEditor.placeAgents}
        </button>
        <button
          type="button"
          onClick={() => setMode('paint')}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer border ${
            mode === 'paint'
              ? 'bg-[#92400E] text-white border-[#92400E]'
              : 'bg-white text-[#524F49] border-[#D4CFC5]'
          } ${focusRing}`}
          aria-pressed={mode === 'paint'}
        >
          {STRINGS.workspace.gridEditor.paintObstacles}
        </button>
        <button
          type="button"
          onClick={onClearGrid}
          className={`px-2 py-1 text-xs text-[#9F1239] hover:bg-[#FFF1F2] rounded cursor-pointer ${focusRing}`}
        >
          {STRINGS.workspace.customGridClear}
        </button>
        <button
          type="button"
          onClick={onClearAgents}
          className={`px-2 py-1 text-xs text-[#9F1239] hover:bg-[#FFF1F2] rounded cursor-pointer ${focusRing}`}
        >
          {STRINGS.workspace.clearAgents}
        </button>
      </div>

      <div
        className="grid gap-[1px] bg-[#524F49] p-[1px] rounded"
        style={{
          gridTemplateColumns: `repeat(${width}, 1fr)`,
          gridTemplateRows: `repeat(${height}, 1fr)`,
          width: Math.min(400, width * 20),
          height: Math.min(400, height * 20),
        }}
        aria-label={STRINGS.workspace.customGridHelp}
        role="region"
      >
        {grid.map((row, y) =>
          row.map((cell, x) => {
            const agentAtStart = agents.find(
              (a) => a.start[0] === x && a.start[1] === y
            );
            const agentAtGoal = agents.find(
              (a) => a.goal[0] === x && a.goal[1] === y
            );
            const isPending =
              pendingStartCell !== null &&
              pendingStartCell[0] === x &&
              pendingStartCell[1] === y;

            return (
              <div
                key={`cell-${x}-${y}`}
                onClick={() => handleCellClick(x, y)}
                className={`w-full h-full cursor-pointer transition-colors text-[9px] font-mono text-center leading-none ${cellClasses(cell)} ${
                  isPending || cell.start || cell.goal
                    ? 'ring-2 ring-[#171614] ring-offset-1 ring-offset-[#EAE6DD]'
                    : ''
                }`}
                aria-label={
                  isPending
                    ? `Pending start at ${x},${y}`
                    : cell.start
                      ? `Agent ${agentAtStart?.id ?? 0} start at ${x},${y}`
                      : cell.goal
                        ? `Agent ${agentAtGoal?.id ?? 0} goal at ${x},${y}`
                        : `Cell ${x},${y} ${cell.blocked ? 'blocked' : 'passable'}`}
              >
                {cell.blocked ? (
                  <span aria-hidden="true">×</span>
                ) : cell.start ? (
                  <span aria-hidden="true">S</span>
                ) : cell.goal ? (
                  <span aria-hidden="true">G</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <p className="text-[11px] text-[#524F49] text-center">
        {STRINGS.workspace.customGridHelp}
      </p>
    </div>
  );
}
