import React, { useMemo } from 'react';
import * as THREE from 'three';

interface AgentTrailProps {
  trail: [number, number, number][];
  color: string;
}

export const AgentTrail: React.FC<AgentTrailProps> = ({ trail, color }) => {
  const linePoints = useMemo(() => {
    if (trail.length < 2) return null;
    return trail.map((p) => new THREE.Vector3(p[0], p[1] - 0.2, p[2]));
  }, [trail]);

  const geometry = useMemo(() => {
    if (!linePoints || linePoints.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(linePoints);
  }, [linePoints]);

  if (!geometry) return null;

  return (
    <group>
      {/* Dynamic trailing line ribbon */}
      {/* @ts-expect-error line is standard Three.js R3F element */}
      <line geometry={geometry}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          linewidth={2}
        />
      </line>

      {/* Trailing waypoint nodes with fading sizes */}
      {trail.map((pos, idx) => {
        const factor = (idx + 1) / trail.length; // 0 (oldest) to 1 (newest)
        const radius = 0.02 + factor * 0.04;
        return (
          <mesh
            key={idx}
            position={[pos[0], pos[1] - 0.28, pos[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[radius, 12]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={factor * 0.45}
            />
          </mesh>
        );
      })}
    </group>
  );
};
