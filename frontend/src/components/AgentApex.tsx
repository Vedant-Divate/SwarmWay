import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface AgentApexProps {
  position: [number, number, number];
  rotationY: number;
  tilt: [number, number, number];
  color: string;
  accentColor: string;
}

export const AgentApex: React.FC<AgentApexProps> = ({
  position,
  rotationY,
  tilt,
  color,
  accentColor,
}) => {
  const rootRef = useRef<THREE.Group>(null);
  const gyroRef = useRef<THREE.Group>(null);
  const scannerRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (rootRef.current) {
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

      let curRotY = rootRef.current.rotation.y;
      let diff = rotationY - curRotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      rootRef.current.rotation.y = THREE.MathUtils.damp(curRotY, curRotY + diff, 14, delta);

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

    // Dynamic rotation of internal sensor gyro
    if (gyroRef.current) {
      gyroRef.current.rotation.y -= delta * 3.2;
    }
    // Subtle scanner oscillation
    if (scannerRef.current) {
      scannerRef.current.position.x = Math.sin(Date.now() * 0.006) * 0.06;
    }
  });

  return (
    <group ref={rootRef} position={position}>
      {/* 1. Primary Silhouette: Faceted geometric armored hull */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.16, 0.42]} />
        <meshStandardMaterial
          color="#44403c"
          roughness={0.25}
          metalness={0.65}
        />
      </mesh>

      {/* 2. Secondary Read: Dual Lateral Glide Nacelles (Left & Right) */}
      <group position={[0, 0.02, 0]}>
        {/* Left Nacelle */}
        <mesh position={[-0.24, 0, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.44, 16]} />
          <meshStandardMaterial
            color="#292524"
            roughness={0.2}
            metalness={0.8}
          />
        </mesh>
        {/* Left Nacelle Ring Glow */}
        <mesh position={[-0.24, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.075, 0.015, 8, 24]} />
          <meshBasicMaterial color={color} />
        </mesh>

        {/* Right Nacelle */}
        <mesh position={[0.24, 0, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.44, 16]} />
          <meshStandardMaterial
            color="#292524"
            roughness={0.2}
            metalness={0.8}
          />
        </mesh>
        {/* Right Nacelle Ring Glow */}
        <mesh position={[0.24, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.075, 0.015, 8, 24]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>

      {/* 3. Secondary Read: Orbital Rotating Sensor Turret / Gyro */}
      <group ref={gyroRef} position={[0, 0.16, -0.04]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.05, 16]} />
          <meshStandardMaterial
            color={accentColor}
            roughness={0.2}
            metalness={0.9}
          />
        </mesh>
        <mesh position={[0.09, 0.04, 0]}>
          <boxGeometry args={[0.04, 0.06, 0.04]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>

      {/* 4. Accent Detail: Forward Optical Visor Slit */}
      <mesh position={[0, 0.05, 0.215]}>
        <boxGeometry args={[0.22, 0.035, 0.02]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* 5. Accent Detail: Oscillating Laser Scanner Node */}
      <mesh ref={scannerRef} position={[0, 0.08, 0.22]}>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshBasicMaterial color={accentColor} />
      </mesh>

      {/* 6. Accent Detail: Rear Kinetic Stabilizer Fins */}
      <group position={[0, 0.08, -0.22]}>
        <mesh position={[-0.1, 0, 0]} rotation={[0.2, 0, -0.15]}>
          <boxGeometry args={[0.02, 0.1, 0.12]} />
          <meshStandardMaterial color="#44403c" roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0.1, 0, 0]} rotation={[0.2, 0, 0.15]}>
          <boxGeometry args={[0.02, 0.1, 0.12]} />
          <meshStandardMaterial color="#44403c" roughness={0.3} metalness={0.7} />
        </mesh>
      </group>

      {/* 7. Accent Detail: Ventral Hover Levitation Core */}
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Ground Projection Pulse Ring */}
      <mesh position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.12, 0.35, 24]} />
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
