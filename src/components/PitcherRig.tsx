import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PlayerUpgrades } from '../../shared/types';

interface PitcherRigProps {
  upgrades: PlayerUpgrades;
  waterFillRatio: number; // 0..1
  fractureRatio: number;  // global wellCurrent / wellMax (0..1)
  isMoving: boolean;
  isPouring: boolean;
  isFilling: boolean;
  /** Real-time balance tilt angle (-1..+1) controlled by player strafing left/right */
  balanceTilt?: number;
  /** True for ~1.1s when the pitcher tips over and spills its water */
  isSpilling?: boolean;
  /** Climax cutscene elapsed time in seconds since snap (null if not snapped yet) */
  climaxSnapElapsed: number | null;
}

function createHandleFractureTexture(stage: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#c86446';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = 'rgba(155, 65, 42, 0.25)';
  for (let i = 0; i < 16; i++) {
    ctx.fillRect(0, i * 16, 256, 4);
  }

  if (stage >= 1) {
    ctx.strokeStyle = '#2d140c';
    ctx.lineWidth = stage === 1 ? 3 : 6;
    ctx.lineCap = 'square';

    const drawCrack = (points: [number, number][]) => {
      ctx.beginPath();
      points.forEach(([x, y], idx) => {
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawCrack([
      [20, 45],
      [68, 62],
      [112, 48],
      [155, 74],
      [210, 60],
    ]);
    drawCrack([
      [112, 48],
      [128, 95],
      [105, 130],
    ]);
    drawCrack([
      [35, 195],
      [88, 178],
      [145, 198],
      [205, 182],
    ]);

    if (stage >= 2) {
      ctx.strokeStyle = '#140704';
      ctx.lineWidth = stage >= 3 ? 9 : 6;
      drawCrack([
        [10, 52],
        [65, 38],
        [118, 72],
        [174, 42],
        [242, 68],
      ]);
      drawCrack([
        [65, 38],
        [82, 115],
        [135, 148],
        [118, 215],
      ]);
      drawCrack([
        [174, 42],
        [158, 118],
        [198, 165],
        [235, 210],
      ]);

      if (stage >= 3) {
        ctx.strokeStyle = '#4a1c10';
        ctx.lineWidth = 3;
        drawCrack([
          [40, 80],
          [110, 110],
          [180, 90],
          [220, 135],
        ]);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const PitcherRig: React.FC<PitcherRigProps> = ({
  upgrades,
  waterFillRatio,
  fractureRatio,
  isMoving,
  isPouring,
  isFilling,
  balanceTilt = 0,
  isSpilling = false,
  climaxSnapElapsed,
}) => {
  const handleGroupRef = useRef<THREE.Group>(null);
  const pitcherVesselRef = useRef<THREE.Group>(null);
  const towerStackRef = useRef<THREE.Group>(null);
  const dustParticlesRef = useRef<THREE.Group>(null);
  const shatterGroupRef = useRef<THREE.Group>(null);

  const fractureStage =
    fractureRatio >= 0.95
      ? 3
      : fractureRatio >= 0.6
      ? 2
      : fractureRatio >= 0.3
      ? 1
      : 0;

  const handleTexture = useMemo(
    () => createHandleFractureTexture(fractureStage),
    [fractureStage]
  );

  const shardsData = useMemo(() => {
    const items = [];
    const colors = ['#c86446', '#b04e32', '#9e4229', '#4a4e54', '#d4883a'];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + (i % 3) * 0.2;
      const speed = 0.8 + (i % 5) * 0.4;
      items.push({
        vx: Math.cos(angle) * speed,
        vy: 1.1 + (i % 4) * 0.5,
        vz: Math.sin(angle) * speed,
        rx: (i % 3 - 1) * 9,
        ry: (i % 5 - 2) * 8,
        scale: 0.065 + (i % 4) * 0.028,
        color: colors[i % colors.length],
      });
    }
    return items;
  }, []);

  const splashData = useMemo(() => {
    const drops = [];
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const speed = 1.1 + (i % 6) * 0.4;
      drops.push({
        vx: Math.cos(angle) * speed,
        vy: 1.4 + (i % 5) * 0.45,
        vz: Math.sin(angle) * speed,
        scale: 0.05 + (i % 3) * 0.025,
      });
    }
    return drops;
  }, []);

  const totalExtensionCount =
    upgrades.clayTier + upgrades.ironTier + upgrades.funnelTier;

  const stackedRings = useMemo(() => {
    const rings: Array<{
      type: 'clay' | 'iron' | 'funnel';
      yOffset: number;
      bottomRadius: number;
      topRadius: number;
      height: number;
      tiltZ: number;
    }> = [];

    let currentY = 0.28;
    let currentRadius = 0.16;

    for (let i = 0; i < upgrades.clayTier; i++) {
      const h = 0.15;
      const nextRadius = currentRadius + 0.014;
      rings.push({
        type: 'clay',
        yOffset: currentY + h / 2,
        bottomRadius: currentRadius,
        topRadius: nextRadius,
        height: h,
        tiltZ: (i % 2 === 0 ? 1 : -1) * 0.032 * (i + 1),
      });
      currentY += h - 0.01;
      currentRadius = nextRadius;
    }

    for (let i = 0; i < upgrades.ironTier; i++) {
      const h = 0.18;
      const nextRadius = currentRadius + 0.02;
      rings.push({
        type: 'iron',
        yOffset: currentY + h / 2,
        bottomRadius: currentRadius,
        topRadius: nextRadius,
        height: h,
        tiltZ: (i % 2 === 0 ? -1 : 1) * 0.04 * (i + 1),
      });
      currentY += h - 0.01;
      currentRadius = nextRadius;
    }

    for (let i = 0; i < upgrades.funnelTier; i++) {
      const h = 0.22;
      const nextRadius = currentRadius + 0.055;
      rings.push({
        type: 'funnel',
        yOffset: currentY + h / 2,
        bottomRadius: currentRadius,
        topRadius: nextRadius,
        height: h,
        tiltZ: (i % 2 === 0 ? 1 : -1) * 0.055 * (i + 1),
      });
      currentY += h - 0.015;
      currentRadius = nextRadius;
    }

    return { rings, topY: currentY, topRadius: currentRadius };
  }, [upgrades.clayTier, upgrades.ironTier, upgrades.funnelTier]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // 1. Handle Wobble & Unnatural Bend based on fractureRatio + Balance Tilt
    if (handleGroupRef.current) {
      let bendZ = -balanceTilt * 0.35;
      let bendX = 0;

      if (fractureRatio >= 0.6 && climaxSnapElapsed === null) {
        const wobbleAmp = ((fractureRatio - 0.6) / 0.4) * 0.09;
        bendZ += Math.sin(t * 24) * wobbleAmp;
        bendX += Math.cos(t * 19) * wobbleAmp * 0.6;
      }

      if (fractureRatio >= 0.95 && climaxSnapElapsed === null) {
        bendZ += 0.32;
        bendX += 0.18;
      }

      handleGroupRef.current.rotation.z = bendZ;
      handleGroupRef.current.rotation.x = bendX;
    }

    // 2. Dust particles falling from the stressed handle junction at 95% - 99.9%
    if (dustParticlesRef.current) {
      dustParticlesRef.current.children.forEach((child, idx) => {
        const cycle = (t * 1.8 + idx * 0.21) % 1;
        child.position.y = 0.08 - cycle * 0.42;
        child.position.x = Math.sin(t * 5 + idx) * 0.05;
        child.position.z = Math.cos(t * 4 + idx * 2) * 0.05;
        const s = (1 - cycle) * 1.1;
        child.scale.setScalar(s);
      });
    }

    // 3. Tower instability wobble + balance tilt amplification on stacked extensions
    if (towerStackRef.current && climaxSnapElapsed === null) {
      const swaySpeed = isMoving ? 9.5 : 2.5;
      const swayAmp = (isMoving ? 0.032 : 0.008) * (1 + totalExtensionCount * 0.32);
      towerStackRef.current.rotation.z =
        Math.sin(t * swaySpeed) * swayAmp - balanceTilt * 0.28;
      towerStackRef.current.rotation.x =
        Math.cos(t * (swaySpeed * 0.7)) * swayAmp * 0.6;
    }

    // 4. Pitcher Vessel Position: Attached to handle (with balance tilt / spill) OR detaching in Climax!
    if (pitcherVesselRef.current) {
      if (climaxSnapElapsed === null) {
        pitcherVesselRef.current.visible = true;
        const stressSagY =
          fractureRatio >= 0.95 ? -0.07 : fractureRatio >= 0.6 ? -0.02 : 0;

        // Apply active hand-balancing tilt & spill knock
        const balanceRollZ = isSpilling
          ? (balanceTilt >= 0 ? -1.45 : 1.45)
          : -balanceTilt * 0.82;

        const stressTiltZ =
          balanceRollZ +
          (fractureRatio >= 0.95
            ? -0.28
            : fractureRatio >= 0.6
            ? Math.sin(t * 22) * 0.07
            : 0) +
          (isPouring ? -0.55 : isFilling ? 0.35 : 0);

        const spillDropY = isSpilling ? -0.22 : 0;
        pitcherVesselRef.current.position.set(0, stressSagY + spillDropY, 0.22);
        pitcherVesselRef.current.rotation.set(
          isPouring ? 0.65 : isFilling ? 0.45 : isSpilling ? 0.5 : 0,
          0,
          stressTiltZ
        );
      } else {
        // CLIMAX SNAP PHYSICS:
        const dropDuration = 0.55;
        if (climaxSnapElapsed < dropDuration) {
          pitcherVesselRef.current.visible = true;
          const p = climaxSnapElapsed / dropDuration;
          pitcherVesselRef.current.position.set(
            0.03 * p,
            -0.68 * p * p,
            0.24 + 0.14 * p
          );
          pitcherVesselRef.current.rotation.set(
            p * 1.4,
            p * 0.8,
            -0.4 - p * 1.2
          );
        } else {
          pitcherVesselRef.current.visible = false;
        }
      }
    }

    // 5. Shattered low-poly shards & water splash after impact (climaxSnapElapsed >= 0.55s)
    if (shatterGroupRef.current) {
      if (climaxSnapElapsed !== null && climaxSnapElapsed >= 0.55) {
        shatterGroupRef.current.visible = true;
        const st = Math.min(2.5, climaxSnapElapsed - 0.55);
        const floorY = -0.68;

        shatterGroupRef.current.children.forEach((child, idx) => {
          if (idx < shardsData.length) {
            const s = shardsData[idx];
            const x = s.vx * st;
            const z = 0.32 + s.vz * st;
            let y = floorY + s.vy * st - 4.5 * st * st;
            if (y < floorY) {
              const bounceT = st - s.vy / 4.5;
              y = Math.max(
                floorY,
                floorY +
                  Math.abs(Math.sin(bounceT * 6)) * 0.16 * Math.exp(-bounceT * 2)
              );
            }
            child.position.set(x, y, z);
            if (y > floorY + 0.01) {
              child.rotation.x += s.rx * 0.016;
              child.rotation.y += s.ry * 0.016;
            }
          } else {
            const dIdx = idx - shardsData.length;
            const d = splashData[dIdx];
            if (!d) return;
            const x = d.vx * st;
            const z = 0.32 + d.vz * st;
            const y = floorY + d.vy * st - 5.2 * st * st;
            child.position.set(x, Math.max(floorY - 0.02, y), z);
            const scaleFade =
              y <= floorY ? Math.max(0, 1 - (st - 0.4) * 1.5) : 1;
            child.scale.setScalar(d.scale * scaleFade);
          }
        });
      } else {
        shatterGroupRef.current.visible = false;
      }
    }
  });

  return (
    <group>
      {/* THE HANDLE ("UCHO") — NEVER REPLACED! REMAINS IN PLAYER'S RIGHT HAND */}
      <group ref={handleGroupRef} position={[0, 0, 0]}>
        <mesh
          castShadow
          receiveShadow
          position={[0, 0, 0.06]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <torusGeometry args={[0.12, 0.034, 7, 12, Math.PI * 1.25]} />
          <meshStandardMaterial
            map={handleTexture}
            roughness={0.85}
            metalness={0.05}
            flatShading
          />
        </mesh>

        <mesh castShadow position={[0, 0.1, 0.13]}>
          <boxGeometry args={[0.075, 0.065, 0.09]} />
          <meshStandardMaterial map={handleTexture} roughness={0.88} flatShading />
        </mesh>
        <mesh castShadow position={[0, -0.1, 0.13]}>
          <boxGeometry args={[0.075, 0.065, 0.09]} />
          <meshStandardMaterial map={handleTexture} roughness={0.88} flatShading />
        </mesh>

        {fractureStage >= 1 && (
          <group position={[0, 0.1, 0.14]}>
            <mesh position={[0, 0.015, 0]} rotation={[0.2, 0.3, 0.4]}>
              <boxGeometry args={[0.084, 0.014, 0.095]} />
              <meshBasicMaterial color="#1a0905" />
            </mesh>
            <mesh position={[0, -0.2, 0]} rotation={[-0.2, -0.2, -0.35]}>
              <boxGeometry args={[0.084, 0.014, 0.095]} />
              <meshBasicMaterial color="#1a0905" />
            </mesh>
          </group>
        )}

        {fractureStage >= 2 && (
          <group position={[0, 0, 0.08]}>
            <mesh position={[0, 0.11, 0.06]} rotation={[0.4, 0.2, -0.5]}>
              <dodecahedronGeometry args={[0.048, 0]} />
              <meshBasicMaterial color="#120502" />
            </mesh>
            <mesh position={[0, -0.09, 0.06]} rotation={[-0.3, 0.5, 0.6]}>
              <dodecahedronGeometry args={[0.045, 0]} />
              <meshBasicMaterial color="#120502" />
            </mesh>
          </group>
        )}

        {climaxSnapElapsed !== null && (
          <group position={[0, 0, 0.16]}>
            <mesh position={[0, 0.1, 0]} rotation={[0.3, 0.4, 0.2]}>
              <coneGeometry args={[0.042, 0.07, 5]} />
              <meshStandardMaterial color="#87361f" roughness={0.95} flatShading />
            </mesh>
            <mesh position={[0, -0.1, 0]} rotation={[-0.4, 0.2, -0.3]}>
              <coneGeometry args={[0.042, 0.07, 5]} />
              <meshStandardMaterial color="#87361f" roughness={0.95} flatShading />
            </mesh>
          </group>
        )}

        {fractureStage >= 3 && climaxSnapElapsed === null && (
          <group ref={dustParticlesRef} position={[0, 0.08, 0.15]}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <mesh key={i}>
                <dodecahedronGeometry args={[0.018, 0]} />
                <meshStandardMaterial color="#b86b52" roughness={1} flatShading />
              </mesh>
            ))}
          </group>
        )}
      </group>

      {/* THE PITCHER VESSEL & MODULAR EXTENSION TOWER */}
      <group ref={pitcherVesselRef} position={[0, 0, 0.22]}>
        <mesh castShadow receiveShadow position={[0, -0.08, 0]}>
          <cylinderGeometry args={[0.21, 0.13, 0.26, 9]} />
          <meshStandardMaterial color="#c86446" roughness={0.82} flatShading />
        </mesh>

        <mesh castShadow receiveShadow position={[0, 0.11, 0]}>
          <cylinderGeometry args={[0.14, 0.21, 0.16, 9]} />
          <meshStandardMaterial color="#d16e50" roughness={0.82} flatShading />
        </mesh>

        <mesh position={[0, -0.01, 0]}>
          <cylinderGeometry args={[0.213, 0.205, 0.045, 9]} />
          <meshStandardMaterial color="#f2e3c6" roughness={0.7} flatShading />
        </mesh>

        <mesh castShadow receiveShadow position={[0, 0.23, 0]}>
          <cylinderGeometry args={[0.165, 0.14, 0.1, 9]} />
          <meshStandardMaterial color="#bf5a3c" roughness={0.85} flatShading />
        </mesh>

        <group ref={towerStackRef}>
          {stackedRings.rings.map((ring, idx) => (
            <group
              key={idx}
              position={[0, ring.yOffset, 0]}
              rotation={[0, idx * 0.7, ring.tiltZ]}
            >
              {ring.type === 'clay' && (
                <group>
                  <mesh castShadow receiveShadow>
                    <cylinderGeometry
                      args={[ring.topRadius, ring.bottomRadius, ring.height, 9]}
                    />
                    <meshStandardMaterial color="#d47254" roughness={0.84} flatShading />
                  </mesh>
                  <mesh position={[0, ring.height * 0.42, 0]}>
                    <cylinderGeometry
                      args={[ring.topRadius * 1.05, ring.topRadius * 1.05, 0.03, 9]}
                    />
                    <meshStandardMaterial color="#a8492d" roughness={0.9} flatShading />
                  </mesh>
                </group>
              )}

              {ring.type === 'iron' && (
                <group>
                  <mesh castShadow receiveShadow>
                    <cylinderGeometry
                      args={[ring.topRadius, ring.bottomRadius, ring.height, 10]}
                    />
                    <meshStandardMaterial color="#8c583a" roughness={0.85} flatShading />
                  </mesh>
                  <mesh castShadow position={[0, -ring.height * 0.28, 0]}>
                    <cylinderGeometry
                      args={[ring.bottomRadius * 1.06, ring.bottomRadius * 1.06, 0.04, 10]}
                    />
                    <meshStandardMaterial
                      color="#3a3f47"
                      metalness={0.65}
                      roughness={0.4}
                      flatShading
                    />
                  </mesh>
                  <mesh castShadow position={[0, ring.height * 0.28, 0]}>
                    <cylinderGeometry
                      args={[ring.topRadius * 1.06, ring.topRadius * 1.06, 0.04, 10]}
                    />
                    <meshStandardMaterial
                      color="#3a3f47"
                      metalness={0.65}
                      roughness={0.4}
                      flatShading
                    />
                  </mesh>
                </group>
              )}

              {ring.type === 'funnel' && (
                <group>
                  <mesh castShadow receiveShadow>
                    <cylinderGeometry
                      args={[ring.topRadius, ring.bottomRadius, ring.height, 10]}
                    />
                    <meshStandardMaterial
                      color="#d98a3c"
                      metalness={0.5}
                      roughness={0.35}
                      flatShading
                    />
                  </mesh>
                  <mesh position={[0, ring.height * 0.46, 0]}>
                    <cylinderGeometry
                      args={[ring.topRadius * 1.05, ring.topRadius * 1.02, 0.035, 10]}
                    />
                    <meshStandardMaterial
                      color="#f0b354"
                      metalness={0.6}
                      roughness={0.3}
                      flatShading
                    />
                  </mesh>
                </group>
              )}
            </group>
          ))}

          {/* Water surface level visible inside top of pitcher (sloshes with balanceTilt!) */}
          {waterFillRatio > 0.02 && (
            <mesh
              position={[
                0,
                0.18 + (stackedRings.topY - 0.18) * Math.min(0.96, waterFillRatio),
                0,
              ]}
              rotation={[0, 0, balanceTilt * 0.45]}
            >
              <cylinderGeometry
                args={[
                  (0.14 + (stackedRings.topRadius - 0.14) * waterFillRatio) * 0.92,
                  0.12,
                  0.04,
                  9,
                ]}
              />
              <meshStandardMaterial
                color="#4db6e6"
                emissive="#1a6b9c"
                emissiveIntensity={0.25}
                roughness={0.2}
                flatShading
              />
            </mesh>
          )}
        </group>

        {/* Active pouring water stream OR spilling water stream */}
        {((isPouring && waterFillRatio > 0) || isSpilling) && climaxSnapElapsed === null && (
          <mesh position={[0, stackedRings.topY + 0.12, 0.25]} rotation={[0.7, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.13, 0.75, 7]} />
            <meshStandardMaterial
              color="#63c5f2"
              transparent
              opacity={0.85}
              roughness={0.15}
              flatShading
            />
          </mesh>
        )}
      </group>

      {/* SHATTERED LOW-POLY DEBRIS & WATER SPLASH (CLIMAX CUTSCENE IMPACT) */}
      <group ref={shatterGroupRef} visible={false}>
        {shardsData.map((s, i) => (
          <mesh key={`shard-${i}`} castShadow scale={s.scale}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={s.color} roughness={0.85} flatShading />
          </mesh>
        ))}
        {splashData.map((d, i) => (
          <mesh key={`drop-${i}`} scale={d.scale}>
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color="#63c5f2"
              transparent
              opacity={0.85}
              roughness={0.15}
              flatShading
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};
