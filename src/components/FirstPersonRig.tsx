import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LeftHandItemType, PlayerState } from '../../shared/types';
import { PitcherRig } from './PitcherRig';

export type LeftHandItem = LeftHandItemType;

interface FirstPersonRigProps {
  rigRootRef: React.RefObject<THREE.Group>;
  player: PlayerState;
  fractureRatio: number;
  balanceTilt: number;
  isSpilling: boolean;
  leftHandItem: LeftHandItem;
  leftActionTrigger: number; // Increments each time player triggers left-hand action
  climaxSnapElapsed: number | null;
  cutscenePhase: 'none' | 'orbit' | 'snap' | 'zoom_hand' | 'proverb';
  onSpinnerRpmChange?: (rpm: number) => void;
}

export const FirstPersonRig: React.FC<FirstPersonRigProps> = ({
  rigRootRef,
  player,
  fractureRatio,
  balanceTilt,
  isSpilling,
  leftHandItem,
  leftActionTrigger,
  climaxSnapElapsed,
  cutscenePhase,
  onSpinnerRpmChange,
}) => {
  const rightArmGroupRef = useRef<THREE.Group>(null);
  const leftArmGroupRef = useRef<THREE.Group>(null);

  // 1. Cigarette refs & state
  const cigEmberRef = useRef<THREE.MeshStandardMaterial>(null);
  const smokeCloudRef = useRef<THREE.Group>(null);
  const smokeTimerRef = useRef<number>(999);

  // 2. Butterfly Knife refs & state
  const knifeRootRef = useRef<THREE.Group>(null);
  const safeHandleRef = useRef<THREE.Group>(null);
  const biteHandleRef = useRef<THREE.Group>(null);
  const bladeRef = useRef<THREE.Group>(null);
  const knifeTrickTimerRef = useRef<number>(999);
  const knifeTrickVariantRef = useRef<number>(0);

  // 3. Fidget Spinner refs & state
  const spinnerRotorRef = useRef<THREE.Group>(null);
  const spinnerVelRef = useRef<number>(0);
  const spinnerAngleRef = useRef<number>(0);
  const lastReportedRpmRef = useRef<number>(0);

  // 4. Beer Mug refs & state
  const beerLiquidRef = useRef<THREE.Mesh>(null);
  const beerFoamRef = useRef<THREE.Group>(null);
  const beerDrinkTimerRef = useRef<number>(999);

  // 5. Marksman Rifle refs & state
  const muzzleFlashRef = useRef<THREE.Mesh>(null);
  const rifleShotTimerRef = useRef<number>(999);

  // 6. "Leštit" (Polish + 3 short piss streams) refs & state
  const polishTimerRef = useRef<number>(999);
  const pissStreamsRef = useRef<THREE.Group>(null);

  // Disable frustum culling on all first-person viewmodel meshes so they NEVER flicker when sprinting!
  useEffect(() => {
    if (!rigRootRef.current) return;
    rigRootRef.current.traverse((obj) => {
      obj.frustumCulled = false;
    });
  }, [
    rigRootRef,
    leftHandItem,
    player.upgrades.clayTier,
    player.upgrades.ironTier,
    player.upgrades.funnelTier,
    climaxSnapElapsed,
  ]);

  // Trigger left-hand item animation when `leftActionTrigger` increments
  useEffect(() => {
    if (leftActionTrigger === 0) return;
    if (leftHandItem === 'cigarette') {
      smokeTimerRef.current = 0;
    } else if (leftHandItem === 'knife') {
      knifeTrickTimerRef.current = 0;
      knifeTrickVariantRef.current = (knifeTrickVariantRef.current + 1) % 3;
    } else if (leftHandItem === 'spinner') {
      spinnerVelRef.current = Math.min(72, spinnerVelRef.current + 28);
    } else if (leftHandItem === 'beer') {
      beerDrinkTimerRef.current = 0;
    } else if (leftHandItem === 'rifle') {
      rifleShotTimerRef.current = 0;
    } else if (leftHandItem === 'polish') {
      polishTimerRef.current = 0;
    }
  }, [leftActionTrigger, leftHandItem]);

  const smokePuffsData = useMemo(() => {
    const puffs = [];
    for (let i = 0; i < 16; i++) {
      puffs.push({
        dx: (Math.random() - 0.5) * 0.28,
        dy: 0.08 + Math.random() * 0.25,
        dz: -0.25 - Math.random() * 0.45,
        scale: 0.035 + Math.random() * 0.055,
        delay: i * 0.035,
      });
    }
    return puffs;
  }, []);

  const waterFillRatio =
    player.waterCapacity > 0
      ? Math.min(1, player.waterCarried / player.waterCapacity)
      : 0;

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(0.1, rawDelta);
    const t = clock.getElapsedTime();

    if (!rigRootRef.current) return;
    // Ensure any dynamically mounted meshes also have frustumCulled = false
    rigRootRef.current.traverse((obj) => {
      if (obj.frustumCulled) obj.frustumCulled = false;
    });

    const isWalking = player.isMoving && cutscenePhase === 'none';
    const walkBobX = isWalking ? Math.cos(t * 8.5) * 0.016 : Math.cos(t * 1.6) * 0.004;
    const walkBobY = isWalking
      ? Math.abs(Math.sin(t * 8.5)) * 0.02
      : Math.sin(t * 1.6) * 0.005;

    // =========================================================================
    // 1. RIGHT HAND (ONE-HANDED PITCHER HOLD & BALANCE)
    // =========================================================================
    if (rightArmGroupRef.current) {
      if (cutscenePhase === 'none') {
        const targetX = 0.34 + walkBobX + balanceTilt * 0.09;
        const targetY =
          -0.31 +
          walkBobY -
          (player.isFilling ? 0.14 : player.isPouring ? 0.05 : 0) -
          Math.abs(balanceTilt) * 0.04;
        const targetZ = -0.68;

        rightArmGroupRef.current.position.set(targetX, targetY, targetZ);
        rightArmGroupRef.current.rotation.set(
          player.isPouring ? -0.35 : player.isFilling ? 0.28 : 0.08,
          -0.22 - balanceTilt * 0.15,
          -balanceTilt * 0.25
        );
      } else if (cutscenePhase === 'orbit' || cutscenePhase === 'snap') {
        rightArmGroupRef.current.position.lerp(
          new THREE.Vector3(0.06, -0.18, -0.66),
          Math.min(1, delta * 6)
        );
        rightArmGroupRef.current.rotation.set(0.12, -0.35, 0);
      } else {
        rightArmGroupRef.current.position.lerp(
          new THREE.Vector3(0.02, -0.06, -0.38),
          Math.min(1, delta * 5)
        );
        rightArmGroupRef.current.rotation.set(
          0.15 + Math.sin(t * 1.5) * 0.04,
          -0.48 + Math.cos(t * 1.2) * 0.06,
          0.08
        );
      }
    }

    // =========================================================================
    // 2. LEFT HAND (CIGARETTE, KNIFE, SPINNER, BEER, RIFLE)
    // =========================================================================
    if (leftArmGroupRef.current) {
      if (cutscenePhase !== 'none') {
        leftArmGroupRef.current.position.lerp(
          new THREE.Vector3(-0.45, -0.65, -0.5),
          Math.min(1, delta * 6)
        );
      } else {
        let lx = -0.33 - walkBobX;
        let ly = -0.27 + walkBobY;
        let lz = -0.54;
        let rx = 0.12;
        let ry = 0.22;
        let rz = 0;

        // A) Cigarette Smoking Animation (Filter at rear +Z -> Mouth, Ember at front -Z!)
        if (leftHandItem === 'cigarette') {
          smokeTimerRef.current += delta;
          const st = smokeTimerRef.current;

          if (st < 1.7) {
            const inhaleFactor =
              st < 0.5
                ? st / 0.5
                : st < 1.05
                ? 1.0
                : Math.max(0, 1 - (st - 1.05) / 0.65);
            const smooth = inhaleFactor * inhaleFactor * (3 - 2 * inhaleFactor);

            lx = THREE.MathUtils.lerp(lx, -0.05, smooth);
            ly = THREE.MathUtils.lerp(ly, -0.1, smooth);
            lz = THREE.MathUtils.lerp(lz, -0.24, smooth);
            rx = THREE.MathUtils.lerp(rx, 0.05, smooth);
            ry = THREE.MathUtils.lerp(ry, 0.08, smooth);
            rz = THREE.MathUtils.lerp(rz, -0.12, smooth);

            if (cigEmberRef.current) {
              cigEmberRef.current.emissiveIntensity =
                st >= 0.35 && st <= 1.05 ? 4.2 + Math.sin(t * 30) * 0.8 : 1.2;
            }
          } else if (cigEmberRef.current) {
            cigEmberRef.current.emissiveIntensity = 1.1 + Math.sin(t * 4) * 0.2;
          }

          if (smokeCloudRef.current) {
            if (st >= 0.95 && st <= 2.9) {
              smokeCloudRef.current.visible = true;
              const exhaleT = st - 0.95;
              smokeCloudRef.current.children.forEach((child, idx) => {
                const p = smokePuffsData[idx];
                const pt = Math.max(0, exhaleT - p.delay);
                child.position.set(
                  p.dx * pt * 1.4 + Math.sin(t * 3 + idx) * 0.02,
                  -0.06 + p.dy * pt * 1.1,
                  -0.2 + p.dz * pt * 1.3
                );
                const fade =
                  pt < 0.2 ? pt / 0.2 : Math.max(0, 1 - (pt - 0.2) / 1.4);
                child.scale.setScalar(p.scale * (0.6 + pt * 1.8) * fade);
              });
            } else {
              smokeCloudRef.current.visible = false;
            }
          }
        } else if (smokeCloudRef.current) {
          smokeCloudRef.current.visible = false;
        }

        // B) Butterfly Knife Trick Animation
        if (leftHandItem === 'knife') {
          knifeTrickTimerRef.current += delta;
          const kt = knifeTrickTimerRef.current;

          if (kt < 0.85) {
            const wristWave = Math.sin((kt / 0.85) * Math.PI * 2);
            ly += Math.abs(wristWave) * 0.05;
            rx += wristWave * 0.25;
            rz += Math.cos((kt / 0.85) * Math.PI * 4) * 0.18;

            if (
              knifeRootRef.current &&
              safeHandleRef.current &&
              biteHandleRef.current &&
              bladeRef.current
            ) {
              const p = kt / 0.85;
              const openAngle = Math.sin(p * Math.PI) * Math.PI * 0.96;
              biteHandleRef.current.rotation.z = openAngle;
              bladeRef.current.rotation.z = Math.sin(p * Math.PI * 2) * 0.35;
              knifeRootRef.current.rotation.x = p * Math.PI * 4;
              knifeRootRef.current.rotation.y =
                Math.sin(p * Math.PI * 2) *
                (knifeTrickVariantRef.current === 1 ? 1.2 : 0.5);
              knifeRootRef.current.position.y =
                0.08 + Math.sin(p * Math.PI) * 0.07;
            }
          } else if (
            knifeRootRef.current &&
            safeHandleRef.current &&
            biteHandleRef.current &&
            bladeRef.current
          ) {
            biteHandleRef.current.rotation.z = 0;
            bladeRef.current.rotation.z = 0;
            knifeRootRef.current.rotation.set(
              Math.sin(t * 2.2) * 0.05,
              0,
              Math.cos(t * 1.8) * 0.04
            );
            knifeRootRef.current.position.y = 0.08;
          }
        }

        // C) Fidget Spinner Physics & High-RPM Spin
        if (spinnerVelRef.current > 0.01) {
          spinnerAngleRef.current += spinnerVelRef.current * delta;
          spinnerVelRef.current = Math.max(0, spinnerVelRef.current - delta * 6.5);
        }
        if (spinnerRotorRef.current) {
          spinnerRotorRef.current.rotation.y = spinnerAngleRef.current;
          const gyro = Math.min(1, spinnerVelRef.current / 50) * 0.08;
          spinnerRotorRef.current.rotation.x = Math.sin(t * 18) * gyro;
        }
        if (onSpinnerRpmChange) {
          const rpm = Math.round((spinnerVelRef.current / (Math.PI * 2)) * 60);
          if (
            Math.abs(rpm - lastReportedRpmRef.current) >= 15 ||
            (rpm === 0 && lastReportedRpmRef.current !== 0)
          ) {
            lastReportedRpmRef.current = rpm;
            onSpinnerRpmChange(rpm);
          }
        }

        // D) Beer Drinking Animation ("Pivo") — FIXED DIRECTION!
        // Positive X rotation (+1.12 rad) tilts the TOP (+Y, where the white foam is!)
        // backward toward +Z (directly into the player's mouth!), while the bottom (-Y) points away (-Z)!
        if (leftHandItem === 'beer') {
          beerDrinkTimerRef.current += delta;
          const bt = beerDrinkTimerRef.current;

          if (bt < 1.55) {
            const drinkFactor =
              bt < 0.35
                ? bt / 0.35
                : bt < 1.15
                ? 1.0
                : Math.max(0, 1 - (bt - 1.15) / 0.4);
            const smooth = drinkFactor * drinkFactor * (3 - 2 * drinkFactor);
            const gulpBob = bt >= 0.35 && bt <= 1.15 ? Math.sin(bt * 18) * 0.06 : 0;

            lx = THREE.MathUtils.lerp(lx, -0.04, smooth);
            ly = THREE.MathUtils.lerp(ly, -0.11 + gulpBob * 0.25, smooth);
            lz = THREE.MathUtils.lerp(lz, -0.26, smooth);
            // Positive X rotation tilts top rim (+Y) toward player's mouth (+Z)!
            rx = THREE.MathUtils.lerp(rx, 1.12 + gulpBob, smooth);
            ry = THREE.MathUtils.lerp(ry, 0.05, smooth);
            rz = THREE.MathUtils.lerp(rz, -0.06, smooth);

            if (beerLiquidRef.current) {
              const drain =
                bt < 1.15
                  ? Math.max(0.35, 1 - (bt / 1.15) * 0.55)
                  : 0.45 + ((bt - 1.15) / 0.4) * 0.55;
              beerLiquidRef.current.scale.y = drain;
            }
          } else if (beerLiquidRef.current) {
            beerLiquidRef.current.scale.y = 1.0;
          }
        }

        // E) Marksman Rifle Aiming & Recoil Animation ("Puška")
        if (leftHandItem === 'rifle') {
          rifleShotTimerRef.current += delta;
          const rt = rifleShotTimerRef.current;

          lx = -0.22 - walkBobX * 0.5;
          ly = -0.24 + walkBobY * 0.5;
          lz = -0.48;
          rx = 0.02;
          ry = -0.06;
          rz = 0;

          if (rt < 0.45) {
            const kick =
              Math.exp(-rt * 12) * Math.sin(Math.min(1, rt * 28) * (Math.PI / 2));
            lz += kick * 0.14;
            ly += kick * 0.045;
            rx += kick * 0.26;
          }

          if (muzzleFlashRef.current) {
            muzzleFlashRef.current.visible = rt < 0.075;
            if (rt < 0.075) {
              muzzleFlashRef.current.rotation.z = t * 45;
              muzzleFlashRef.current.scale.setScalar(0.9 + Math.random() * 0.4);
            }
          }
        }

        // F) "Leštit" Action: Straightened arm moving from between the legs slightly up and back down 3x,
        // followed by pissing in 3 short streams in a row!
        if (leftHandItem === 'polish') {
          polishTimerRef.current += delta;
          const pt = polishTimerRef.current;

          // Base straightened arm positioned down toward the center (between the legs)
          lx = -0.05 - walkBobX * 0.4;
          ly = -0.41 + walkBobY * 0.4;
          lz = -0.45;
          rx = -0.46;
          ry = -0.18;
          rz = -0.26;

          if (pt < 1.35) {
            // Phase 1 (0.0s - 1.35s): 3 full up-and-down strokes from between the legs
            const strokeUp = (1 - Math.cos((pt / 1.35) * Math.PI * 6)) * 0.5;
            ly += strokeUp * 0.16;
            lz -= strokeUp * 0.05;
            rx += strokeUp * 0.36;
          } else if (pt < 2.75) {
            // Phase 2 (1.35s - 2.75s): Hold steady at bottom while pissing in 3 short streams
            lx = -0.11;
            ly = -0.39;
            lz = -0.43;
          }

          if (pissStreamsRef.current) {
            // 3 short streams in a row: [1.35..1.72], [1.85..2.22], [2.35..2.72]
            const streamWindows = [
              { start: 1.35, end: 1.72 },
              { start: 1.85, end: 2.22 },
              { start: 2.35, end: 2.72 },
            ];
            const activeWin = streamWindows.find((w) => pt >= w.start && pt <= w.end);
            if (activeWin) {
              pissStreamsRef.current.visible = true;
              const localStreamT = (pt - activeWin.start) / (activeWin.end - activeWin.start);
              pissStreamsRef.current.children.forEach((child, idx) => {
                const frac = ((idx / 12 + localStreamT * 2.2) % 1);
                // Arcing stream trajectory forward (-Z) and downward (-Y) from between the legs
                const distZ = -0.22 - frac * 1.45;
                const arcY = -0.36 + frac * 0.18 - frac * frac * 0.68;
                const spreadX = Math.sin(idx * 4.1 + t * 25) * 0.015 * frac;
                child.position.set(spreadX, arcY, distZ);
                child.scale.set(0.018, 0.018, 0.065);
                child.rotation.set(0.35 + frac * 0.65, 0, 0);
              });
            } else {
              pissStreamsRef.current.visible = false;
            }
          }
        } else if (pissStreamsRef.current) {
          pissStreamsRef.current.visible = false;
        }

        leftArmGroupRef.current.position.set(lx, ly, lz);
        leftArmGroupRef.current.rotation.set(rx, ry, rz);
      }
    }
  });

  return (
    <group ref={rigRootRef} frustumCulled={false}>
      {/* EXHALED CIGARETTE SMOKE CLOUD IN FRONT OF CAMERA */}
      <group ref={smokeCloudRef} visible={false} frustumCulled={false}>
        {smokePuffsData.map((_, i) => (
          <mesh key={`exhale-${i}`} frustumCulled={false}>
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color="#d6d3d1"
              transparent
              opacity={0.42}
              roughness={1}
              flatShading
            />
          </mesh>
        ))}
      </group>

      {/* "LEŠTIT" PHASE 2: 3 SHORT WHITE STREAMS IN A ROW */}
      <group ref={pissStreamsRef} visible={false} frustumCulled={false}>
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh key={`piss-drop-${i}`} frustumCulled={false}>
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

      {/* RIGHT ARM & SINGLE HAND HOLDING THE PITCHER HANDLE */}
      <group ref={rightArmGroupRef} position={[0.34, -0.31, -0.68]} frustumCulled={false}>
        <mesh
          castShadow
          frustumCulled={false}
          position={[0.08, -0.14, 0.24]}
          rotation={[1.15, -0.2, -0.15]}
        >
          <cylinderGeometry args={[0.062, 0.075, 0.38, 7]} />
          <meshStandardMaterial color="#e8dfd1" roughness={0.85} flatShading />
        </mesh>

        <mesh castShadow frustumCulled={false} position={[0, 0, 0.02]}>
          <dodecahedronGeometry args={[0.068, 0]} />
          <meshStandardMaterial color="#ebc3a4" roughness={0.8} flatShading />
        </mesh>

        <PitcherRig
          upgrades={player.upgrades}
          waterFillRatio={waterFillRatio}
          fractureRatio={fractureRatio}
          isMoving={player.isMoving}
          isPouring={player.isPouring}
          isFilling={player.isFilling}
          balanceTilt={balanceTilt}
          isSpilling={isSpilling}
          climaxSnapElapsed={climaxSnapElapsed}
        />
      </group>

      {/* LEFT ARM & HAND HOLDING OFF-HAND ITEMS */}
      <group ref={leftArmGroupRef} position={[-0.33, -0.27, -0.54]} frustumCulled={false}>
        <mesh
          castShadow
          frustumCulled={false}
          position={[-0.08, -0.14, 0.22]}
          rotation={[1.15, 0.2, 0.15]}
        >
          <cylinderGeometry args={[0.058, 0.072, 0.36, 7]} />
          <meshStandardMaterial color="#e8dfd1" roughness={0.85} flatShading />
        </mesh>

        <mesh castShadow frustumCulled={false} position={[0, 0, 0]}>
          <dodecahedronGeometry args={[0.062, 0]} />
          <meshStandardMaterial color="#ebc3a4" roughness={0.8} flatShading />
        </mesh>

        {/* ITEM 1: CIGARETTE ("CIGARETA") */}
        {leftHandItem === 'cigarette' && (
          <group position={[0.03, 0.045, -0.01]} rotation={[0.08, -0.18, 0]}>
            <mesh
              castShadow
              frustumCulled={false}
              position={[0, 0, 0.032]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.011, 0.011, 0.044, 8]} />
              <meshStandardMaterial color="#d99b52" roughness={0.8} flatShading />
            </mesh>
            <mesh
              castShadow
              frustumCulled={false}
              position={[0, 0, -0.035]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.011, 0.011, 0.09, 8]} />
              <meshStandardMaterial color="#f5f5f4" roughness={0.85} flatShading />
            </mesh>
            <mesh
              frustumCulled={false}
              position={[0, 0, -0.088]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.011, 0.0115, 0.018, 8]} />
              <meshStandardMaterial
                ref={cigEmberRef}
                color="#ff4500"
                emissive="#ff3b00"
                emissiveIntensity={1.2}
                roughness={0.6}
                flatShading
              />
            </mesh>
          </group>
        )}

        {/* ITEM 2: BUTTERFLY KNIFE ("MOTÝLEK / BALISONG") */}
        {leftHandItem === 'knife' && (
          <group ref={knifeRootRef} position={[0.02, 0.08, -0.03]}>
            <group ref={bladeRef} position={[0, 0, 0]}>
              <mesh castShadow frustumCulled={false} position={[0, 0.075, 0]}>
                <coneGeometry args={[0.016, 0.15, 4]} />
                <meshStandardMaterial
                  color="#e2e8f0"
                  metalness={0.85}
                  roughness={0.18}
                  flatShading
                />
              </mesh>
            </group>

            <group ref={safeHandleRef} position={[-0.014, 0, 0]}>
              <mesh castShadow frustumCulled={false} position={[0, -0.07, 0]}>
                <boxGeometry args={[0.016, 0.14, 0.022]} />
                <meshStandardMaterial
                  color="#1e293b"
                  metalness={0.7}
                  roughness={0.3}
                  flatShading
                />
              </mesh>
              <mesh
                frustumCulled={false}
                position={[0, 0, 0]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.006, 0.006, 0.026, 6]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
              </mesh>
            </group>

            <group ref={biteHandleRef} position={[0.014, 0, 0]}>
              <mesh castShadow frustumCulled={false} position={[0, -0.07, 0]}>
                <boxGeometry args={[0.016, 0.14, 0.022]} />
                <meshStandardMaterial
                  color="#991b1b"
                  metalness={0.7}
                  roughness={0.3}
                  flatShading
                />
              </mesh>
              <mesh frustumCulled={false} position={[0, -0.145, 0]}>
                <boxGeometry args={[0.024, 0.012, 0.012]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
              </mesh>
            </group>
          </group>
        )}

        {/* ITEM 3: FIDGET SPINNER ("FIDGET SPINNER") */}
        {leftHandItem === 'spinner' && (
          <group position={[0.02, 0.06, -0.03]} rotation={[0.55, -0.2, -0.15]}>
            <mesh castShadow frustumCulled={false}>
              <cylinderGeometry args={[0.024, 0.024, 0.022, 10]} />
              <meshStandardMaterial
                color="#fbbf24"
                metalness={0.75}
                roughness={0.25}
                flatShading
              />
            </mesh>

            <group ref={spinnerRotorRef}>
              {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, idx) => (
                <group key={`lobe-${idx}`} rotation={[0, angle, 0]}>
                  <mesh castShadow frustumCulled={false} position={[0.038, 0, 0]}>
                    <boxGeometry args={[0.065, 0.012, 0.028]} />
                    <meshStandardMaterial
                      color="#dc2626"
                      metalness={0.45}
                      roughness={0.35}
                      flatShading
                    />
                  </mesh>
                  <mesh castShadow frustumCulled={false} position={[0.068, 0, 0]}>
                    <cylinderGeometry args={[0.026, 0.026, 0.015, 10]} />
                    <meshStandardMaterial
                      color="#dc2626"
                      metalness={0.45}
                      roughness={0.35}
                      flatShading
                    />
                  </mesh>
                  <mesh frustumCulled={false} position={[0.068, 0, 0]}>
                    <cylinderGeometry args={[0.016, 0.016, 0.018, 10]} />
                    <meshStandardMaterial
                      color="#e2e8f0"
                      metalness={0.85}
                      roughness={0.2}
                      flatShading
                    />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        )}

        {/* ITEM 4: CZECH BEER MUG ("PIVO — PŮLLITR") */}
        {leftHandItem === 'beer' && (
          <group position={[0.05, 0.04, -0.04]}>
            <mesh
              frustumCulled={false}
              position={[-0.055, 0, 0]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <torusGeometry args={[0.052, 0.012, 6, 10, Math.PI]} />
              <meshStandardMaterial
                color="#e2e8f0"
                transparent
                opacity={0.65}
                roughness={0.2}
                flatShading
              />
            </mesh>

            <mesh castShadow frustumCulled={false} position={[0, 0.01, 0]}>
              <cylinderGeometry args={[0.068, 0.062, 0.19, 10]} />
              <meshStandardMaterial
                color="#f1f5f9"
                transparent
                opacity={0.42}
                roughness={0.15}
                metalness={0.1}
                flatShading
              />
            </mesh>

            <mesh ref={beerLiquidRef} frustumCulled={false} position={[0, -0.005, 0]}>
              <cylinderGeometry args={[0.058, 0.054, 0.14, 10]} />
              <meshStandardMaterial
                color="#f59e0b"
                emissive="#b45309"
                emissiveIntensity={0.25}
                roughness={0.25}
                flatShading
              />
            </mesh>

            <group ref={beerFoamRef} position={[0, 0.085, 0]}>
              <mesh castShadow frustumCulled={false}>
                <cylinderGeometry args={[0.07, 0.066, 0.042, 10]} />
                <meshStandardMaterial color="#fffbeb" roughness={0.9} flatShading />
              </mesh>
              <mesh frustumCulled={false} position={[-0.02, 0.022, 0.01]}>
                <dodecahedronGeometry args={[0.032, 0]} />
                <meshStandardMaterial color="#ffffff" roughness={0.95} flatShading />
              </mesh>
              <mesh frustumCulled={false} position={[0.022, 0.02, -0.012]}>
                <dodecahedronGeometry args={[0.028, 0]} />
                <meshStandardMaterial color="#ffffff" roughness={0.95} flatShading />
              </mesh>
            </group>
          </group>
        )}

        {/* ITEM 5: MARKSMAN RIFLE ("MYSLIVECKÁ PUŠKA") */}
        {leftHandItem === 'rifle' && (
          <group position={[0.03, 0.04, -0.05]}>
            <mesh
              castShadow
              frustumCulled={false}
              position={[0, -0.01, 0.08]}
              rotation={[0.08, 0, 0]}
            >
              <boxGeometry args={[0.038, 0.065, 0.34]} />
              <meshStandardMaterial color="#5c3820" roughness={0.85} flatShading />
            </mesh>

            <mesh castShadow frustumCulled={false} position={[0, 0.022, -0.04]}>
              <boxGeometry args={[0.04, 0.042, 0.16]} />
              <meshStandardMaterial
                color="#475569"
                metalness={0.75}
                roughness={0.3}
                flatShading
              />
            </mesh>

            <mesh
              castShadow
              frustumCulled={false}
              position={[0, 0.028, -0.32]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.013, 0.016, 0.52, 8]} />
              <meshStandardMaterial
                color="#1e293b"
                metalness={0.85}
                roughness={0.22}
                flatShading
              />
            </mesh>

            <mesh frustumCulled={false} position={[0, 0.048, -0.54]}>
              <boxGeometry args={[0.006, 0.022, 0.012]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh frustumCulled={false} position={[0, 0.048, -0.1]}>
              <boxGeometry args={[0.024, 0.016, 0.012]} />
              <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
            </mesh>

            <mesh
              ref={muzzleFlashRef}
              frustumCulled={false}
              visible={false}
              position={[0, 0.028, -0.6]}
            >
              <dodecahedronGeometry args={[0.085, 0]} />
              <meshBasicMaterial color="#fde047" />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
};
