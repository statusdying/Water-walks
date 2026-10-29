import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BearState } from '../../shared/types';

interface BearModelProps {
  bear: BearState;
}

export const BearModel: React.FC<BearModelProps> = ({ bear }) => {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const flLegRef = useRef<THREE.Group>(null);
  const frLegRef = useRef<THREE.Group>(null);
  const blLegRef = useRef<THREE.Group>(null);
  const brLegRef = useRef<THREE.Group>(null);
  const [isVeryClose, setIsVeryClose] = useState<boolean>(false);
  const closeRef = useRef<boolean>(false);

  useFrame(({ clock, camera }, delta) => {
    const t = clock.getElapsedTime();
    if (!rootRef.current) return;

    rootRef.current.position.lerp(
      new THREE.Vector3(bear.x, bear.y, bear.z),
      Math.min(1, delta * 14)
    );

    const distToCamera = camera.position.distanceTo(rootRef.current.position);
    const shouldShowHud = distToCamera <= 9.5;
    if (shouldShowHud !== closeRef.current) {
      closeRef.current = shouldShowHud;
      setIsVeryClose(shouldShowHud);
    }

    let diff = bear.rotY - rootRef.current.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    rootRef.current.rotation.y += diff * Math.min(1, delta * 12);

    if (bear.isDead) {
      // Killed bear lies on its side on the forest floor
      if (bodyRef.current) {
        bodyRef.current.rotation.z = THREE.MathUtils.lerp(
          bodyRef.current.rotation.z,
          Math.PI / 2,
          Math.min(1, delta * 6)
        );
        bodyRef.current.position.y = THREE.MathUtils.lerp(
          bodyRef.current.position.y,
          0.42,
          Math.min(1, delta * 6)
        );
      }
      return;
    }

    const freq = bear.isChasing ? 13.5 : 5.5;
    const amp = bear.isChasing ? 0.65 : 0.35;
    const swing = Math.sin(t * freq) * amp;
    const bob = Math.abs(Math.cos(t * freq)) * (bear.isChasing ? 0.14 : 0.04);

    if (bodyRef.current) {
      bodyRef.current.rotation.z = 0;
      bodyRef.current.position.y = 0.88 + bob;
      bodyRef.current.rotation.x = bear.isChasing ? Math.sin(t * freq) * 0.12 : 0;
    }

    if (headRef.current) {
      headRef.current.rotation.x = bear.isChasing
        ? -0.15 + Math.sin(t * freq) * 0.1
        : Math.sin(t * 2.5) * 0.06;
    }

    if (flLegRef.current && frLegRef.current && blLegRef.current && brLegRef.current) {
      flLegRef.current.rotation.x = swing;
      brLegRef.current.rotation.x = swing;
      frLegRef.current.rotation.x = -swing;
      blLegRef.current.rotation.x = -swing;
    }
  });

  const hpPct = Math.max(0, Math.min(100, (bear.hp / bear.maxHp) * 100));

  return (
    <group ref={rootRef} position={[bear.x, bear.y, bear.z]}>
      {/* Floating Bear Name & HP Bar — ONLY visible when very close to the player! */}
      {isVeryClose && (
        <Html position={[0, 2.55, 0]} center distanceFactor={10} zIndexRange={[10, 0]}>
          <div
            style={{
              background: 'rgba(24, 20, 16, 0.85)',
              border: '1.5px solid #a16207',
              borderRadius: '8px',
              padding: '4px 10px',
              color: '#f5efe6',
              fontSize: '11px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              textAlign: 'center',
              minWidth: '105px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span>{bear.name}</span>
              <span style={{ color: bear.isDead ? '#a8a29e' : '#fca5a5' }}>
                {Math.ceil(bear.hp)}/{bear.maxHp}
              </span>
            </div>

            <div
              style={{
                height: '5px',
                background: 'rgba(0,0,0,0.6)',
                borderRadius: '3px',
                overflow: 'hidden',
                marginTop: '3px',
              }}
            >
              <div
                style={{
                  width: `${hpPct}%`,
                  height: '100%',
                  background: hpPct > 50 ? '#ef4444' : '#f59e0b',
                  transition: 'width 0.15s ease',
                }}
              />
            </div>
          </div>
        </Html>
      )}

      <group ref={bodyRef} position={[0, 0.88, 0]}>
        {/* Massive Low-Poly Bear Torso */}
        <mesh castShadow receiveShadow position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.58, 0.66, 1.55, 8]} />
          <meshStandardMaterial color="#4f331f" roughness={0.92} flatShading />
        </mesh>

        {/* Muscular Shoulder Hump */}
        <mesh castShadow receiveShadow position={[0, 0.34, 0.42]}>
          <dodecahedronGeometry args={[0.56, 0]} />
          <meshStandardMaterial color="#5e3d26" roughness={0.9} flatShading />
        </mesh>

        {/* Rump & Stubby Tail */}
        <mesh castShadow receiveShadow position={[0, 0.18, -0.68]}>
          <dodecahedronGeometry args={[0.54, 0]} />
          <meshStandardMaterial color="#472d1b" roughness={0.92} flatShading />
        </mesh>
        <mesh castShadow position={[0, 0.32, -1.12]}>
          <dodecahedronGeometry args={[0.14, 0]} />
          <meshStandardMaterial color="#3d2616" roughness={0.95} flatShading />
        </mesh>

        {/* Bear Head, Ears & Snout */}
        <group ref={headRef} position={[0, 0.42, 0.98]}>
          <mesh castShadow receiveShadow>
            <dodecahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial color="#5e3d26" roughness={0.88} flatShading />
          </mesh>

          {/* Snout */}
          <mesh castShadow position={[0, -0.08, 0.34]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.24, 0.36, 7]} />
            <meshStandardMaterial color="#875f42" roughness={0.85} flatShading />
          </mesh>
          {/* Black Nose Tip */}
          <mesh position={[0, -0.02, 0.52]}>
            <boxGeometry args={[0.13, 0.1, 0.08]} />
            <meshBasicMaterial color="#17110e" />
          </mesh>

          {/* Round Bear Ears */}
          <mesh castShadow position={[-0.28, 0.32, -0.05]}>
            <dodecahedronGeometry args={[0.13, 0]} />
            <meshStandardMaterial color="#472d1b" roughness={0.9} flatShading />
          </mesh>
          <mesh castShadow position={[0.28, 0.32, -0.05]}>
            <dodecahedronGeometry args={[0.13, 0]} />
            <meshStandardMaterial color="#472d1b" roughness={0.9} flatShading />
          </mesh>

          {/* Bear Eyes (Glow fierce red when chasing player!) */}
          <mesh position={[-0.16, 0.1, 0.32]}>
            <boxGeometry args={[0.06, 0.06, 0.06]} />
            <meshBasicMaterial color={bear.isChasing ? '#ef4444' : '#17110e'} />
          </mesh>
          <mesh position={[0.16, 0.1, 0.32]}>
            <boxGeometry args={[0.06, 0.06, 0.06]} />
            <meshBasicMaterial color={bear.isChasing ? '#ef4444' : '#17110e'} />
          </mesh>
        </group>

        {/* 4 Thick Bear Legs */}
        <group ref={flLegRef} position={[-0.36, -0.15, 0.52]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.19, 0.16, 0.72, 7]} />
            <meshStandardMaterial color="#3d2616" roughness={0.92} flatShading />
          </mesh>
        </group>
        <group ref={frLegRef} position={[0.36, -0.15, 0.52]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.19, 0.16, 0.72, 7]} />
            <meshStandardMaterial color="#3d2616" roughness={0.92} flatShading />
          </mesh>
        </group>
        <group ref={blLegRef} position={[-0.36, -0.15, -0.55]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.21, 0.17, 0.72, 7]} />
            <meshStandardMaterial color="#3d2616" roughness={0.92} flatShading />
          </mesh>
        </group>
        <group ref={brLegRef} position={[0.36, -0.15, -0.55]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.21, 0.17, 0.72, 7]} />
            <meshStandardMaterial color="#3d2616" roughness={0.92} flatShading />
          </mesh>
        </group>
      </group>
    </group>
  );
};
