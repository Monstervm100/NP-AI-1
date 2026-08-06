"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

// A brain-like mass (distorted, elongated, gyri-ish folds) with surface nodes —
// evokes a 3D brain rather than an abstract orb.
function BrainMass() {
  const groupRef = useRef<THREE.Group>(null);

  const surfaceNodes = useMemo(() => {
    const nodes: THREE.Vector3[] = [];
    const count = 70;
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      const r = 1.12;
      nodes.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta) * 1.25,   // wider (temporal lobes)
        r * Math.sin(phi) * Math.sin(theta) * 0.95,
        r * Math.cos(phi) * 1.4                         // longer (front-to-back)
      ));
    }
    return nodes;
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.16;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
    }
  });

  return (
    <group ref={groupRef} scale={[1.25, 0.95, 1.4]}>
      {/* Cortex — heavily distorted to read as brain folds (gyri/sulci) */}
      <Sphere args={[1.0, 96, 96]}>
        <MeshDistortMaterial
          color="#e8b8d4"
          emissive="#f9a8d4"
          emissiveIntensity={0.12}
          distort={0.5}
          speed={1.1}
          roughness={0.65}
          metalness={0.1}
        />
      </Sphere>

      {/* Faint outer shell */}
      <Sphere args={[1.18, 48, 48]}>
        <meshStandardMaterial color="#f9a8d4" transparent opacity={0.05} wireframe />
      </Sphere>

      {/* Surface activity nodes */}
      {surfaceNodes.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial
            color={i % 5 === 0 ? "#ffffff" : "#fbcfe8"}
            emissive={i % 5 === 0 ? "#f9a8d4" : "#fbcfe8"}
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

// A glowing plane that sweeps up and down through the brain — an MRI scan slice.
function ScanPlane() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * 0.6;
    ref.current.position.y = Math.sin(t) * 1.3;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.abs(Math.cos(t)) * 0.12;
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3.4, 3.4]} />
      <meshBasicMaterial color="#f9a8d4" transparent opacity={0.2} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Thin cross-section rings to reinforce the "scan" feel.
function SliceRing({ radius, speed }: { radius: number; speed: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(state.clock.elapsedTime * speed) * 0.05;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.004, 8, 80]} />
      <meshStandardMaterial color="#f9a8d4" transparent opacity={0.08} />
    </mesh>
  );
}

export default function Brain3D() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }} style={{ background: "transparent" }}>
      <ambientLight intensity={0.35} />
      <pointLight position={[5, 5, 5]} intensity={1.3} color="#f9a8d4" />
      <pointLight position={[-5, -3, -5]} intensity={0.6} color="#ffffff" />
      <pointLight position={[0, 0, 3]} intensity={0.5} color="#fbcfe8" />

      <BrainMass />
      <ScanPlane />
      <SliceRing radius={2.3} speed={0.7} />
      <SliceRing radius={2.9} speed={0.5} />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={false}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={(2 * Math.PI) / 3}
      />
    </Canvas>
  );
}
