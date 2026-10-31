import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CellCoord, GridConfig, gridToWorld } from '../logic/gridNavigation';
import { ThemeColors } from '../types';

interface ExtrudedGridProps {
  config: GridConfig;
  theme: ThemeColors;
  agent1Cell: CellCoord;
  agent1Target: CellCoord;
  agent2Cell: CellCoord;
  agent2Target: CellCoord;
  hoveredCell: CellCoord | null;
  onHoverCell: (cell: CellCoord | null) => void;
  onSelectCell: (cell: CellCoord) => void;
  targetMarkerCell: CellCoord | null;
}

function createRoundedSquareShape(size: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -size / 2;
  const y = -size / 2;
  const w = size;
  const h = size;
  const r = Math.min(radius, size / 2);
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

interface CellMeshProps {
  cell: CellCoord;
  worldPos: [number, number, number];
  geometry: THREE.ExtrudeGeometry;
  theme: ThemeColors;
  isAgent1Here: boolean;
  isAgent1Target: boolean;
  isAgent2Here: boolean;
  isAgent2Target: boolean;
  isHovered: boolean;
  isDestination: boolean;
  onHover: (cell: CellCoord | null) => void;
  onClick: (cell: CellCoord) => void;
}

const CellMesh: React.FC<CellMeshProps> = ({
  cell,
  worldPos,
  geometry,
  theme,
  isAgent1Here,
  isAgent1Target,
  isAgent2Here,
  isAgent2Target,
  isHovered,
  isDestination,
  onHover,
  onClick,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Target target elevation and emission based on agent presence or hover
  const targetElevation = isAgent1Here || isAgent2Here
    ? 0.08
    : isAgent1Target || isAgent2Target
    ? 0.04
    : isHovered
    ? 0.06
    : isDestination
    ? 0.05
    : 0.0;

  // Emissive color calculation
  let targetEmissive = new THREE.Color(0x000000);
  let targetEmissiveIntensity = 0.0;

  if (isAgent1Here) {
    targetEmissive = new THREE.Color(theme.agent1Color);
    targetEmissiveIntensity = 0.8;
  } else if (isAgent2Here) {
    targetEmissive = new THREE.Color(theme.agent2Color);
    targetEmissiveIntensity = 0.8;
  } else if (isAgent1Target) {
    targetEmissive = new THREE.Color(theme.agent1Accent);
    targetEmissiveIntensity = 0.45;
  } else if (isAgent2Target) {
    targetEmissive = new THREE.Color(theme.agent2Accent);
    targetEmissiveIntensity = 0.45;
  } else if (isDestination) {
    targetEmissive = new THREE.Color(theme.hoverHighlight);
    targetEmissiveIntensity = 0.6;
  } else if (isHovered) {
    targetEmissive = new THREE.Color(theme.hoverHighlight);
    targetEmissiveIntensity = 0.35;
  }

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    // Smooth damp elevation
    const currentY = meshRef.current.position.y;
    const destY = worldPos[1] + targetElevation;
    meshRef.current.position.y = THREE.MathUtils.damp(currentY, destY, 12, delta);

    if (materialRef.current) {
      materialRef.current.emissive.lerp(targetEmissive, Math.min(1, delta * 10));
      materialRef.current.emissiveIntensity = THREE.MathUtils.damp(
        materialRef.current.emissiveIntensity,
        targetEmissiveIntensity,
        12,
        delta
      );
    }
  });

  return (
    <group position={[worldPos[0], 0, worldPos[2]]}>
      <mesh
        ref={meshRef}
        position={[0, worldPos[1], 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(cell);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          onClick(cell);
        }}
      >
        <meshStandardMaterial
          ref={materialRef}
          color={theme.gridCellTop}
          roughness={theme.gridRoughness}
          metalness={theme.gridMetalness}
        />
      </mesh>
    </group>
  );
};

export const ExtrudedGrid: React.FC<ExtrudedGridProps> = ({
  config,
  theme,
  agent1Cell,
  agent1Target,
  agent2Cell,
  agent2Target,
  hoveredCell,
  onHoverCell,
  onSelectCell,
  targetMarkerCell,
}) => {
  // Memoized cell shape & geometry
  const cellGeometry = useMemo(() => {
    const shape = createRoundedSquareShape(config.cellSize, 0.12);
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: config.baseHeight,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035,
    };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center();
    return geom;
  }, [config.cellSize, config.baseHeight]);

  // Plinth/Base dimensions
  const totalGridSpan = config.size * config.cellSize + (config.size - 1) * config.spacing;
  const plinthPadding = 0.5;
  const plinthWidth = totalGridSpan + plinthPadding * 2;
  const plinthShape = useMemo(() => {
    return createRoundedSquareShape(plinthWidth, 0.45);
  }, [plinthWidth]);

  const plinthGeometry = useMemo(() => {
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.25,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06,
    };
    const geom = new THREE.ExtrudeGeometry(plinthShape, extrudeSettings);
    geom.center();
    return geom;
  }, [plinthShape]);

  // List of all cells
  const cells = useMemo(() => {
    const list: { cell: CellCoord; worldPos: [number, number, number] }[] = [];
    for (let x = 0; x < config.size; x++) {
      for (let z = 0; z < config.size; z++) {
        const cell = { x, z };
        const worldPos = gridToWorld(cell, config);
        list.push({ cell, worldPos });
      }
    }
    return list;
  }, [config]);

  return (
    <group position={[0, 0, 0]}>
      {/* Underlying Plinth Base Tray */}
      <mesh
        position={[0, -0.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={plinthGeometry}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial
          color={theme.plinthBase}
          roughness={0.65}
          metalness={0.3}
        />
      </mesh>

      {/* Recessed Accent Frame Trim */}
      <mesh position={[0, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[totalGridSpan + 0.1, totalGridSpan + 0.1]} />
        <meshStandardMaterial
          color={theme.gridCellBase}
          roughness={0.7}
          metalness={0.2}
        />
      </mesh>

      {/* Individual Extruded Interactive Grid Cells */}
      {cells.map(({ cell, worldPos }) => {
        const isAgent1Here = agent1Cell.x === cell.x && agent1Cell.z === cell.z;
        const isAgent1Target = agent1Target.x === cell.x && agent1Target.z === cell.z;
        const isAgent2Here = agent2Cell.x === cell.x && agent2Cell.z === cell.z;
        const isAgent2Target = agent2Target.x === cell.x && agent2Target.z === cell.z;
        const isHovered = hoveredCell !== null && hoveredCell.x === cell.x && hoveredCell.z === cell.z;
        const isDestination = targetMarkerCell !== null && targetMarkerCell.x === cell.x && targetMarkerCell.z === cell.z;

        return (
          <CellMesh
            key={`${cell.x}-${cell.z}`}
            cell={cell}
            worldPos={worldPos}
            geometry={cellGeometry}
            theme={theme}
            isAgent1Here={isAgent1Here}
            isAgent1Target={isAgent1Target}
            isAgent2Here={isAgent2Here}
            isAgent2Target={isAgent2Target}
            isHovered={isHovered}
            isDestination={isDestination}
            onHover={onHoverCell}
            onClick={onSelectCell}
          />
        );
      })}

      {/* Active Target Destination Hologram Beacon if user clicked a cell */}
      {targetMarkerCell && (
        <group
          position={gridToWorld(targetMarkerCell, config)}
        >
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.25, 0.38, 32]} />
            <meshBasicMaterial
              color={theme.hoverHighlight}
              transparent
              opacity={0.65}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.35, 16]} />
            <meshBasicMaterial
              color={theme.hoverHighlight}
              transparent
              opacity={0.75}
            />
          </mesh>
        </group>
      )}
    </group>
  );
};
