import React, { useState } from 'react';
import { CameraPreset, ThemeMode } from '../types';
import { CellCoord } from '../logic/gridNavigation';

interface HudOverlayProps {
  themeMode: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
  speed: number;
  onSetSpeed: (speed: number) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  cameraPreset: CameraPreset;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  showTrails: boolean;
  onToggleTrails: () => void;
  agent1Telemetry: { cell: CellCoord; pos: [number, number, number]; status: string };
  agent2Telemetry: { cell: CellCoord; pos: [number, number, number]; status: string };
  interactiveDestination: CellCoord | null;
  onClearDestination: () => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  themeMode,
  onSelectTheme,
  speed,
  onSetSpeed,
  isPaused,
  onTogglePause,
  cameraPreset,
  onSelectCameraPreset,
  showTrails,
  onToggleTrails,
  agent1Telemetry,
  agent2Telemetry,
  interactiveDestination,
  onClearDestination,
}) => {
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 sm:p-6 select-none font-sans">
      {/* Top Bar: Title & Live Agent Coordinates */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
        {/* Title & Brand Badge */}
        <div className="pointer-events-auto bg-[#0f141f]/90 border border-slate-700/60 rounded-xl px-4 py-2.5 shadow-xl">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400" />
            <h1 className="text-xs font-bold tracking-widest text-slate-100 uppercase">
              Kinetic Grid Agents
            </h1>
            <span className="text-[10px] text-slate-400 font-mono border-l border-slate-700 pl-2">
              R3F / Three.js
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Two autonomous kinetic agents navigating an extruded spatial coordinate matrix
          </p>
        </div>

        {/* Telemetry Readout */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Agent 1 Telemetry */}
          <div className="bg-[#0f141f]/90 border border-slate-700/60 rounded-xl px-3 py-2 text-right shadow-xl">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-[11px] font-semibold text-cyan-300 tracking-wider">SPECTRA-01</span>
            </div>
            <div className="text-[10px] font-mono text-slate-300 mt-0.5">
              Cell: [{agent1Telemetry.cell.x}, {agent1Telemetry.cell.z}] • {agent1Telemetry.status}
            </div>
          </div>

          {/* Agent 2 Telemetry */}
          <div className="bg-[#0f141f]/90 border border-slate-700/60 rounded-xl px-3 py-2 text-right shadow-xl">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[11px] font-semibold text-amber-300 tracking-wider">APEX-02</span>
            </div>
            <div className="text-[10px] font-mono text-slate-300 mt-0.5">
              Cell: [{agent2Telemetry.cell.x}, {agent2Telemetry.cell.z}] • {agent2Telemetry.status}
            </div>
          </div>
        </div>
      </header>

      {/* Middle Interactive Notification (if cell targeted) */}
      <div className="flex justify-center w-full">
        {interactiveDestination ? (
          <div className="pointer-events-auto bg-[#131b2e]/95 border border-indigo-500/50 rounded-full px-4 py-1.5 flex items-center gap-3 shadow-2xl">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span className="text-xs text-indigo-100 font-mono">
              Intercept waypoint active: [{interactiveDestination.x}, {interactiveDestination.z}]
            </span>
            <button
              onClick={onClearDestination}
              className="text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="bg-[#0f141f]/75 border border-slate-800 rounded-full px-3.5 py-1 text-[11px] text-slate-400 font-mono shadow-md">
            Tip: Click any grid cell to dispatch nearest agent • Drag to rotate camera
          </div>
        )}
      </div>

      {/* Unified Bottom Control Dock (Zero Viewport Occlusion, per threejs skill) */}
      <footer className="w-full flex flex-col items-center">
        {/* Toggle Collapse Button */}
        <button
          onClick={() => setIsDockCollapsed((prev) => !prev)}
          className="pointer-events-auto mb-2 bg-[#0f141f]/90 hover:bg-[#1a2233] text-slate-300 hover:text-white border border-slate-700/60 rounded-full px-3.5 py-1 text-xs font-mono transition-all shadow-md cursor-pointer flex items-center gap-1.5"
          aria-label={isDockCollapsed ? 'Expand control dock' : 'Collapse control dock'}
        >
          <span>{isDockCollapsed ? '▴ Show Controls' : '▾ Hide Controls'}</span>
        </button>

        {/* Collapsible Dock */}
        {!isDockCollapsed && (
          <div
            className="pointer-events-auto w-full max-w-4xl bg-[#0f141f]/95 border border-slate-700/60 rounded-2xl p-3 sm:p-4 shadow-2xl flex flex-wrap items-center justify-between gap-4 transition-all"
            role="region"
            aria-label="Simulation Controls"
          >
            {/* Speed & Playback */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Playback</span>
              <button
                onClick={onTogglePause}
                className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors border ${
                  isPaused
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>

              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                {[0.5, 1, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => onSetSpeed(s)}
                    className={`px-2.5 py-0.5 rounded-md text-xs font-mono cursor-pointer transition-colors ${
                      speed === s && !isPaused
                        ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Camera View Angle Presets */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mr-1">Camera</span>
              {(
                [
                  ['isometric', 'Isometric'],
                  ['angled', 'Angled'],
                  ['top', 'Top-Down'],
                  ['agent1', 'Spectra'],
                  ['agent2', 'Apex'],
                ] as [CameraPreset, string][]
              ).map(([presetKey, label]) => (
                <button
                  key={presetKey}
                  onClick={() => onSelectCameraPreset(presetKey)}
                  className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-colors border ${
                    cameraPreset === presetKey
                      ? 'bg-slate-200 text-slate-900 font-semibold border-white'
                      : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Visual Finish & Trails */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                {(
                  [
                    ['obsidian', 'Obsidian'],
                    ['minimal', 'Minimal'],
                    ['titanium', 'Titanium'],
                  ] as [ThemeMode, string][]
                ).map(([themeKey, label]) => (
                  <button
                    key={themeKey}
                    onClick={() => onSelectTheme(themeKey)}
                    className={`px-2 py-0.5 rounded-md text-xs cursor-pointer transition-colors ${
                      themeMode === themeKey
                        ? 'bg-indigo-500/25 text-indigo-300 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Trail Toggle */}
              <button
                onClick={onToggleTrails}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors border ${
                  showTrails
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                    : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                }`}
                title="Toggle visual kinetic particle trail"
              >
                Trails {showTrails ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
};
