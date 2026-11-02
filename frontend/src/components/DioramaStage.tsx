import { type MutableRefObject, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Billboard, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { AgentSpec, GridPoint, SearchConflict, SearchConstraint } from '../types';
import {
  getAgentIdentity,
  parseGridRows,
  sampleAgentPose,
  sampleTrailPoints,
} from '../utils/mapf';
import { detectSoftwareGl, usePageVisible } from '../utils/prefs';

export type CameraViewKind = 'reset' | 'top' | 'follow';

export interface CameraViewRequest {
  kind: CameraViewKind;
  seq: number;
}

export interface DioramaStageProps {
  mapWidth: number;
  mapHeight: number;
  mapRows: string[];
  agents: AgentSpec[];
  paths: GridPoint[][];
  ghostPaths?: GridPoint[][];
  playbackTime: number;
  playbackTimeRef?: RefObject<number>;
  invalidateRef?: MutableRefObject<(() => void) | null>;
  isPlaying: boolean;
  assembleProgress: number; // 0..1 when assembling, 1 during normal playback
  reducedMotion: boolean;
  autoOrbitIdle?: boolean;
  selectedAgentId: number | null;
  hoveredAgentId: number | null;
  onSelectAgent?: (agentId: number | null) => void;
  onHoverAgent?: (agentId: number | null) => void;
  placementMode?: boolean;
  pendingStartCell?: GridPoint | null;
  onCellClick?: (cell: GridPoint) => void;
  activeConflict?: SearchConflict | null;
  activeConstraint?: SearchConstraint | null;
  cameraResetTrigger?: number;
  cameraViewRequest?: CameraViewRequest;
  ariaLabel: string;
}

// Reusable module-scope math temporaries to guarantee zero GC in useFrame
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _black = new THREE.Color(0x000000);
const _euler = new THREE.Euler();

const CAMERA_TWEEN_DURATION = 0.65;
const MIN_POLAR_DEFAULT = THREE.MathUtils.degToRad(14);
const MAX_POLAR_DEFAULT = THREE.MathUtils.degToRad(74);
const MIN_POLAR_TOP = 0.02;

// Single module-level tween state object for zero-GC damped camera preset transitions
const _cameraTween = {
  active: false,
  kind: 'reset' as CameraViewKind,
  t0: 0,
  startPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(),
  startTarget: new THREE.Vector3(),
  endTarget: new THREE.Vector3(),
};

function computeResetCameraFraming(
  dist: number,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3
): void {
  // Flattering ~40° elevation angle framed slightly above bottom dock
  const elevRad = THREE.MathUtils.degToRad(40);
  const azimRad = THREE.MathUtils.degToRad(34);
  const horiz = Math.cos(elevRad) * dist;
  const y = Math.sin(elevRad) * dist;
  const targetY = -0.35;
  outTarget.set(0, targetY, 0);
  outPos.set(Math.sin(azimRad) * horiz, y + targetY, Math.cos(azimRad) * horiz);
}

const BODY_SCALE = 1.08;

function gridToWorld(gx: number, gy: number, width: number, height: number): [number, number] {
  return [gx - (width - 1) / 2, gy - (height - 1) / 2];
}

function createMatteTileTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      const ny = Math.min(y, size - 1 - y) / (size * 0.5);
      for (let x = 0; x < size; x++) {
        const nx = Math.min(x, size - 1 - x) / (size * 0.5);
        const edgeMetric = Math.min(nx, ny);
        // Subtle matte chamfer darkening along outer 14% of each tile
        const bevelT = Math.min(1, edgeMetric / 0.14);
        const smoothBevel = bevelT * bevelT * (3 - 2 * bevelT);
        // Deterministic fine mineral grain (zero Math.random)
        const hash = ((x * 73856093) ^ (y * 19349663)) & 7;
        const grain = (hash - 3.5) * 0.9;
        const base = 224 + smoothBevel * 29 + grain;
        const idx = (y * size + x) * 4;
        data[idx] = Math.max(0, Math.min(255, Math.round(base)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(base - 2)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(base - 5)));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createWallContactAoTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const extent = 1.46;
  const wallHalf = 0.45;
  const cornerR = 0.045;
  const skirtSpan = 0.26;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let py = 0; py < size; py++) {
      const uz = ((py + 0.5) / size - 0.5) * extent;
      for (let px = 0; px < size; px++) {
        const ux = ((px + 0.5) / size - 0.5) * extent;
        const qx = Math.max(0, Math.abs(ux) - (wallHalf - cornerR));
        const qz = Math.max(0, Math.abs(uz) - (wallHalf - cornerR));
        const sdf = Math.hypot(qx, qz) - cornerR;

        let alpha = 0;
        if (sdf <= 0) {
          alpha = 0.46;
        } else if (sdf < skirtSpan) {
          const u = 1 - sdf / skirtSpan;
          alpha = Math.pow(u, 1.65) * 0.46;
        }

        const idx = (py * size + px) * 4;
        data[idx] = 26;
        data[idx + 1] = 23;
        data[idx + 2] = 20;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createPlinthGroundingShadowTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const half = (size - 1) * 0.5;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let py = 0; py < size; py++) {
      const ny = (py - half) / half;
      for (let px = 0; px < size; px++) {
        const nx = (px - half) / half;
        const r = Math.hypot(nx, ny);
        const alpha = r >= 1 ? 0 : Math.pow(1 - r * r, 1.2) * 0.34;

        const idx = (py * size + px) * 4;
        data[idx] = 26;
        data[idx + 1] = 23;
        data[idx + 2] = 20;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

interface BoardMeshProps {
  width: number;
  height: number;
  rows: string[];
  placementMode: boolean;
  pendingStartCell: GridPoint | null;
  onCellClick?: (cell: GridPoint) => void;
  onHoverCellChange?: (hovered: boolean) => void;
}

function BoardDiorama({
  width,
  height,
  rows,
  placementMode,
  pendingStartCell,
  onCellClick,
  onHoverCellChange,
}: BoardMeshProps) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const parsed = useMemo(() => parseGridRows(width, height, rows), [width, height, rows]);

  const [hoverCell, setHoverCell] = useState<GridPoint | null>(null);

  const freeRef = useRef<THREE.InstancedMesh | null>(null);
  const wallRef = useRef<THREE.InstancedMesh | null>(null);
  const wallAoRef = useRef<THREE.InstancedMesh | null>(null);

  const plinthWidth = width + 0.72;
  const plinthDepth = height + 0.72;
  const groutWidth = width + 0.12;
  const groutDepth = height + 0.12;

  const maxAnisotropy = useMemo(() => gl.capabilities.getMaxAnisotropy(), [gl]);
  const tileTex = useMemo(() => createMatteTileTexture(maxAnisotropy), [maxAnisotropy]);
  const wallAoTex = useMemo(() => createWallContactAoTexture(maxAnisotropy), [maxAnisotropy]);
  const plinthShadowTex = useMemo(
    () => createPlinthGroundingShadowTexture(maxAnisotropy),
    [maxAnisotropy]
  );

  const tileGeo = useMemo(() => new THREE.BoxGeometry(0.92, 0.08, 0.92), []);
  const wallGeo = useMemo(() => new THREE.BoxGeometry(0.92, 0.56, 0.92), []);
  const wallAoGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1.46, 1.46);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);
  const plinthShadowGeo = useMemo(
    () => new THREE.PlaneGeometry(plinthWidth + 2.6, plinthDepth + 2.6),
    [plinthWidth, plinthDepth]
  );
  const plinthShadowGeoRef = useRef(plinthShadowGeo);

  const tileMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: tileTex,
        roughness: 0.9,
        metalness: 0.02,
      }),
    [tileTex]
  );

  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.84,
        metalness: 0.04,
      }),
    []
  );

  const wallAoMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: wallAoTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    [wallAoTex]
  );

  const plinthShadowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: plinthShadowTex,
        transparent: true,
        depthWrite: false,
      }),
    [plinthShadowTex]
  );

  useEffect(() => {
    const prev = plinthShadowGeoRef.current;
    if (prev !== plinthShadowGeo) {
      prev.dispose();
      plinthShadowGeoRef.current = plinthShadowGeo;
    }
  }, [plinthShadowGeo]);

  // Dispose geometries, materials, and procedural textures on unmount
  useEffect(() => {
    return () => {
      tileGeo.dispose();
      wallGeo.dispose();
      wallAoGeo.dispose();
      plinthShadowGeoRef.current.dispose();
      tileMat.dispose();
      wallMat.dispose();
      wallAoMat.dispose();
      plinthShadowMat.dispose();
      tileTex.dispose();
      wallAoTex.dispose();
      plinthShadowTex.dispose();
    };
  }, [
    tileGeo,
    wallGeo,
    wallAoGeo,
    tileMat,
    wallMat,
    wallAoMat,
    plinthShadowMat,
    tileTex,
    wallAoTex,
    plinthShadowTex,
  ]);

  // Populate instanced floor tiles with deeper matte limestone tones
  useEffect(() => {
    const mesh = freeRef.current;
    if (!mesh) return;
    const count = parsed.freeCells.length;
    mesh.count = count;

    for (let i = 0; i < count; i++) {
      const [gx, gy] = parsed.freeCells[i];
      const [wx, wz] = gridToWorld(gx, gy, width, height);
      _pos.set(wx, 0.04, wz);
      _quat.identity();
      _scale.set(1, 1, 1);
      _mat4.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _mat4);

      const checker = (gx + gy) % 2 === 0;
      _color.set(checker ? '#DDD7CA' : '#D0C9BB');
      mesh.setColorAt(i, _color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parsed, width, height]);

  // Populate instanced raised obstacle blocks & soft grounded contact darkening skirts
  useEffect(() => {
    const mesh = wallRef.current;
    const aoMesh = wallAoRef.current;
    const count = parsed.blockedCells.length;

    if (mesh) {
      mesh.count = count;
      for (let i = 0; i < count; i++) {
        const [gx, gy] = parsed.blockedCells[i];
        const [wx, wz] = gridToWorld(gx, gy, width, height);
        // Slight deterministic height variation for architectural tactility
        const hScale = 0.92 + (((gx * 7 + gy * 13) % 5) * 0.04);
        _pos.set(wx, (0.56 * hScale) / 2, wz);
        _quat.identity();
        _scale.set(1, hScale, 1);
        _mat4.compose(_pos, _quat, _scale);
        mesh.setMatrixAt(i, _mat4);

        const shade = ((gx * 3 + gy * 5) % 3) === 0 ? '#4A4741' : '#55524B';
        _color.set(shade);
        mesh.setColorAt(i, _color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }

    if (aoMesh) {
      aoMesh.count = count;
      for (let i = 0; i < count; i++) {
        const [gx, gy] = parsed.blockedCells[i];
        const [wx, wz] = gridToWorld(gx, gy, width, height);
        _pos.set(wx, 0.082, wz);
        _quat.identity();
        _scale.set(1, 1, 1);
        _mat4.compose(_pos, _quat, _scale);
        aoMesh.setMatrixAt(i, _mat4);
      }
      aoMesh.instanceMatrix.needsUpdate = true;
      aoMesh.computeBoundingSphere();
    }
  }, [parsed, width, height]);

  const handleTileClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!placementMode || !onCellClick) return;
      if (e.delta > 6) return; // Ignore orbit drags
      const idx = e.instanceId;
      if (idx === undefined || idx < 0 || idx >= parsed.freeCells.length) return;
      e.stopPropagation();
      const cell = parsed.freeCells[idx];
      onCellClick(cell);
    },
    [placementMode, onCellClick, parsed]
  );

  const handleTilePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!placementMode) return;
      const idx = e.instanceId;
      if (idx === undefined || idx < 0 || idx >= parsed.freeCells.length) return;
      const cell = parsed.freeCells[idx];
      setHoverCell((prev) =>
        prev && prev[0] === cell[0] && prev[1] === cell[1] ? prev : cell
      );
    },
    [placementMode, parsed]
  );

  const handleTilePointerOut = useCallback(() => {
    setHoverCell((prev) => (prev === null ? prev : null));
  }, []);

  useEffect(() => {
    if (!placementMode) {
      setHoverCell((prev) => (prev === null ? prev : null));
    }
  }, [placementMode]);

  const isHoveringCell = hoverCell !== null;
  useEffect(() => {
    onHoverCellChange?.(isHoveringCell);
    return () => {
      onHoverCellChange?.(false);
    };
  }, [isHoveringCell, onHoverCellChange]);

  useEffect(() => {
    invalidate();
  }, [hoverCell, pendingStartCell, placementMode, invalidate]);

  const placementGuideLine = useMemo(() => {
    if (!placementMode || !pendingStartCell || !hoverCell) return null;
    if (
      pendingStartCell[0] === hoverCell[0] &&
      pendingStartCell[1] === hoverCell[1]
    ) {
      return null;
    }

    const [sx, sz] = gridToWorld(pendingStartCell[0], pendingStartCell[1], width, height);
    const [hx, hz] = gridToWorld(hoverCell[0], hoverCell[1], width, height);
    const pts: THREE.Vector3[] = [new THREE.Vector3(sx, 0.093, sz)];

    if (
      pendingStartCell[0] !== hoverCell[0] &&
      pendingStartCell[1] !== hoverCell[1]
    ) {
      const [cx, cz] = gridToWorld(hoverCell[0], pendingStartCell[1], width, height);
      pts.push(new THREE.Vector3(cx, 0.093, cz));
    }

    pts.push(new THREE.Vector3(hx, 0.093, hz));

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({
      color: '#1E40AF',
      dashSize: 0.08,
      gapSize: 0.05,
      transparent: true,
      opacity: 0.5,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line.raycast = () => {};
    return line;
  }, [placementMode, pendingStartCell, hoverCell, width, height]);

  useEffect(() => {
    return () => {
      if (placementGuideLine) {
        placementGuideLine.geometry.dispose();
        placementGuideLine.material.dispose();
      }
    };
  }, [placementGuideLine]);

  const coordFontSize = width > 20 || height > 20 ? 0.12 : 0.15;
  const colIndices = useMemo(() => Array.from({ length: width }, (_, i) => i), [width]);
  const rowIndices = useMemo(() => Array.from({ length: height }, (_, j) => j), [height]);
  const frontEdgeZ = height / 2 + 0.18;
  const leftEdgeX = -(width / 2) - 0.18;

  return (
    <group>
      {/* Soft radial grounding shadow beneath outer stone plinth */}
      <mesh
        geometry={plinthShadowGeo}
        material={plinthShadowMat}
        position={[0, -0.445, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-2}
      />

      {/* Diorama bounded outer stone plinth */}
      <mesh position={[0, -0.19, 0]} receiveShadow>
        <boxGeometry args={[plinthWidth, 0.34, plinthDepth]} />
        <meshStandardMaterial color="#CCC5B6" roughness={0.92} metalness={0.02} />
      </mesh>
      {/* Subtle darker rim bevel under plinth */}
      <mesh position={[0, -0.39, 0]}>
        <boxGeometry args={[plinthWidth + 0.22, 0.08, plinthDepth + 0.22]} />
        <meshStandardMaterial color="#B3AB9B" roughness={0.94} metalness={0.02} />
      </mesh>
      {/* Recessed dark mortar/grout bed beneath tile grid */}
      <mesh position={[0, -0.015, 0]} receiveShadow>
        <boxGeometry args={[groutWidth, 0.04, groutDepth]} />
        <meshStandardMaterial color="#8A8377" roughness={0.96} metalness={0.01} />
      </mesh>

      {/* Etched column & row grid coordinates along front (+Z) and left (-X) plinth borders */}
      {colIndices.map((i) => (
        <Text
          key={`col-coord-${i}`}
          position={[gridToWorld(i, 0, width, height)[0], -0.018, frontEdgeZ]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={coordFontSize}
          color="#A79E8D"
          fontWeight={500}
          anchorX="center"
          anchorY="middle"
        >
          {String(i)}
        </Text>
      ))}
      {rowIndices.map((j) => (
        <Text
          key={`row-coord-${j}`}
          position={[leftEdgeX, -0.018, gridToWorld(0, j, width, height)[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={coordFontSize}
          color="#A79E8D"
          fontWeight={500}
          anchorX="center"
          anchorY="middle"
        >
          {String(j)}
        </Text>
      ))}

      {/* Instanced Free Floor Tiles */}
      <instancedMesh
        ref={freeRef}
        args={[tileGeo, tileMat, Math.max(1, parsed.freeCells.length)]}
        receiveShadow
        onClick={handleTileClick}
        onPointerMove={handleTilePointerMove}
        onPointerOut={handleTilePointerOut}
      />

      {/* Instanced Soft Contact Darkening Skirts Under & Around Wall Blocks */}
      {parsed.blockedCells.length > 0 && (
        <instancedMesh
          ref={wallAoRef}
          args={[wallAoGeo, wallAoMat, parsed.blockedCells.length]}
          renderOrder={-1}
        />
      )}

      {/* Instanced Raised Wall Blocks */}
      {parsed.blockedCells.length > 0 && (
        <instancedMesh
          ref={wallRef}
          args={[wallGeo, wallMat, parsed.blockedCells.length]}
          castShadow
          receiveShadow
        />
      )}

      {/* Hover Ghost Marker & Dashed Guide Line in Click-to-Place mode */}
      {placementMode && hoverCell && (
        <mesh
          position={[
            gridToWorld(hoverCell[0], hoverCell[1], width, height)[0],
            0.094,
            gridToWorld(hoverCell[0], hoverCell[1], width, height)[1],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <ringGeometry args={[0.3, 0.36, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial
            color="#1E40AF"
            transparent
            opacity={0.35}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {placementGuideLine && <primitive object={placementGuideLine} />}

      {/* Pending Start Cell beacon in Click-to-Place mode */}
      {placementMode && pendingStartCell && (
        <group
          position={[
            gridToWorld(pendingStartCell[0], pendingStartCell[1], width, height)[0],
            0.1,
            gridToWorld(pendingStartCell[0], pendingStartCell[1], width, height)[1],
          ]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.24, 0.38, 24]} />
            <meshBasicMaterial color="#1E40AF" side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

interface AgentActorProps {
  agent: AgentSpec;
  path: GridPoint[];
  ghostPath?: GridPoint[];
  mapWidth: number;
  mapHeight: number;
  timeRef: React.RefObject<number>;
  assembleRef: React.RefObject<number>;
  reducedMotion: boolean;
  dimmed: boolean;
  highlighted: boolean;
  onSelect?: (id: number) => void;
  onHover?: (id: number | null) => void;
}

function AgentActor({
  agent,
  path,
  ghostPath,
  mapWidth,
  mapHeight,
  timeRef,
  assembleRef,
  reducedMotion,
  dimmed,
  highlighted,
  onSelect,
  onHover,
}: AgentActorProps) {
  const identity = useMemo(() => getAgentIdentity(agent.id), [agent.id]);
  const rootRef = useRef<THREE.Group | null>(null);
  const bodyGroupRef = useRef<THREE.Group | null>(null);
  const primaryMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const goalRingRef = useRef<THREE.Mesh | null>(null);
  const trailGeoRef = useRef<THREE.BufferGeometry | null>(null);

  const maxTrailSamples = 15;
  const ribbonVertCount = maxTrailSamples * 2;
  const trailBuffers = useMemo(() => {
    const positions = new Float32Array(ribbonVertCount * 3);
    const colors = new Float32Array(ribbonVertCount * 4);
    return { positions, colors };
  }, [ribbonVertCount]);

  const baseColor = useMemo(() => new THREE.Color(identity.color), [identity.color]);
  const settledTint = useMemo(
    () => new THREE.Color(identity.color).lerp(new THREE.Color(identity.darkColor), 0.55),
    [identity.color, identity.darkColor]
  );

  // Build horizontal flat ribbon strip mesh once (zero GC per frame, works identically on all WebGL drivers)
  const trailObject = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(trailBuffers.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(trailBuffers.colors, 4));

    const indices: number[] = [];
    for (let i = 0; i < maxTrailSamples - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }
    geo.setIndex(indices);
    geo.setDrawRange(0, 0);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return { geo, mat, mesh };
  }, [trailBuffers]);

  useEffect(() => {
    trailGeoRef.current = trailObject.geo;
    return () => {
      trailObject.geo.dispose();
      trailObject.mat.dispose();
    };
  }, [trailObject]);

  useFrame((state) => {
    const grp = rootRef.current;
    if (!grp) return;

    const curT = timeRef.current ?? 0;
    const asm = assembleRef.current ?? 1;
    const pose = sampleAgentPose(path, agent, curT, reducedMotion);

    const [wx, wz] = gridToWorld(pose.x, pose.y, mapWidth, mapHeight);
    const dropOffset = reducedMotion ? 0 : (1 - asm) * 1.15;
    const scaleFactor = reducedMotion ? 1 : 0.65 + 0.35 * asm;

    grp.position.set(wx, 0.08 + dropOffset + pose.stepBounce, wz);
    grp.scale.setScalar(scaleFactor);

    if (bodyGroupRef.current) {
      _euler.set(0, pose.headingRad, 0);
      _quat.setFromEuler(_euler);
      bodyGroupRef.current.quaternion.slerp(_quat, reducedMotion ? 1 : 0.28);
    }

    if (goalRingRef.current) {
      const pulseScale =
        !pose.settledAtGoal && !dimmed && !reducedMotion
          ? 1 + 0.05 * Math.sin(state.clock.elapsedTime * 2.6)
          : 1;
      goalRingRef.current.scale.setScalar(pulseScale);
    }

    if (primaryMatRef.current) {
      const mat = primaryMatRef.current;
      const docked = pose.settledAtGoal && !highlighted;
      const targetCol = docked ? settledTint : baseColor;
      mat.color.copy(targetCol);
      mat.emissive.copy(highlighted ? baseColor : _black);
      mat.emissiveIntensity = highlighted ? 0.22 : 0;
      const nextOpacity = dimmed ? 0.28 : docked ? 0.9 : 1;
      const nextTransparent = dimmed || docked;
      if (mat.transparent !== nextTransparent) {
        mat.transparent = nextTransparent;
        mat.needsUpdate = true;
      }
      mat.opacity = nextOpacity;
    }

    // Update horizontal fading trail ribbon strip
    const geo = trailGeoRef.current;
    if (geo) {
      if (asm < 0.98 || curT <= 0.02) {
        geo.setDrawRange(0, 0);
      } else {
        const samples = sampleTrailPoints(path, curT, reducedMotion, 2.8, maxTrailSamples - 1);
        if (samples.length < 2) {
          geo.setDrawRange(0, 0);
        } else {
          let arcLen = 0;
          for (let i = 1; i < samples.length; i++) {
            arcLen +=
              Math.abs(samples[i].x - samples[i - 1].x) +
              Math.abs(samples[i].y - samples[i - 1].y);
          }
          if (arcLen < 0.02) {
            geo.setDrawRange(0, 0);
          } else {
            const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
            const colAttr = geo.getAttribute('color') as THREE.BufferAttribute;

            for (let i = 0; i < samples.length; i++) {
              const s = samples[i];
              const prev = samples[Math.max(0, i - 1)];
              const next = samples[Math.min(samples.length - 1, i + 1)];
              let dx = next.x - prev.x;
              let dz = next.y - prev.y;
              const len = Math.hypot(dx, dz);
              if (len > 1e-4) {
                dx /= len;
                dz /= len;
              } else {
                dx = 1;
                dz = 0;
              }
              // Perpendicular vector in XZ plane, tapering width from tail to head
              const halfWidth = (0.03 + 0.065 * s.fade);
              const px = -dz * halfWidth;
              const pz = dx * halfWidth;

              const [cx, cz] = gridToWorld(s.x, s.y, mapWidth, mapHeight);
              const vIdx = i * 2;
              posAttr.setXYZ(vIdx, cx + px, 0.098, cz + pz);
              posAttr.setXYZ(vIdx + 1, cx - px, 0.098, cz - pz);

              const alpha = (dimmed ? 0.16 : 0.72) * Math.pow(s.fade, 1.4);
              colAttr.setXYZW(vIdx, baseColor.r, baseColor.g, baseColor.b, alpha);
              colAttr.setXYZW(vIdx + 1, baseColor.r, baseColor.g, baseColor.b, alpha);
            }
            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
            geo.setDrawRange(0, (samples.length - 1) * 6);
          }
        }
      }
    }
  });

  const [startWx, startWz] = gridToWorld(agent.start[0], agent.start[1], mapWidth, mapHeight);
  const [goalWx, goalWz] = gridToWorld(agent.goal[0], agent.goal[1], mapWidth, mapHeight);
  const hasDistinctStart =
    agent.start[0] !== agent.goal[0] || agent.start[1] !== agent.goal[1];

  // Full route lane geometry when hovered or selected
  const fullRouteGeo = useMemo(() => {
    if (!highlighted || path.length < 2) return null;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < path.length; i++) {
      const [px, pz] = gridToWorld(path[i][0], path[i][1], mapWidth, mapHeight);
      if (
        pts.length === 0 ||
        Math.abs(pts[pts.length - 1].x - px) > 0.001 ||
        Math.abs(pts[pts.length - 1].z - pz) > 0.001
      ) {
        pts.push(new THREE.Vector3(px, 0.145, pz));
      }
    }
    if (pts.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.08);
    return new THREE.TubeGeometry(curve, Math.min(160, pts.length * 6), 0.055, 8, false);
  }, [highlighted, path, mapWidth, mapHeight]);

  useEffect(() => {
    return () => {
      fullRouteGeo?.dispose();
    };
  }, [fullRouteGeo]);

  // Ghost route lane geometry for the alternate solver's path when hovered or selected
  const ghostRouteGeo = useMemo(() => {
    if (!highlighted || !ghostPath || ghostPath.length < 2) return null;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < ghostPath.length; i++) {
      const [px, pz] = gridToWorld(ghostPath[i][0], ghostPath[i][1], mapWidth, mapHeight);
      if (
        pts.length === 0 ||
        Math.abs(pts[pts.length - 1].x - px) > 0.001 ||
        Math.abs(pts[pts.length - 1].z - pz) > 0.001
      ) {
        pts.push(new THREE.Vector3(px, 0.145, pz));
      }
    }
    if (pts.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.08);
    return new THREE.TubeGeometry(curve, Math.min(160, pts.length * 6), 0.032, 8, false);
  }, [highlighted, ghostPath, mapWidth, mapHeight]);

  useEffect(() => {
    return () => {
      ghostRouteGeo?.dispose();
    };
  }, [ghostRouteGeo]);

  return (
    <group>
      {/* Start cell square origin pad (rendered only when start != goal) */}
      {hasDistinctStart && (
        <group position={[startWx, 0.092, startWz]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.3, 0.36, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial
              color={identity.color}
              transparent
              opacity={dimmed ? 0.1 : highlighted ? 0.5 : 0.28}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* Goal cell marker ring */}
      <group position={[goalWx, 0.092, goalWz]}>
        <mesh ref={goalRingRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.24, 0.34, identity.archetype === 'cube' ? 4 : identity.archetype === 'cylinder' ? 6 : 24]} />
          <meshBasicMaterial
            color={identity.color}
            transparent
            opacity={dimmed ? 0.16 : highlighted ? 0.95 : 0.55}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Fading trail ribbon */}
      <primitive object={trailObject.mesh} />

      {/* Faint ghost route lane for alternate solver when focused */}
      {highlighted && ghostRouteGeo && (
        <mesh geometry={ghostRouteGeo}>
          <meshStandardMaterial
            color={identity.color}
            roughness={0.6}
            metalness={0.1}
            transparent
            opacity={0.4}
          />
        </mesh>
      )}

      {/* Highlighted full route lane when focused */}
      {highlighted && fullRouteGeo && (
        <mesh geometry={fullRouteGeo}>
          <meshStandardMaterial
            color={identity.color}
            roughness={0.5}
            metalness={0.1}
            transparent
            opacity={0.88}
          />
        </mesh>
      )}

      {/* Composite multi-part 3D Robot Character */}
      <group
        ref={rootRef}
        onClick={(e) => {
          if (e.delta > 6) return;
          e.stopPropagation();
          onSelect?.(agent.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover?.(agent.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover?.(null);
        }}
      >
        {/* Soft grounded contact shadow disc */}
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.32, 20]} />
          <meshBasicMaterial
            color="#171614"
            transparent
            opacity={dimmed ? 0.08 : 0.24}
            depthWrite={false}
          />
        </mesh>

        {/* Highlight halo ring if selected/hovered */}
        {highlighted && (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.35, 0.44, 28]} />
            <meshBasicMaterial color={identity.color} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )}

        <group ref={bodyGroupRef} scale={BODY_SCALE}>
          {/* Part 1: Matte dark wheeled chassis base (roughness 0.85) */}
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.28, 0.11, 20]} />
            <meshStandardMaterial
              color="#2A2825"
              roughness={0.85}
              metalness={0.18}
              transparent={dimmed}
              opacity={dimmed ? 0.3 : 1}
            />
          </mesh>

          {/* Part 2: Archetype-specific primary hull (roughness 0.52 — >=0.25 delta from base) */}
          {identity.archetype === 'capsule' && (
            <mesh position={[0, 0.26, 0]} castShadow>
              <capsuleGeometry args={[0.19, 0.16, 6, 16]} />
              <meshStandardMaterial ref={primaryMatRef} color={identity.color} roughness={0.52} metalness={0.08} />
            </mesh>
          )}
          {identity.archetype === 'cube' && (
            <RoundedBox
              args={[0.36, 0.3, 0.36]}
              radius={0.055}
              smoothness={4}
              position={[0, 0.25, 0]}
              castShadow
            >
              <meshStandardMaterial ref={primaryMatRef} color={identity.color} roughness={0.52} metalness={0.08} />
            </RoundedBox>
          )}
          {identity.archetype === 'pawn' && (
            <mesh position={[0, 0.26, 0]} castShadow>
              <cylinderGeometry args={[0.13, 0.23, 0.32, 16]} />
              <meshStandardMaterial ref={primaryMatRef} color={identity.color} roughness={0.52} metalness={0.08} />
            </mesh>
          )}
          {identity.archetype === 'cylinder' && (
            <mesh position={[0, 0.25, 0]} rotation={[0, Math.PI / 6, 0]} castShadow>
              <cylinderGeometry args={[0.21, 0.21, 0.3, 6]} />
              <meshStandardMaterial ref={primaryMatRef} color={identity.color} roughness={0.52} metalness={0.08} />
            </mesh>
          )}

          {/* Part 3: Ceramic crown collar (roughness 0.22) */}
          <mesh position={[0, 0.42, 0]}>
            <cylinderGeometry args={[0.14, 0.15, 0.04, 16]} />
            <meshStandardMaterial
              color="#FAF8F5"
              roughness={0.22}
              metalness={0.05}
              transparent={dimmed}
              opacity={dimmed ? 0.3 : 1}
            />
          </mesh>

          {/* Part 4: Forward directional visor strip */}
          <mesh position={[0, 0.29, 0.175]}>
            <boxGeometry args={[0.18, 0.055, 0.04]} />
            <meshStandardMaterial
              color="#171614"
              roughness={0.18}
              metalness={0.35}
              transparent={dimmed}
              opacity={dimmed ? 0.25 : 1}
            />
          </mesh>

          {/* Part 5: Rear antenna stem & glowing identity beacon tip */}
          <mesh position={[0, 0.525, -0.115]}>
            <cylinderGeometry args={[0.012, 0.016, 0.17, 12]} />
            <meshStandardMaterial
              color="#2A2825"
              roughness={0.78}
              metalness={0.22}
              transparent={dimmed}
              opacity={dimmed ? 0.3 : 1}
            />
          </mesh>
          <mesh position={[0, 0.625, -0.115]}>
            <sphereGeometry args={[0.034, 14, 14]} />
            <meshStandardMaterial
              color={identity.color}
              emissive={identity.color}
              emissiveIntensity={dimmed ? 0.12 : 0.85}
              roughness={0.32}
              metalness={0.06}
              transparent={dimmed}
              opacity={dimmed ? 0.3 : 1}
            />
          </mesh>
        </group>

        {/* Non-color-only identification: crisp numeric index badge on crown */}
        <Text
          position={[0, 0.5, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.16}
          color={dimmed ? '#9CA3AF' : '#171614'}
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
        >
          {identity.badgeText}
        </Text>

        {/* Floating Billboard ID tag when focused so badge stays legible at any angle */}
        {highlighted && (
          <Billboard position={[0, 0.88, 0]}>
            <Text
              fontSize={0.19}
              color="#171614"
              outlineWidth={0.024}
              outlineColor="#FAF8F5"
              anchorX="center"
              anchorY="middle"
              fontWeight={700}
            >
              {identity.badgeText}
            </Text>
          </Billboard>
        )}
      </group>
    </group>
  );
}

interface ConflictOverlayProps {
  conflict?: SearchConflict | null;
  constraint?: SearchConstraint | null;
  width: number;
  height: number;
}

function ConflictConstraintMarkers({ conflict, constraint, width, height }: ConflictOverlayProps) {
  // Edge conflicts carry no pos — mark the u->v edge midpoint plus the two
  // involved cells with smaller twin diamonds, same y and visual language.
  const edgeMark = useMemo(() => {
    if (!conflict || conflict.pos || !conflict.u || !conflict.v) return null;
    const [ux, uz] = gridToWorld(conflict.u[0], conflict.u[1], width, height);
    const [vx, vz] = gridToWorld(conflict.v[0], conflict.v[1], width, height);
    return {
      u: [ux, uz] as [number, number],
      v: [vx, vz] as [number, number],
      mid: [(ux + vx) / 2, (uz + vz) / 2] as [number, number],
    };
  }, [conflict, width, height]);

  return (
    <group>
      {conflict && conflict.pos && (
        <group
          position={[
            gridToWorld(conflict.pos[0], conflict.pos[1], width, height)[0],
            0.12,
            gridToWorld(conflict.pos[0], conflict.pos[1], width, height)[1],
          ]}
        >
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <ringGeometry args={[0.3, 0.44, 4]} />
            <meshBasicMaterial color="#BE123C" side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
      {edgeMark && (
        <group>
          <group position={[edgeMark.mid[0], 0.12, edgeMark.mid[1]]}>
            <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
              <ringGeometry args={[0.3, 0.44, 4]} />
              <meshBasicMaterial color="#BE123C" side={THREE.DoubleSide} />
            </mesh>
          </group>
          {[edgeMark.u, edgeMark.v].map((cell, index) => (
            <group key={index} position={[cell[0], 0.12, cell[1]]}>
              <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
                <ringGeometry args={[0.14, 0.22, 4]} />
                <meshBasicMaterial color="#BE123C" side={THREE.DoubleSide} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {constraint && constraint.pos && (
        <group
          position={[
            gridToWorld(constraint.pos[0], constraint.pos[1], width, height)[0],
            0.13,
            gridToWorld(constraint.pos[0], constraint.pos[1], width, height)[1],
          ]}
        >
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[0.62, 0.05, 0.12]} />
            <meshStandardMaterial color="#B45309" roughness={0.6} />
          </mesh>
        </group>
      )}
    </group>
  );
}

interface SceneControllerProps {
  mapWidth: number;
  mapHeight: number;
  autoOrbitIdle: boolean;
  reducedMotion: boolean;
  isSoftwareGl: boolean;
  cameraResetTrigger: number;
  viewRequest?: CameraViewRequest;
  followAgentId: number | null;
  agents: AgentSpec[];
  paths: GridPoint[][];
  timeRef: RefObject<number>;
  isPlaying: boolean;
  playbackTime: number;
  assembleProgress: number;
  invalidateRef?: MutableRefObject<(() => void) | null>;
}

function SceneController({
  mapWidth,
  mapHeight,
  autoOrbitIdle,
  reducedMotion,
  isSoftwareGl,
  cameraResetTrigger,
  viewRequest,
  followAgentId,
  agents,
  paths,
  timeRef,
  isPlaying,
  playbackTime,
  assembleProgress,
  invalidateRef,
}: SceneControllerProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const userInteractedRef = useRef(false);
  const activeModeRef = useRef<CameraViewKind>('reset');
  const lastHandledSeqRef = useRef<number>(0);
  const followTrackRef = useRef<{ agentId: number | null; wx: number; wz: number }>({
    agentId: null,
    wx: 0,
    wz: 0,
  });
  const { camera, invalidate } = useThree();

  const span = Math.max(mapWidth, mapHeight);
  const dist = Math.max(9.8, span * 1.32);

  const latestContextRef = useRef({
    viewRequest,
    followAgentId,
    agents,
    paths,
    mapWidth,
    mapHeight,
    dist,
    reducedMotion,
  });
  latestContextRef.current = {
    viewRequest,
    followAgentId,
    agents,
    paths,
    mapWidth,
    mapHeight,
    dist,
    reducedMotion,
  };

  useEffect(() => {
    return () => {
      _cameraTween.active = false;
    };
  }, []);

  useEffect(() => {
    if (!invalidateRef) return;
    invalidateRef.current = () => invalidate();
    return () => {
      invalidateRef.current = null;
    };
  }, [invalidateRef, invalidate]);

  useEffect(() => {
    _cameraTween.active = false;
    activeModeRef.current = 'reset';
    followTrackRef.current.agentId = null;
    userInteractedRef.current = false;

    computeResetCameraFraming(dist, camera.position, _pos);
    camera.lookAt(_pos);
    if (controlsRef.current) {
      controlsRef.current.minPolarAngle = MIN_POLAR_DEFAULT;
      controlsRef.current.target.copy(_pos);
      controlsRef.current.update();
    }
    invalidate();
  }, [mapWidth, mapHeight, dist, cameraResetTrigger, camera, invalidate]);

  // Handle explicit camera preset requests (reset | top | follow) keyed on seq
  useEffect(() => {
    const ctx = latestContextRef.current;
    const req = ctx.viewRequest;
    if (!req || req.seq === lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = req.seq;

    const controls = controlsRef.current;
    _cameraTween.startPos.copy(camera.position);
    if (controls) {
      _cameraTween.startTarget.copy(controls.target);
      // Clear any residual OrbitControls damping inertia while preserving exact current pose
      const prevDamping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = prevDamping;
      camera.position.copy(_cameraTween.startPos);
      controls.target.copy(_cameraTween.startTarget);
    } else {
      _cameraTween.startTarget.set(0, -0.35, 0);
    }

    if (req.kind === 'reset') {
      activeModeRef.current = 'reset';
      userInteractedRef.current = false;
      followTrackRef.current.agentId = null;
      computeResetCameraFraming(ctx.dist, _cameraTween.endPos, _cameraTween.endTarget);
    } else if (req.kind === 'top') {
      activeModeRef.current = 'top';
      userInteractedRef.current = true;
      followTrackRef.current.agentId = null;
      if (controls) {
        controls.minPolarAngle = MIN_POLAR_TOP;
      }
      const topDist = ctx.dist * 1.05;
      const targetY = -0.1;
      _cameraTween.endTarget.set(0, targetY, 0);
      _cameraTween.endPos.set(
        0,
        targetY + topDist * Math.cos(MIN_POLAR_TOP),
        topDist * Math.sin(MIN_POLAR_TOP)
      );
    } else {
      // follow
      let foundIdx = -1;
      if (ctx.followAgentId !== null) {
        for (let i = 0; i < ctx.agents.length; i++) {
          if (ctx.agents[i].id === ctx.followAgentId) {
            foundIdx = i;
            break;
          }
        }
      }
      if (foundIdx < 0) return;

      const agent = ctx.agents[foundIdx];
      const path = ctx.paths[foundIdx] ?? [agent.start];
      const pose = sampleAgentPose(path, agent, timeRef.current ?? 0, ctx.reducedMotion);
      const [wx, wz] = gridToWorld(pose.x, pose.y, ctx.mapWidth, ctx.mapHeight);

      activeModeRef.current = 'follow';
      userInteractedRef.current = true;
      followTrackRef.current.agentId = agent.id;
      followTrackRef.current.wx = wx;
      followTrackRef.current.wz = wz;

      // Preserve current camera-to-target offset; if leaving top view, restore 14deg polar bound smoothly
      _pos.copy(_cameraTween.startPos).sub(_cameraTween.startTarget);
      const r = _pos.length();
      if (r > 1e-5) {
        const curPhi = Math.acos(THREE.MathUtils.clamp(_pos.y / r, -1, 1));
        if (curPhi < MIN_POLAR_DEFAULT) {
          const azim = Math.atan2(_pos.x, _pos.z);
          const sinP = Math.sin(MIN_POLAR_DEFAULT);
          _pos.set(
            r * sinP * Math.sin(azim),
            r * Math.cos(MIN_POLAR_DEFAULT),
            r * sinP * Math.cos(azim)
          );
        }
      }

      _cameraTween.endTarget.set(wx, 0.08, wz);
      _cameraTween.endPos.copy(_cameraTween.endTarget).add(_pos);
    }

    if (ctx.reducedMotion) {
      _cameraTween.active = false;
      camera.position.copy(_cameraTween.endPos);
      if (controls) {
        controls.minPolarAngle = req.kind === 'top' ? MIN_POLAR_TOP : MIN_POLAR_DEFAULT;
        controls.target.copy(_cameraTween.endTarget);
        controls.update();
      } else {
        camera.lookAt(_cameraTween.endTarget);
      }
      invalidate();
      return;
    }

    _cameraTween.kind = req.kind;
    _cameraTween.t0 = performance.now() / 1000;
    _cameraTween.active = true;
    invalidate();
  }, [viewRequest?.seq, camera, invalidate, timeRef]);

  // Trigger renders when time or assemble changes in demand mode
  useEffect(() => {
    invalidate();
  }, [playbackTime, assembleProgress, isPlaying, invalidate]);

  useFrame((_, delta) => {
    let didCameraMove = false;
    let tweenStillActive = false;

    if (followAgentId === null) {
      followTrackRef.current.agentId = null;
      if (activeModeRef.current === 'follow') {
        activeModeRef.current = 'reset';
      }
      if (_cameraTween.active && _cameraTween.kind === 'follow') {
        _cameraTween.active = false;
      }
    } else if (activeModeRef.current === 'follow') {
      let agentIdx = -1;
      for (let i = 0; i < agents.length; i++) {
        if (agents[i].id === followAgentId) {
          agentIdx = i;
          break;
        }
      }
      if (agentIdx >= 0) {
        const agent = agents[agentIdx];
        const path = paths[agentIdx] ?? [agent.start];
        const pose = sampleAgentPose(path, agent, timeRef.current ?? 0, reducedMotion);
        const [wx, wz] = gridToWorld(pose.x, pose.y, mapWidth, mapHeight);

        if (followTrackRef.current.agentId !== agent.id) {
          followTrackRef.current.agentId = agent.id;
          followTrackRef.current.wx = wx;
          followTrackRef.current.wz = wz;
        } else {
          const dx = wx - followTrackRef.current.wx;
          const dz = wz - followTrackRef.current.wz;
          followTrackRef.current.wx = wx;
          followTrackRef.current.wz = wz;

          if (dx !== 0 || dz !== 0) {
            if (_cameraTween.active && _cameraTween.kind === 'follow') {
              _cameraTween.endTarget.x += dx;
              _cameraTween.endTarget.z += dz;
              _cameraTween.endPos.x += dx;
              _cameraTween.endPos.z += dz;
            } else {
              // Post-tween follow: translate both target and camera by agent frame delta
              _pos.set(dx, 0, dz);
              if (controlsRef.current) {
                controlsRef.current.target.add(_pos);
              }
              camera.position.add(_pos);
              didCameraMove = true;
            }
          }
        }
      }
    }

    if (_cameraTween.active) {
      const elapsed = performance.now() / 1000 - _cameraTween.t0;
      const rawU = Math.min(1, Math.max(0, elapsed / CAMERA_TWEEN_DURATION));
      // Smoothstep easing over ~0.65s
      const s = rawU * rawU * (3 - 2 * rawU);

      camera.position.lerpVectors(_cameraTween.startPos, _cameraTween.endPos, s);
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(
          _cameraTween.startTarget,
          _cameraTween.endTarget,
          s
        );
        if (_cameraTween.kind === 'top') {
          controlsRef.current.minPolarAngle = MIN_POLAR_TOP;
        } else {
          _pos.copy(camera.position).sub(controlsRef.current.target);
          const len = _pos.length();
          const curPhi =
            len > 1e-5
              ? Math.acos(THREE.MathUtils.clamp(_pos.y / len, -1, 1))
              : MIN_POLAR_DEFAULT;
          controlsRef.current.minPolarAngle = Math.min(MIN_POLAR_DEFAULT, curPhi);
        }
      } else {
        _pos.lerpVectors(_cameraTween.startTarget, _cameraTween.endTarget, s);
        camera.lookAt(_pos);
      }

      didCameraMove = true;
      if (rawU >= 1) {
        camera.position.copy(_cameraTween.endPos);
        if (controlsRef.current) {
          controlsRef.current.target.copy(_cameraTween.endTarget);
          controlsRef.current.minPolarAngle =
            _cameraTween.kind === 'top' ? MIN_POLAR_TOP : MIN_POLAR_DEFAULT;
        }
        _cameraTween.active = false;
      } else {
        tweenStillActive = true;
      }
    } else if (
      activeModeRef.current !== 'top' &&
      controlsRef.current &&
      controlsRef.current.minPolarAngle < MIN_POLAR_DEFAULT
    ) {
      _pos.copy(camera.position).sub(controlsRef.current.target);
      const len = _pos.length();
      const curPhi =
        len > 1e-5
          ? Math.acos(THREE.MathUtils.clamp(_pos.y / len, -1, 1))
          : MIN_POLAR_DEFAULT;
      controlsRef.current.minPolarAngle = Math.min(MIN_POLAR_DEFAULT, curPhi);
    }

    if (controlsRef.current) {
      const shouldRotate =
        autoOrbitIdle &&
        !reducedMotion &&
        !isSoftwareGl &&
        !userInteractedRef.current &&
        !_cameraTween.active;
      controlsRef.current.autoRotate = shouldRotate;
      controlsRef.current.autoRotateSpeed = 0.45;
      if (controlsRef.current.enableDamping || shouldRotate || didCameraMove) {
        controlsRef.current.update();
      }
    }
    if (tweenStillActive || isPlaying || assembleProgress < 1) {
      invalidate();
    } else if (
      autoOrbitIdle &&
      !reducedMotion &&
      !isSoftwareGl &&
      !userInteractedRef.current
    ) {
      // Gently advance auto-orbit when GPU available
      if (delta > 0) invalidate();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={!reducedMotion && !isSoftwareGl}
      dampingFactor={0.07}
      minDistance={Math.max(4, span * 0.45)}
      maxDistance={Math.max(24, span * 2.6)}
      maxPolarAngle={MAX_POLAR_DEFAULT}
      onStart={() => {
        userInteractedRef.current = true;
        _cameraTween.active = false;
      }}
      onChange={() => invalidate()}
    />
  );
}

export function DioramaStage({
  mapWidth,
  mapHeight,
  mapRows,
  agents,
  paths,
  ghostPaths,
  playbackTime,
  playbackTimeRef,
  invalidateRef,
  isPlaying,
  assembleProgress,
  reducedMotion,
  autoOrbitIdle = false,
  selectedAgentId,
  hoveredAgentId,
  onSelectAgent,
  onHoverAgent,
  placementMode = false,
  pendingStartCell = null,
  onCellClick,
  activeConflict = null,
  activeConstraint = null,
  cameraResetTrigger = 0,
  cameraViewRequest,
  ariaLabel,
}: DioramaStageProps) {
  const pageVisible = usePageVisible();
  const isSoftwareGl = useMemo(() => detectSoftwareGl(), []);

  // Store continuous clock & assemble values in refs so AgentActors read at 60fps without re-mounting
  const fallbackTimeRef = useRef(playbackTime);
  fallbackTimeRef.current = playbackTime;
  const activeTimeRef = playbackTimeRef ?? fallbackTimeRef;

  const assembleRef = useRef(assembleProgress);
  assembleRef.current = assembleProgress;

  const focusedAgentId = hoveredAgentId ?? selectedAgentId;
  const span = Math.max(mapWidth, mapHeight);
  const shadowBound = Math.max(8, span * 0.72);
  const fogNear = Math.max(18, span * 1.45);
  const fogFar = Math.max(46, span * 3.4);

  const [isPlacementCellHovered, setIsPlacementCellHovered] = useState(false);

  useEffect(() => {
    if (!placementMode && hoveredAgentId !== null) {
      document.body.style.cursor = 'pointer';
    } else if (placementMode && isPlacementCellHovered) {
      document.body.style.cursor = 'crosshair';
    } else {
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoveredAgentId, placementMode, isPlacementCellHovered]);

  const frameloopMode: 'always' | 'demand' | 'never' = !pageVisible
    ? 'never'
    : isSoftwareGl
      ? 'demand'
      : isPlaying || assembleProgress < 1 || (autoOrbitIdle && !reducedMotion)
        ? 'always'
        : 'demand';

  // Pace software WebGL updates cleanly when playing so headless SwiftShader never starves screenshots
  const SoftLoopDriver = useCallback(() => {
    const { invalidate } = useThree();
    useEffect(() => {
      if (!isSoftwareGl || !pageVisible) return;
      if (!isPlaying && assembleProgress >= 1) return;
      const id = window.setInterval(() => {
        invalidate();
      }, 95);
      return () => window.clearInterval(id);
    }, [invalidate]);
    return null;
  }, [isSoftwareGl, pageVisible, isPlaying, assembleProgress]);

  return (
    <div
      className="relative w-full h-full select-none bg-[#EAE6DD]"
      role="region"
      aria-label={ariaLabel}
      data-testid="diorama-stage"
    >
      <Canvas
        frameloop={frameloopMode}
        shadows={!isSoftwareGl}
        dpr={isSoftwareGl ? 1 : [1, 2]}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.06,
        }}
        camera={{ fov: 38, near: 0.2, far: Math.max(150, span * 6) }}
        onPointerMissed={() => {
          if (!placementMode) {
            onSelectAgent?.(null);
          }
        }}
      >
        <color attach="background" args={['#EAE6DD']} />
        <fog attach="fog" args={['#EAE6DD', fogNear, fogFar]} />

        {/* Coherent warm-sun / cool-sky architectural studio lighting */}
        <hemisphereLight args={['#F8FAFC', '#C8C2B5', 0.88]} />
        <directionalLight
          position={[span * 0.85, span * 1.35, span * 0.65]}
          intensity={1.35}
          color="#FFF7ED"
          castShadow={!isSoftwareGl}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0005}
          shadow-camera-near={0.5}
          shadow-camera-far={span * 3.5}
          shadow-camera-left={-shadowBound}
          shadow-camera-right={shadowBound}
          shadow-camera-top={shadowBound}
          shadow-camera-bottom={-shadowBound}
        />
        <directionalLight
          position={[-span * 0.7, span * 0.6, -span * 0.8]}
          intensity={0.35}
          color="#E0F2FE"
        />

        <SoftLoopDriver />

        <SceneController
          mapWidth={mapWidth}
          mapHeight={mapHeight}
          autoOrbitIdle={autoOrbitIdle}
          reducedMotion={reducedMotion}
          isSoftwareGl={isSoftwareGl}
          cameraResetTrigger={cameraResetTrigger}
          viewRequest={cameraViewRequest}
          followAgentId={cameraViewRequest?.kind === 'follow' ? selectedAgentId : null}
          agents={agents}
          paths={paths}
          timeRef={activeTimeRef}
          isPlaying={isPlaying}
          playbackTime={playbackTime}
          assembleProgress={assembleProgress}
          invalidateRef={invalidateRef}
        />

        <BoardDiorama
          width={mapWidth}
          height={mapHeight}
          rows={mapRows}
          placementMode={placementMode}
          pendingStartCell={pendingStartCell}
          onCellClick={onCellClick}
          onHoverCellChange={setIsPlacementCellHovered}
        />

        <ConflictConstraintMarkers
          conflict={activeConflict}
          constraint={activeConstraint}
          width={mapWidth}
          height={mapHeight}
        />

        {agents.map((agent, idx) => {
          const agentPath = paths[idx] ?? [agent.start];
          const agentGhostPath = ghostPaths?.[idx];
          const isHighlighted = focusedAgentId === agent.id;
          const isDimmed = focusedAgentId !== null && focusedAgentId !== agent.id;
          return (
            <AgentActor
              key={agent.id}
              agent={agent}
              path={agentPath}
              ghostPath={agentGhostPath}
              mapWidth={mapWidth}
              mapHeight={mapHeight}
              timeRef={activeTimeRef}
              assembleRef={assembleRef}
              reducedMotion={reducedMotion}
              dimmed={isDimmed}
              highlighted={isHighlighted}
              onSelect={(id) =>
                onSelectAgent?.(selectedAgentId === id ? null : id)
              }
              onHover={onHoverAgent}
            />
          );
        })}
      </Canvas>
    </div>
  );
}
