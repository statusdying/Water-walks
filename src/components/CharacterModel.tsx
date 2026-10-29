import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { PlayerState } from '../../shared/types';
import { PitcherRig } from './PitcherRig';

interface CharacterModelProps {
  player: PlayerState;
  isLocal: boolean;
  fractureRatio: number;
  climaxSnapElapsed: number | null;
  handWorldPosRef?: React.MutableRefObject<THREE.Vector3>;
}

export const CharacterModel: React.FC<CharacterModelProps> = ({
  player,
  isLocal,
  fractureRatio,
  climaxSnapElapsed,
  handWorldPosRef,
}) => {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const leftHandRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const rightHandRef = useRef<THREE.Group>(null);

  // 3rd-person Left-Hand Item animation refs
  const lastActionCounterRef = useRef<number>(player.leftActionCounter ?? 0);
  const actionTimerRef = useRef<number>(999);
  const spinnerVelRef = useRef<number>(18);
  const spinnerAngleRef = useRef<number>(0);
  const spinnerRotorRef = useRef<THREE.Group>(null);
  const knifeGroupRef = useRef<THREE.Group>(null);
  const muzzleFlashRef = useRef<THREE.Mesh>(null);
  const smokeGroupRef = useRef<THREE.Group>(null);
  const pissStreamsRef = useRef<THREE.Group>(null);

  const interpPos = useRef(new THREE.Vector3(player.x, player.y, player.z));
  const interpRotY = useRef(player.rotY);

  const leftItem = player.leftHandItem ?? 'cigarette';

  useEffect(() => {
    const incoming = player.leftActionCounter ?? 0;
    if (incoming !== lastActionCounterRef.current) {
      lastActionCounterRef.current = incoming;
      actionTimerRef.current = 0;
      if (leftItem === 'spinner') {
        spinnerVelRef.current = Math.min(72, spinnerVelRef.current + 30);
      }
    }
  }, [player.leftActionCounter, leftItem]);

  const waterFillRatio =
    player.waterCapacity > 0
      ? Math.min(1, player.waterCarried / player.waterCapacity)
      : 0;

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(0.1, rawDelta);
    const t = clock.getElapsedTime();
    if (!rootRef.current) return;

    if (isLocal) {
      rootRef.current.position.set(player.x, player.y, player.z);
      rootRef.current.rotation.y = player.rotY;
    } else {
      const lerpFactor = Math.min(1, delta * 14);
      interpPos.current.lerp(new THREE.Vector3(player.x, player.y, player.z), lerpFactor);
      rootRef.current.position.copy(interpPos.current);

      let diff = player.rotY - interpRotY.current;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      interpRotY.current += diff * lerpFactor;
      rootRef.current.rotation.y = interpRotY.current;
    }

    const walkFreq = 9.5;
    const isWalking = player.isMoving && climaxSnapElapsed === null && !player.isSpilling;
    const swing = isWalking ? Math.sin(t * walkFreq) * 0.55 : 0;
    const bob = isWalking ? Math.abs(Math.sin(t * walkFreq)) * 0.065 : Math.sin(t * 2.2) * 0.015;

    if (bodyRef.current) {
      bodyRef.current.position.y = 0.72 + bob;
      const loadLean = waterFillRatio * 0.14;
      bodyRef.current.rotation.x = player.isFilling ? 0.35 : player.isPouring ? 0.22 : loadLean;
    }

    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = swing;
      rightLegRef.current.rotation.x = -swing;
    }

    // Advance 3rd-person left-hand action timer
    actionTimerRef.current += delta;
    const at = actionTimerRef.current;

    if (leftArmRef.current) {
      // Default raised left arm so other players clearly see the held item
      let armRx = -0.85 - swing * 0.22;
      let armRy = 0.18;
      let armRz = 0.12;

      if (leftItem === 'cigarette') {
        if (at < 1.7) {
          const factor =
            at < 0.5
              ? at / 0.5
              : at < 1.05
              ? 1.0
              : Math.max(0, 1 - (at - 1.05) / 0.65);
          armRx = THREE.MathUtils.lerp(armRx, -1.48, factor);
          armRy = THREE.MathUtils.lerp(armRy, 0.46, factor);
          armRz = THREE.MathUtils.lerp(armRz, -0.1, factor);
        }
        if (smokeGroupRef.current) {
          if (at >= 0.9 && at <= 2.6) {
            smokeGroupRef.current.visible = true;
            const st = at - 0.9;
            smokeGroupRef.current.children.forEach((c, idx) => {
              const p = Math.max(0, st - idx * 0.12);
              c.position.set(
                Math.sin(t * 3 + idx) * 0.08,
                0.85 + p * 0.45,
                0.32 + p * 0.35
              );
              c.scale.setScalar(Math.max(0.001, Math.sin(Math.min(1, p / 1.2) * Math.PI) * 0.09));
            });
          } else {
            smokeGroupRef.current.visible = false;
          }
        }
      } else if (smokeGroupRef.current) {
        smokeGroupRef.current.visible = false;
      }

      if (leftItem === 'knife') {
        if (at < 0.85) {
          const p = at / 0.85;
          armRx += Math.sin(p * Math.PI * 2) * 0.32;
          armRz += Math.cos(p * Math.PI * 4) * 0.22;
          if (knifeGroupRef.current) {
            knifeGroupRef.current.rotation.x = p * Math.PI * 4;
          }
        } else if (knifeGroupRef.current) {
          knifeGroupRef.current.rotation.x = 0;
        }
      }

      if (leftItem === 'spinner') {
        if (spinnerVelRef.current > 0.01) {
          spinnerAngleRef.current += spinnerVelRef.current * delta;
          spinnerVelRef.current = Math.max(8, spinnerVelRef.current - delta * 6.5);
        }
        if (spinnerRotorRef.current) {
          spinnerRotorRef.current.rotation.y = spinnerAngleRef.current;
        }
      }

      if (leftItem === 'beer') {
        if (at < 1.55) {
          const factor =
            at < 0.35
              ? at / 0.35
              : at < 1.15
              ? 1.0
              : Math.max(0, 1 - (at - 1.15) / 0.4);
          armRx = THREE.MathUtils.lerp(armRx, -1.55, factor);
          armRy = THREE.MathUtils.lerp(armRy, 0.44, factor);
          armRz = THREE.MathUtils.lerp(armRz, -0.15, factor);
        }
      }

      if (leftItem === 'rifle') {
        armRx = -1.28;
        armRy = 0.14;
        armRz = 0.04;
        if (at < 0.45) {
          const kick = Math.exp(-at * 12) * Math.sin(Math.min(1, at * 28) * (Math.PI / 2));
          armRx -= kick * 0.32;
        }
        if (muzzleFlashRef.current) {
          muzzleFlashRef.current.visible = at < 0.08;
        }
      }

      if (leftItem === 'polish') {
        // Straightened arm reaching down between the legs
        armRx = -0.32;
        armRy = -0.38;
        armRz = -0.28;
        if (at < 1.35) {
          // 3 full up-and-down strokes from between the legs
          const strokeUp = (1 - Math.cos((at / 1.35) * Math.PI * 6)) * 0.5;
          armRx = -0.26 - strokeUp * 0.46;
          armRz = -0.28 + strokeUp * 0.08;
        }
        if (pissStreamsRef.current) {
          const streamWindows = [
            { start: 1.35, end: 1.72 },
            { start: 1.85, end: 2.22 },
            { start: 2.35, end: 2.72 },
          ];
          const activeWin = streamWindows.find((w) => at >= w.start && at <= w.end);
          if (activeWin) {
            pissStreamsRef.current.visible = true;
            const localStreamT = (at - activeWin.start) / (activeWin.end - activeWin.start);
            pissStreamsRef.current.children.forEach((child, idx) => {
              const frac = (idx / 10 + localStreamT * 2.2) % 1;
              const distZ = 0.22 + frac * 1.35;
              const arcY = 0.02 + frac * 0.16 - frac * frac * 0.72;
              const spreadX = Math.sin(idx * 3.7 + t * 22) * 0.015 * frac;
              child.position.set(spreadX, arcY, distZ);
              child.scale.set(0.024, 0.024, 0.075);
              child.rotation.set(-0.35 - frac * 0.6, 0, 0);
            });
          } else {
            pissStreamsRef.current.visible = false;
          }
        }
      } else if (pissStreamsRef.current) {
        pissStreamsRef.current.visible = false;
      }

      leftArmRef.current.rotation.set(armRx, armRy, armRz);
    }

    if (rightArmRef.current) {
      const armPitch =
        climaxSnapElapsed !== null
          ? -0.95
          : player.isSpilling
          ? -0.35
          : player.isPouring
          ? -1.15
          : player.isFilling
          ? -0.45
          : -0.78 + Math.sin(t * walkFreq) * (isWalking ? 0.08 : 0.01);
      rightArmRef.current.rotation.x = armPitch;
    }

    if (isLocal && rightHandRef.current && handWorldPosRef) {
      rightHandRef.current.getWorldPosition(handWorldPosRef.current);
    }
  });

  const bootColor =
    player.upgrades.bootsTier >= 3
      ? '#6e2c1b'
      : player.upgrades.bootsTier >= 1
      ? '#593a27'
      : '#3b2b22';

  return (
    <group ref={rootRef} position={[player.x, player.y, player.z]}>
      {!isLocal && climaxSnapElapsed === null && (
        <Html position={[0, 2.55, 0]} center distanceFactor={14} zIndexRange={[10, 0]}>
          <div
            style={{
              background: player.isSpilling
                ? 'rgba(185, 28, 28, 0.92)'
                : 'rgba(24, 20, 16, 0.82)',
              border: `1px solid ${player.isSpilling ? '#fca5a5' : player.color}`,
              borderRadius: '6px',
              padding: '2px 8px',
              color: '#f5efe6',
              fontSize: '11px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
            }}
          >
            <span>{player.name}</span>
            {player.isSpilling ? (
              <span style={{ color: '#fef08a', marginLeft: 6 }}>VYLITO!</span>
            ) : (
              <span style={{ color: '#63c5f2', marginLeft: 6 }}>
                {Math.round(player.waterCarried)}/{player.waterCapacity}L
              </span>
            )}
          </div>
        </Html>
      )}

      {/* Left Leg */}
      <group ref={leftLegRef} position={[-0.16, 0.65, 0]}>
        <mesh castShadow receiveShadow position={[0, -0.25, 0]}>
          <cylinderGeometry args={[0.09, 0.075, 0.45, 6]} />
          <meshStandardMaterial color="#5e5044" roughness={0.9} flatShading />
        </mesh>
        <mesh castShadow receiveShadow position={[0, -0.5, 0.04]}>
          <boxGeometry args={[0.16, 0.22, 0.26]} />
          <meshStandardMaterial color={bootColor} roughness={0.75} flatShading />
        </mesh>
        {player.upgrades.bootsTier >= 2 && (
          <mesh position={[0, -0.44, 0.175]}>
            <boxGeometry args={[0.08, 0.06, 0.02]} />
            <meshStandardMaterial color="#e6b84c" metalness={0.6} roughness={0.3} flatShading />
          </mesh>
        )}
      </group>

      {/* Right Leg */}
      <group ref={rightLegRef} position={[0.16, 0.65, 0]}>
        <mesh castShadow receiveShadow position={[0, -0.25, 0]}>
          <cylinderGeometry args={[0.09, 0.075, 0.45, 6]} />
          <meshStandardMaterial color="#5e5044" roughness={0.9} flatShading />
        </mesh>
        <mesh castShadow receiveShadow position={[0, -0.5, 0.04]}>
          <boxGeometry args={[0.16, 0.22, 0.26]} />
          <meshStandardMaterial color={bootColor} roughness={0.75} flatShading />
        </mesh>
        {player.upgrades.bootsTier >= 2 && (
          <mesh position={[0, -0.44, 0.175]}>
            <boxGeometry args={[0.08, 0.06, 0.02]} />
            <meshStandardMaterial color="#e6b84c" metalness={0.6} roughness={0.3} flatShading />
          </mesh>
        )}
      </group>

      {/* Upper Body */}
      <group ref={bodyRef} position={[0, 0.72, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.24, 0.31, 0.68, 7]} />
          <meshStandardMaterial color={player.color} roughness={0.85} flatShading />
        </mesh>

        <mesh castShadow position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.295, 0.305, 0.09, 7]} />
          <meshStandardMaterial color="#3b2618" roughness={0.8} flatShading />
        </mesh>

        <group position={[0, 0.86, 0]}>
          <mesh castShadow receiveShadow>
            <icosahedronGeometry args={[0.22, 1]} />
            <meshStandardMaterial color="#ebc3a4" roughness={0.78} flatShading />
          </mesh>
          <mesh position={[-0.075, 0.03, 0.19]}>
            <boxGeometry args={[0.035, 0.035, 0.03]} />
            <meshBasicMaterial color="#1f1612" />
          </mesh>
          <mesh position={[0.075, 0.03, 0.19]}>
            <boxGeometry args={[0.035, 0.035, 0.03]} />
            <meshBasicMaterial color="#1f1612" />
          </mesh>
          <mesh castShadow position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.38, 0.38, 0.04, 8]} />
            <meshStandardMaterial color="#d4b46a" roughness={0.85} flatShading />
          </mesh>
          <mesh castShadow position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.17, 0.23, 0.16, 8]} />
            <meshStandardMaterial color="#c2a055" roughness={0.85} flatShading />
          </mesh>
        </group>

        {/* 3rd-person Cigarette Smoke Puffs */}
        <group ref={smokeGroupRef} visible={false}>
          {Array.from({ length: 6 }).map((_, i) => (
            <mesh key={`tp-smoke-${i}`}>
              <icosahedronGeometry args={[1, 0]} />
              <meshStandardMaterial
                color="#e2e8f0"
                transparent
                opacity={0.5}
                roughness={1}
                flatShading
              />
            </mesh>
          ))}
        </group>

        {/* 3rd-person "Leštit" Phase 2: 3 Short White Streams in a Row */}
        <group ref={pissStreamsRef} visible={false} position={[0, -0.02, 0.14]}>
          {Array.from({ length: 10 }).map((_, i) => (
            <mesh key={`tp-piss-${i}`}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive="#f8fafc"
                emissiveIntensity={0.55}
                roughness={0.15}
                transparent
                opacity={0.95}
                flatShading
              />
            </mesh>
          ))}
        </group>

        {/* Left Arm & Held Off-Hand Item (Visible to Other Players!) */}
        <group ref={leftArmRef} position={[-0.31, 0.56, 0]} rotation={[-0.85, 0.18, 0.12]}>
          <mesh castShadow position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.075, 0.065, 0.44, 6]} />
            <meshStandardMaterial color="#e8dfd1" roughness={0.85} flatShading />
          </mesh>

          <group ref={leftHandRef} position={[0, -0.46, 0.02]} rotation={[0.9, 0, 0]}>
            <mesh castShadow>
              <dodecahedronGeometry args={[0.072, 0]} />
              <meshStandardMaterial color="#ebc3a4" roughness={0.8} flatShading />
            </mesh>

            {/* 1. CIGARETTE */}
            {leftItem === 'cigarette' && (
              <group position={[0.02, 0.04, 0.05]} rotation={[-0.2, 0, 0]}>
                <mesh castShadow position={[0, 0, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.015, 0.015, 0.05, 8]} />
                  <meshStandardMaterial color="#d99b52" roughness={0.8} flatShading />
                </mesh>
                <mesh castShadow position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.015, 0.015, 0.1, 8]} />
                  <meshStandardMaterial color="#f5f5f4" roughness={0.85} flatShading />
                </mesh>
                <mesh position={[0, 0, 0.095]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.015, 0.016, 0.022, 8]} />
                  <meshStandardMaterial
                    color="#ff4500"
                    emissive="#ff3b00"
                    emissiveIntensity={1.6}
                    roughness={0.5}
                    flatShading
                  />
                </mesh>
              </group>
            )}

            {/* 2. BUTTERFLY KNIFE */}
            {leftItem === 'knife' && (
              <group ref={knifeGroupRef} position={[0.02, 0.08, 0.04]}>
                <mesh castShadow position={[0, 0.09, 0]}>
                  <coneGeometry args={[0.02, 0.17, 4]} />
                  <meshStandardMaterial
                    color="#e2e8f0"
                    metalness={0.85}
                    roughness={0.2}
                    flatShading
                  />
                </mesh>
                <mesh castShadow position={[-0.016, -0.07, 0]}>
                  <boxGeometry args={[0.018, 0.15, 0.024]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
                </mesh>
                <mesh castShadow position={[0.016, -0.07, 0]}>
                  <boxGeometry args={[0.018, 0.15, 0.024]} />
                  <meshStandardMaterial color="#991b1b" metalness={0.7} roughness={0.3} />
                </mesh>
              </group>
            )}

            {/* 3. FIDGET SPINNER */}
            {leftItem === 'spinner' && (
              <group position={[0.02, 0.06, 0.04]} rotation={[0.4, 0, 0]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.028, 0.028, 0.024, 10]} />
                  <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
                </mesh>
                <group ref={spinnerRotorRef}>
                  {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, idx) => (
                    <group key={`tp-lobe-${idx}`} rotation={[0, angle, 0]}>
                      <mesh castShadow position={[0.048, 0, 0]}>
                        <boxGeometry args={[0.08, 0.014, 0.032]} />
                        <meshStandardMaterial color="#dc2626" metalness={0.45} roughness={0.35} />
                      </mesh>
                      <mesh castShadow position={[0.082, 0, 0]}>
                        <cylinderGeometry args={[0.032, 0.032, 0.018, 10]} />
                        <meshStandardMaterial color="#dc2626" metalness={0.45} roughness={0.35} />
                      </mesh>
                    </group>
                  ))}
                </group>
              </group>
            )}

            {/* 4. BEER MUG */}
            {leftItem === 'beer' && (
              <group position={[0.04, 0.05, 0.05]}>
                <mesh castShadow position={[0, 0.01, 0]}>
                  <cylinderGeometry args={[0.078, 0.07, 0.21, 10]} />
                  <meshStandardMaterial
                    color="#f1f5f9"
                    transparent
                    opacity={0.48}
                    roughness={0.15}
                    flatShading
                  />
                </mesh>
                <mesh position={[0, -0.005, 0]}>
                  <cylinderGeometry args={[0.066, 0.06, 0.16, 10]} />
                  <meshStandardMaterial
                    color="#f59e0b"
                    emissive="#b45309"
                    emissiveIntensity={0.25}
                    roughness={0.25}
                    flatShading
                  />
                </mesh>
                <mesh castShadow position={[0, 0.095, 0]}>
                  <cylinderGeometry args={[0.08, 0.074, 0.045, 10]} />
                  <meshStandardMaterial color="#ffffff" roughness={0.9} flatShading />
                </mesh>
              </group>
            )}

            {/* 5. MARKSMAN RIFLE */}
            {leftItem === 'rifle' && (
              <group position={[0.02, 0.04, 0.08]}>
                <mesh castShadow position={[0, -0.01, -0.1]}>
                  <boxGeometry args={[0.045, 0.075, 0.36]} />
                  <meshStandardMaterial color="#5c3820" roughness={0.85} flatShading />
                </mesh>
                <mesh castShadow position={[0, 0.025, 0.04]}>
                  <boxGeometry args={[0.048, 0.048, 0.18]} />
                  <meshStandardMaterial color="#475569" metalness={0.75} roughness={0.3} />
                </mesh>
                <mesh
                  castShadow
                  position={[0, 0.03, 0.34]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.016, 0.02, 0.56, 8]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.22} />
                </mesh>
                <mesh
                  ref={muzzleFlashRef}
                  visible={false}
                  position={[0, 0.03, 0.65]}
                >
                  <dodecahedronGeometry args={[0.11, 0]} />
                  <meshBasicMaterial color="#fde047" />
                </mesh>
              </group>
            )}
          </group>
        </group>

        {/* Right Arm Holding Pitcher */}
        <group ref={rightArmRef} position={[0.31, 0.56, 0]} rotation={[-0.78, -0.15, 0]}>
          <mesh castShadow position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.075, 0.065, 0.44, 6]} />
            <meshStandardMaterial color="#e8dfd1" roughness={0.85} flatShading />
          </mesh>

          <group ref={rightHandRef} position={[0, -0.46, 0.02]} rotation={[0.78, 0, 0]}>
            <mesh castShadow>
              <dodecahedronGeometry args={[0.078, 0]} />
              <meshStandardMaterial color="#ebc3a4" roughness={0.8} flatShading />
            </mesh>

            <PitcherRig
              upgrades={player.upgrades}
              waterFillRatio={waterFillRatio}
              fractureRatio={fractureRatio}
              isMoving={player.isMoving}
              isPouring={player.isPouring}
              isFilling={player.isFilling}
              isSpilling={Boolean(player.isSpilling)}
              climaxSnapElapsed={climaxSnapElapsed}
            />
          </group>
        </group>
      </group>
    </group>
  );
};
