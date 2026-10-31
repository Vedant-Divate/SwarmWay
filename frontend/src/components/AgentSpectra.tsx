import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface AgentSpectraProps {
  position: [number, number, number];
  rotationY: number;
  tilt: [number, number, number];
  color: string;
  accentColor: string;
}

export const AgentSpectra: React.FC<AgentSpectraProps> = ({
  position,
  rotationY,
  tilt,
  color,
  accentColor,
}) => {
  const rootRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (rootRef.current) {
      // Smooth interpolation towards incoming physics position and rotation
      rootRef.current.position.x = THREE.MathUtils.damp(
        rootRef.current.position.x,
        position[0],
        22,
        delta
      );
      rootRef.current.position.y = THREE.MathUtils.damp(
        rootRef.current.position.y,
        position[1],
        22,
        delta
      );
      rootRef.current.position.z = THREE.MathUtils.damp(
        rootRef.current.position.z,
        position[2],
        22,
        delta
      );

      // Interpolate rotation Y (handling angle wrapping)
      let curRotY = rootRef.current.rotation.y;
      let diff = rotationY - curRotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      rootRef.current.rotation.y = THREE.MathUtils.damp(curRotY, curRotY + diff, 14, delta);

      // Pitch and roll tilt
      rootRef.current.rotation.x = THREE.MathUtils.damp(
        rootRef.current.rotation.x,
        tilt[0],
        16,
        delta
      );
      rootRef.current.rotation.z = THREE.MathUtils.damp(
        rootRef.current.rotation.z,
        tilt[2],
        16,
        delta
      );
    }

    // Dynamic rotation of magnetic propulsion ring & subtle core pulsation
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 2.8;
      ringRef.current.rotation.y += delta * 1.4;
    }
    if (coreRef.current) {
      const scale = 1 + Math.sin(Date.now() * 0.005) * 0.08;
      coreRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <group ref={rootRef} position={position}>
      {/* 1. Primary Silhouette: Streamlined aerodynamic fuselage */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.09, 0.23, 0.52, 6]} />
        <meshStandardMaterial
          color="#334155"
          roughness={0.25}
          metalness={0.7}
        />
      </mesh>

      {/* 2. Secondary Read: Toroidal magnetic drive ring */}
      <mesh
        ref={ringRef}
        position={[0, 0.02, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <torusGeometry args={[0.26, 0.032, 12, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          roughness={0.15}
          metalness={0.9}
        />
      </mesh>

      {/* 3. Secondary Read: Swept canted wings (Port & Starboard) */}
      <group position={[0, 0.02, -0.05]}>
        {/* Left wing */}
        <mesh position={[-0.26, 0, 0]} rotation={[0, 0.35, -0.15]} castShadow>
          <boxGeometry args={[0.26, 0.022, 0.16]} />
          <meshStandardMaterial
            color="#1e293b"
            roughness={0.4}
            metalness={0.6}
          />
        </mesh>
        {/* Left wingtip photon marker */}
        <mesh position={[-0.38, 0.02, -0.04]}>
          <boxGeometry args={[0.04, 0.03, 0.08]} />
          <meshBasicMaterial color={accentColor} />
        </mesh>

        {/* Right wing */}
        <mesh position={[0.26, 0, 0]} rotation={[0, -0.35, 0.15]} castShadow>
          <boxGeometry args={[0.26, 0.022, 0.16]} />
          <meshStandardMaterial
            color="#1e293b"
            roughness={0.4}
            metalness={0.6}
          />
        </mesh>
        {/* Right wingtip photon marker */}
        <mesh position={[0.38, 0.02, -0.04]}>
          <boxGeometry args={[0.04, 0.03, 0.08]} />
          <meshBasicMaterial color={accentColor} />
        </mesh>
      </group>

      {/* 4. Accent Detail: Luminescent Optical Visor / Cockpit Core */}
      <mesh
        ref={coreRef}
        position={[0, 0.07, 0.16]}
        castShadow
      >
        <sphereGeometry args={[0.085, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.2}
          roughness={0.1}
          metalness={0.3}
        />
      </mesh>

      {/* 5. Accent Detail: Dorsal telemetry fin */}
      <mesh position={[0, 0.14, -0.12]} rotation={[-0.3, 0, 0]} castShadow>
        <boxGeometry args={[0.02, 0.14, 0.18]} />
        <meshStandardMaterial
          color={accentColor}
          roughness={0.25}
          metalness={0.7}
        />
      </mesh>

      {/* 6. Accent Detail: Ventral Anti-gravity Thruster Nozzle */}
      <mesh position={[0, -0.11, 0]}>
        <cylinderGeometry args={[0.09, 0.05, 0.08, 16]} />
        <meshStandardMaterial
          color="#334155"
          roughness={0.5}
          metalness={0.8}
        />
      </mesh>

      {/* 7. Accent Detail: Ventral light disc pointing down onto the cell */}
      <mesh position={[0, -0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Ground Projection Halo */}
      <mesh position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.32, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};
