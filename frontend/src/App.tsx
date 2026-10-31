import { useState, useEffect, useCallback } from 'react';
import { CanvasScene } from './components/CanvasScene';
import { HudOverlay } from './components/HudOverlay';
import { THEMES, ThemeMode, CameraPreset } from './types';
import { CellCoord } from './logic/gridNavigation';

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('obsidian');
  const [speed, setSpeed] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [interactiveDestination, setInteractiveDestination] = useState<CellCoord | null>(null);

  const [agent1Telemetry, setAgent1Telemetry] = useState<{
    cell: CellCoord;
    pos: [number, number, number];
    status: string;
  }>({
    cell: { x: 1, z: 1 },
    pos: [0, 0, 0],
    status: 'Gliding',
  });

  const [agent2Telemetry, setAgent2Telemetry] = useState<{
    cell: CellCoord;
    pos: [number, number, number];
    status: string;
  }>({
    cell: { x: 5, z: 5 },
    pos: [0, 0, 0],
    status: 'Gliding',
  });

  const handleUpdateTelemetry = useCallback(
    (
      a1: { cell: CellCoord; pos: [number, number, number]; status: string },
      a2: { cell: CellCoord; pos: [number, number, number]; status: string }
    ) => {
      setAgent1Telemetry(a1);
      setAgent2Telemetry(a2);
    },
    []
  );

  const handleSelectCellFrom3D = useCallback((cell: CellCoord) => {
    setInteractiveDestination(cell);
  }, []);

  const handleClearDestination = useCallback(() => {
    setInteractiveDestination(null);
  }, []);

  // Keyboard controls for power users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPaused((p) => !p);
      } else if (e.key === 't' || e.key === 'T') {
        setShowTrails((t) => !t);
      } else if (e.key === '1') {
        setSpeed(0.5);
      } else if (e.key === '2') {
        setSpeed(1);
      } else if (e.key === '3') {
        setSpeed(2);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentTheme = THEMES[themeMode];

  return (
    <main
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{ backgroundColor: currentTheme.bg }}
    >
      {/* 3D WebGL Canvas Layer */}
      <CanvasScene
        theme={currentTheme}
        speedMultiplier={speed}
        isPaused={isPaused}
        cameraPreset={cameraPreset}
        showTrails={showTrails}
        onUpdateAgentTelemetry={handleUpdateTelemetry}
        interactiveDestination={interactiveDestination}
        onClearDestination={handleClearDestination}
        onSelectCellFrom3D={handleSelectCellFrom3D}
      />

      {/* Ergonomic Non-Obstructive UI Layer */}
      <HudOverlay
        themeMode={themeMode}
        onSelectTheme={setThemeMode}
        speed={speed}
        onSetSpeed={setSpeed}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused((p) => !p)}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={setCameraPreset}
        showTrails={showTrails}
        onToggleTrails={() => setShowTrails((t) => !t)}
        agent1Telemetry={agent1Telemetry}
        agent2Telemetry={agent2Telemetry}
        interactiveDestination={interactiveDestination}
        onClearDestination={handleClearDestination}
      />
    </main>
  );
}
