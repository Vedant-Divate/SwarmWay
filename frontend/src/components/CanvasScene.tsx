import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  CellCoord,
  GridConfig,
  gridToWorld,
  chooseNextCell,
  interpolateAgentPosition,
} from '../logic/gridNavigation';
import { ThemeColors, CameraPreset } from '../types';
import { ExtrudedGrid } from './ExtrudedGrid';
import { AgentSpectra } from './AgentSpectra';
import { AgentApex } from './AgentApex';
import { AgentTrail } from './AgentTrail';

interface CanvasSceneProps {
  theme: ThemeColors;
  speedMultiplier: number;
  isPaused: boolean;
  cameraPreset: CameraPreset;
  showTrails: boolean;
  onUpdateAgentTelemetry: (
    agent1: { cell: CellCoord; pos: [number, number, number]; status: string },
    agent2: { cell: CellCoord; pos: [number, number, number]; status: string }
  ) => void;
  interactiveDestination: CellCoord | null;
  onClearDestination: () => void;
  onSelectCellFrom3D: (cell: CellCoord) => void;
}

const GRID_CONFIG: GridConfig = {
  size: 7, // 7x7 grid
  cellSize: 1.1,
  spacing: 0.22,
  baseHeight: 0.28,
};

// Detect software WebGL to adapt dpr and shadows safely
const isSoftwareGl = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
})();

// Camera controller component
const SceneCameraController: React.FC<{
  preset: CameraPreset;
  agent1Pos: [number, number, number];
  agent2Pos: [number, number, number];
}> = ({ preset, agent1Pos, agent2Pos }) => {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  // Target positions based on preset
  let targetCamPos = new THREE.Vector3(9.2, 10.2, 9.2);
  let targetLookAt = new THREE.Vector3(0, -0.4, 0);

  if (preset === 'isometric') {
    targetCamPos = new THREE.Vector3(9.2, 10.2, 9.2);
    targetLookAt = new THREE.Vector3(0, -0.4, 0);
  } else if (preset === 'angled') {
    targetCamPos = new THREE.Vector3(0, 6.5, 9.8);
    targetLookAt = new THREE.Vector3(0, -0.2, 0);
  } else if (preset === 'top') {
    targetCamPos = new THREE.Vector3(0.01, 13.5, 0.01);
    targetLookAt = new THREE.Vector3(0, 0, 0);
  } else if (preset === 'agent1') {
    targetCamPos = new THREE.Vector3(agent1Pos[0] + 3.8, agent1Pos[1] + 4.2, agent1Pos[2] + 3.8);
    targetLookAt = new THREE.Vector3(agent1Pos[0], agent1Pos[1], agent1Pos[2]);
  } else if (preset === 'agent2') {
    targetCamPos = new THREE.Vector3(agent2Pos[0] - 3.8, agent2Pos[1] + 4.2, agent2Pos[2] + 3.8);
    targetLookAt = new THREE.Vector3(agent2Pos[0], agent2Pos[1], agent2Pos[2]);
  }

  useFrame((_, delta) => {
    // Smooth camera damping
    camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamPos.x, 5, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamPos.y, 5, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamPos.z, 5, delta);

    if (controlsRef.current) {
      controlsRef.current.target.x = THREE.MathUtils.damp(
        controlsRef.current.target.x,
        targetLookAt.x,
        5,
        delta
      );
      controlsRef.current.target.y = THREE.MathUtils.damp(
        controlsRef.current.target.y,
        targetLookAt.y,
        5,
        delta
      );
      controlsRef.current.target.z = THREE.MathUtils.damp(
        controlsRef.current.target.z,
        targetLookAt.z,
        5,
        delta
      );
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping={!isSoftwareGl}
      dampingFactor={0.05}
      minDistance={3.5}
      maxDistance={22}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  );
};

// Simulation inner content inside R3F Canvas
const SceneContent: React.FC<CanvasSceneProps> = ({
  theme,
  speedMultiplier,
  isPaused,
  cameraPreset,
  showTrails,
  onUpdateAgentTelemetry,
  interactiveDestination,
  onClearDestination,
  onSelectCellFrom3D,
}) => {
  // Agent 1 state: starts at (1, 1), targets (2, 1)
  const agent1Ref = useRef({
    currentCell: { x: 1, z: 1 } as CellCoord,
    targetCell: { x: 2, z: 1 } as CellCoord,
    progress: 0,
    position: gridToWorld({ x: 1, z: 1 }, GRID_CONFIG),
    rotationY: 0,
    tilt: [0, 0, 0] as [number, number, number],
    status: 'Gliding',
    trail: [] as [number, number, number][],
    assignedDestination: null as CellCoord | null,
  });

  // Agent 2 state: starts at (5, 5), targets (4, 5)
  const agent2Ref = useRef({
    currentCell: { x: 5, z: 5 } as CellCoord,
    targetCell: { x: 4, z: 5 } as CellCoord,
    progress: 0,
    position: gridToWorld({ x: 5, z: 5 }, GRID_CONFIG),
    rotationY: 0,
    tilt: [0, 0, 0] as [number, number, number],
    status: 'Gliding',
    trail: [] as [number, number, number][],
    assignedDestination: null as CellCoord | null,
  });

  // Hover state
  const [hoveredCell, setHoveredCell] = useState<CellCoord | null>(null);

  // Visual render states updated per tick
  const [a1Render, setA1Render] = useState({
    pos: agent1Ref.current.position,
    rotY: 0,
    tilt: [0, 0, 0] as [number, number, number],
    cell: agent1Ref.current.currentCell,
    target: agent1Ref.current.targetCell,
    trail: [] as [number, number, number][],
  });

  const [a2Render, setA2Render] = useState({
    pos: agent2Ref.current.position,
    rotY: 0,
    tilt: [0, 0, 0] as [number, number, number],
    cell: agent2Ref.current.currentCell,
    target: agent2Ref.current.targetCell,
    trail: [] as [number, number, number][],
  });

  // Assign interactive destination to whichever agent is closer
  useEffect(() => {
    if (!interactiveDestination) return;
    const a1 = agent1Ref.current;
    const a2 = agent2Ref.current;

    const d1 =
      Math.abs(a1.currentCell.x - interactiveDestination.x) +
      Math.abs(a1.currentCell.z - interactiveDestination.z);
    const d2 =
      Math.abs(a2.currentCell.x - interactiveDestination.x) +
      Math.abs(a2.currentCell.z - interactiveDestination.z);

    if (d1 <= d2) {
      a1.assignedDestination = interactiveDestination;
    } else {
      a2.assignedDestination = interactiveDestination;
    }
  }, [interactiveDestination]);

  // Main simulation tick
  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();
    const effectiveDelta = isPaused ? 0 : Math.min(delta, 0.1) * speedMultiplier;

    const a1 = agent1Ref.current;
    const a2 = agent2Ref.current;

    const baseGlideSpeed = 1.1; // cells per second

    // --- Update Agent 1 ---
    if (!isPaused) {
      a1.progress += effectiveDelta * baseGlideSpeed;
      if (a1.progress >= 1.0) {
        a1.progress = 0;
        a1.currentCell = a1.targetCell;

        // Check if destination arrived
        if (
          a1.assignedDestination &&
          a1.currentCell.x === a1.assignedDestination.x &&
          a1.currentCell.z === a1.assignedDestination.z
        ) {
          a1.assignedDestination = null;
          onClearDestination();
        }

        // Pick next cell
        const next = chooseNextCell(
          a1.currentCell,
          a1.assignedDestination,
          GRID_CONFIG.size,
          [a2.currentCell, a2.targetCell]
        );
        a1.targetCell = next;
      }

      const start1 = gridToWorld(a1.currentCell, GRID_CONFIG);
      const end1 = gridToWorld(a1.targetCell, GRID_CONFIG);
      const interp1 = interpolateAgentPosition(start1, end1, a1.progress, 0.42, elapsed);
      a1.position = interp1.position;
      a1.rotationY = interp1.rotationY;
      a1.tilt = interp1.tilt;
      a1.status = a1.assignedDestination ? 'Intercepting' : 'Patrolling';

      // Update trail
      if (a1.trail.length === 0 || distance3D(a1.trail[a1.trail.length - 1], a1.position) > 0.25) {
        a1.trail.push([...a1.position]);
        if (a1.trail.length > 20) a1.trail.shift();
      }
    }

    // --- Update Agent 2 ---
    if (!isPaused) {
      a2.progress += effectiveDelta * (baseGlideSpeed * 0.95);
      if (a2.progress >= 1.0) {
        a2.progress = 0;
        a2.currentCell = a2.targetCell;

        if (
          a2.assignedDestination &&
          a2.currentCell.x === a2.assignedDestination.x &&
          a2.currentCell.z === a2.assignedDestination.z
        ) {
          a2.assignedDestination = null;
          onClearDestination();
        }

        const next = chooseNextCell(
          a2.currentCell,
          a2.assignedDestination,
          GRID_CONFIG.size,
          [a1.currentCell, a1.targetCell]
        );
        a2.targetCell = next;
      }

      const start2 = gridToWorld(a2.currentCell, GRID_CONFIG);
      const end2 = gridToWorld(a2.targetCell, GRID_CONFIG);
      const interp2 = interpolateAgentPosition(start2, end2, a2.progress, 0.42, elapsed + 10);
      a2.position = interp2.position;
      a2.rotationY = interp2.rotationY;
      a2.tilt = interp2.tilt;
      a2.status = a2.assignedDestination ? 'Intercepting' : 'Patrolling';

      if (a2.trail.length === 0 || distance3D(a2.trail[a2.trail.length - 1], a2.position) > 0.25) {
        a2.trail.push([...a2.position]);
        if (a2.trail.length > 20) a2.trail.shift();
      }
    }

    // Sync render states
    setA1Render({
      pos: a1.position,
      rotY: a1.rotationY,
      tilt: a1.tilt,
      cell: a1.currentCell,
      target: a1.targetCell,
      trail: a1.trail,
    });
    setA2Render({
      pos: a2.position,
      rotY: a2.rotationY,
      tilt: a2.tilt,
      cell: a2.currentCell,
      target: a2.targetCell,
      trail: a2.trail,
    });

    onUpdateAgentTelemetry(
      { cell: a1.currentCell, pos: a1.position, status: a1.status },
      { cell: a2.currentCell, pos: a2.position, status: a2.status }
    );
  });

  return (
    <>
      {/* Dynamic Camera Controller */}
      <SceneCameraController
        preset={cameraPreset}
        agent1Pos={a1Render.pos}
        agent2Pos={a2Render.pos}
      />

      {/* Atmospheric Fog */}
      <fog attach="fog" args={[theme.fog, 10, 32]} />

      {/* Studio Lighting Rig */}
      <ambientLight intensity={0.7} />
      <hemisphereLight
        color="#f8fafc"
        groundColor={theme.bg}
        intensity={0.85}
      />

      {/* Warm Key Light with PCF Soft Shadows */}
      <directionalLight
        position={[7, 12, 7]}
        intensity={1.8}
        castShadow={!isSoftwareGl}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      {/* Cool Rim Accent Light */}
      <directionalLight
        position={[-8, 6, -8]}
        intensity={0.8}
        color="#38bdf8"
      />

      {/* Soft Top Down Highlight for Agent Silhouette */}
      <directionalLight
        position={[0, 10, 0]}
        intensity={0.5}
        color="#ffffff"
      />

      {/* The Interactive Extruded Grid */}
      <ExtrudedGrid
        config={GRID_CONFIG}
        theme={theme}
        agent1Cell={a1Render.cell}
        agent1Target={a1Render.target}
        agent2Cell={a2Render.cell}
        agent2Target={a2Render.target}
        hoveredCell={hoveredCell}
        onHoverCell={setHoveredCell}
        onSelectCell={onSelectCellFrom3D}
        targetMarkerCell={interactiveDestination}
      />

      {/* Gliding Agent 1: Spectra */}
      <AgentSpectra
        position={a1Render.pos}
        rotationY={a1Render.rotY}
        tilt={a1Render.tilt}
        color={theme.agent1Color}
        accentColor={theme.agent1Accent}
      />

      {/* Gliding Agent 2: Apex */}
      <AgentApex
        position={a2Render.pos}
        rotationY={a2Render.rotY}
        tilt={a2Render.tilt}
        color={theme.agent2Color}
        accentColor={theme.agent2Accent}
      />

      {/* Luminous Motion Trails */}
      {showTrails && (
        <>
          <AgentTrail trail={a1Render.trail} color={theme.agent1Color} />
          <AgentTrail trail={a2Render.trail} color={theme.agent2Color} />
        </>
      )}

      {/* Ground Contact Shadows Plane */}
      <ContactShadows
        position={[0, -0.42, 0]}
        opacity={0.6}
        scale={16}
        blur={2}
        far={4}
        color="#000000"
      />
    </>
  );
};

function distance3D(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export const CanvasScene: React.FC<CanvasSceneProps> = (props) => {
  return (
    <div className="w-full h-full relative" data-testid="r3f-canvas-container">
      <Canvas
        camera={{ position: [7.5, 8.5, 7.5], fov: 42 }}
        dpr={isSoftwareGl ? 1 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)}
        shadows={!isSoftwareGl}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
      >
        <SceneContent {...props} />
      </Canvas>
    </div>
  );
};
