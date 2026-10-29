import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BEAR_MAX_HP,
  BEAR_REGEN_DELAY_MS,
  BearState,
  getFlowRatePerSecond,
  getMoveSpeedMultiplier,
  PlayerState,
  RoomState,
} from '../../shared/types';
import {
  getForestSide,
  getPathCenterX,
  getTerrainHeight,
  isInSpringWater,
  isNearMerchant,
  isNearWell,
  isOnRoad,
  WORLD_LOCATIONS,
  WORLD_PROPS,
} from '../../shared/world';
import { soundEngine } from '../audio/SoundEngine';
import { BearModel } from './BearModel';
import { CharacterModel } from './CharacterModel';
import { FirstPersonRig, LeftHandItem } from './FirstPersonRig';
import { WorldEnvironment } from './WorldEnvironment';

interface GameSceneProps {
  roomState: RoomState;
  localPlayerId: string;
  leftHandItem: LeftHandItem;
  leftActionTrigger: number;
  shotByRemoteCounter: number;
  onTriggerLeftAction: () => void;
  onSelectLeftItem: (item: LeftHandItem) => void;
  onShootPitcher: (targetId: string) => void;
  onShootBear: (bearId: 'bear_west' | 'bear_east') => void;
  onBearAttackPlayer: () => void;
  onSpinnerRpmChange: (rpm: number) => void;
  onBalanceUpdate: (
    tilt: number,
    isDanger: boolean,
    spilledRecently: boolean,
    isSprinting: boolean
  ) => void;
  onLocalPlayerMove: (
    x: number,
    y: number,
    z: number,
    rotY: number,
    isMoving: boolean,
    isFilling: boolean,
    isPouring: boolean,
    isSpilling: boolean,
    waterCarried: number,
    leftHandItem?: LeftHandItem,
    leftActionCounter?: number
  ) => void;
  onPourWater: (amount: number) => void;
  onCompleteTrip: () => void;
  onZoneChange: (zones: {
    inSpring: boolean;
    nearWell: boolean;
    nearMerchant: boolean;
    offRoad: boolean;
  }) => void;
  onCutscenePhaseChange: (phase: 'none' | 'orbit' | 'snap' | 'zoom_hand' | 'proverb') => void;
  isShopOpen: boolean;
}

function createInitialBears(): BearState[] {
  const westX = -24;
  const westZ = -18;
  const eastX = 24;
  const eastZ = 24;
  return [
    {
      id: 'bear_west',
      name: 'Medvěd',
      side: 'west',
      x: westX,
      y: getTerrainHeight(westX, westZ),
      z: westZ,
      rotY: 0.4,
      hp: BEAR_MAX_HP,
      maxHp: BEAR_MAX_HP,
      lastDamagedAt: null,
      isChasing: false,
      isDead: false,
      isRegenerating: false,
    },
    {
      id: 'bear_east',
      name: 'Medvěd',
      side: 'east',
      x: eastX,
      y: getTerrainHeight(eastX, eastZ),
      z: eastZ,
      rotY: -0.6,
      hp: BEAR_MAX_HP,
      maxHp: BEAR_MAX_HP,
      lastDamagedAt: null,
      isChasing: false,
      isDead: false,
      isRegenerating: false,
    },
  ];
}

export const GameScene: React.FC<GameSceneProps> = ({
  roomState,
  localPlayerId,
  leftHandItem,
  leftActionTrigger,
  shotByRemoteCounter,
  onTriggerLeftAction,
  onSelectLeftItem,
  onShootPitcher,
  onShootBear,
  onBearAttackPlayer,
  onSpinnerRpmChange,
  onBalanceUpdate,
  onLocalPlayerMove,
  onPourWater,
  onCompleteTrip,
  onZoneChange,
  onCutscenePhaseChange,
  isShopOpen,
}) => {
  const { camera, gl } = useThree();
  const keysPressed = useRef<Record<string, boolean>>({});
  const fpRigRootRef = useRef<THREE.Group>(null);

  // Keep latest players map in a ref so rifle raycast never re-triggers on network/bot ticks!
  const playersRef = useRef<Record<string, PlayerState>>(roomState.players);
  playersRef.current = roomState.players;
  const lastProcessedShotTriggerRef = useRef<number>(0);

  // 2 Forest Bears (Synced across server when roomState.bears is present, or local fallback)
  const bearsRef = useRef<BearState[]>(createInitialBears());
  const [bearsRenderState, setBearsRenderState] = useState<BearState[]>(() =>
    createInitialBears()
  );
  const bearWaypointsRef = useRef<Record<string, { x: number; z: number }>>({
    bear_west: { x: -28, z: 22 },
    bear_east: { x: 28, z: -22 },
  });
  const bearAttackCooldownRef = useRef<number>(0);
  const bearSyncTimerRef = useRef<number>(0);

  // Sync bearsRef whenever server sends authoritative shared bears in roomState.bears
  useEffect(() => {
    if (roomState.bears) {
      const serverBears = Object.values(roomState.bears);
      bearsRef.current = serverBears;
      setBearsRenderState(serverBears);
    }
  }, [roomState.bears]);

  // First-person look angles (yaw = Math.PI faces +Z down toward the trail/valley)
  const fpYaw = useRef<number>(Math.PI);
  const fpPitch = useRef<number>(-0.08);
  const isMouseDragging = useRef<boolean>(false);

  // Local authoritative position & state
  const localPos = useRef<THREE.Vector3>(new THREE.Vector3(0, 26.0, -98));
  const localWater = useRef<number>(0);
  const hadFullLoadOnTrip = useRef<boolean>(false);
  const initializedRef = useRef<boolean>(false);

  // Jump & Bunnyhop Physics State
  const jumpOffsetRef = useRef<number>(0);
  const jumpVelRef = useRef<number>(0);
  const groundGraceTimerRef = useRef<number>(0.5);
  const bhopStreakRef = useRef<number>(0);

  // Pitcher Hand-Balance Physics State
  const balanceAngleRef = useRef<number>(0); // -1.0 (left spill) to +1.0 (right spill)
  const balanceVelRef = useRef<number>(0);
  const wanderDirRef = useRef<number>(1);
  const wanderTimerRef = useRef<number>(0);
  const straightLineTimeRef = useRef<number>(0);
  const spillCooldownRef = useRef<number>(0);
  const [balanceTiltState, setBalanceTiltState] = useState<number>(0);
  const [isSpillingState, setIsSpillingState] = useState<boolean>(false);

  // Timers for audio & network sync
  const stepTimer = useRef<number>(0);
  const dipAudioTimer = useRef<number>(0);
  const pourAudioTimer = useRef<number>(0);
  const netSyncTimer = useRef<number>(0);
  const hudBalanceTimer = useRef<number>(0);
  const pourAccumulated = useRef<number>(0);

  // Climax Cutscene state
  const cutsceneTimeRef = useRef<number>(0);
  const snapPlayedRef = useRef<boolean>(false);
  const shatterPlayedRef = useRef<boolean>(false);
  const proverbPlayedRef = useRef<boolean>(false);
  const [climaxSnapElapsed, setClimaxSnapElapsed] = useState<number | null>(null);
  const [localCutscenePhase, setLocalCutscenePhase] = useState<
    'none' | 'orbit' | 'snap' | 'zoom_hand' | 'proverb'
  >('none');

  const localPlayer: PlayerState | undefined = roomState.players[localPlayerId];
  const fractureRatio =
    roomState.wellMax > 0
      ? Math.min(1, roomState.wellCurrent / roomState.wellMax)
      : 0;

  useEffect(() => {
    if (localPlayer && !initializedRef.current) {
      localPos.current.set(localPlayer.x, localPlayer.y, localPlayer.z);
      localWater.current = localPlayer.waterCarried;
      initializedRef.current = true;
    }
  }, [localPlayer]);

  // If another player shoots our pitcher with their Rifle (or server bear hits us), drop/spill our pitcher!
  useEffect(() => {
    if (shotByRemoteCounter === 0) return;
    soundEngine.playSpillCrash();
    localWater.current = 0;
    hadFullLoadOnTrip.current = false;
    spillCooldownRef.current = 1.15;
    setIsSpillingState(true);
    balanceAngleRef.current = 0.95;
    balanceVelRef.current = 0;
    straightLineTimeRef.current = 0;
    onBalanceUpdate(0.95, true, true, false);
  }, [shotByRemoteCounter, onBalanceUpdate]);

  // Issue 5 Fix + Bear Shooting: ONLY fire raycast when `leftActionTrigger` actually increments!
  useEffect(() => {
    if (leftActionTrigger === 0 || leftActionTrigger === lastProcessedShotTriggerRef.current) {
      return;
    }
    lastProcessedShotTriggerRef.current = leftActionTrigger;

    if (leftHandItem !== 'rifle') return;

    const rayOrigin = camera.position.clone();
    const rayDir = new THREE.Vector3();
    camera.getWorldDirection(rayDir);
    rayDir.normalize();

    let closestTargetType: 'player' | 'bear' | null = null;
    let closestTargetId: string | null = null;
    let closestDist = 180; // Max rifle range 180m

    // 1. Check ray intersection with Forest Bears (larger hitbox radius 1.75m)
    for (const bear of bearsRef.current) {
      if (bear.isDead) continue;
      const bearCenter = new THREE.Vector3(bear.x, bear.y + 1.05, bear.z);
      const toBear = bearCenter.clone().sub(rayOrigin);
      const proj = toBear.dot(rayDir);
      if (proj < 0.5 || proj > closestDist) continue;

      const closestPoint = rayOrigin.clone().addScaledVector(rayDir, proj);
      const perpDist = closestPoint.distanceTo(bearCenter);

      if (perpDist <= 1.75) {
        closestDist = proj;
        closestTargetType = 'bear';
        closestTargetId = bear.id;
      }
    }

    // 2. Check ray intersection with other Players / Bots
    for (const p of Object.values(playersRef.current)) {
      if (p.id === localPlayerId) continue;

      const targetCenter = new THREE.Vector3(p.x, p.y + 1.15, p.z);
      const toTarget = targetCenter.clone().sub(rayOrigin);
      const proj = toTarget.dot(rayDir);
      if (proj < 0.5 || proj > closestDist) continue;

      const closestPoint = rayOrigin.clone().addScaledVector(rayDir, proj);
      const perpDist = closestPoint.distanceTo(targetCenter);

      if (perpDist <= 1.05) {
        closestDist = proj;
        closestTargetType = 'player';
        closestTargetId = p.id;
      }
    }

    if (closestTargetType === 'bear' && closestTargetId) {
      if (roomState.bears) {
        onShootBear(closestTargetId as 'bear_west' | 'bear_east');
      } else {
        const hitBear = bearsRef.current.find((b) => b.id === closestTargetId);
        if (hitBear && !hitBear.isDead) {
          const now = Date.now();
          if (hitBear.hp >= hitBear.maxHp || hitBear.lastDamagedAt === null) {
            hitBear.lastDamagedAt = now;
          }
          hitBear.isRegenerating = false;
          hitBear.hp = Math.max(0, Math.round(hitBear.hp - 1));

          if (hitBear.hp <= 0) {
            hitBear.hp = 0;
            hitBear.isDead = true;
            hitBear.isChasing = false;
            soundEngine.playBearHit(true);
          } else {
            soundEngine.playBearHit(false);
          }
          setBearsRenderState(bearsRef.current.map((b) => ({ ...b })));
        }
      }
    } else if (closestTargetType === 'player' && closestTargetId) {
      onShootPitcher(closestTargetId);
    }
  }, [
    leftActionTrigger,
    leftHandItem,
    camera,
    localPlayerId,
    onShootPitcher,
    onShootBear,
    roomState.bears,
  ]);

  // Reset cutscene, bears & balance on game reset
  useEffect(() => {
    if (!roomState.climaxTriggered) {
      cutsceneTimeRef.current = 0;
      snapPlayedRef.current = false;
      shatterPlayedRef.current = false;
      proverbPlayedRef.current = false;
      setClimaxSnapElapsed(null);
      setLocalCutscenePhase('none');
      onCutscenePhaseChange('none');
      soundEngine.restoreAmbient();
      balanceAngleRef.current = 0;
      balanceVelRef.current = 0;
      jumpOffsetRef.current = 0;
      jumpVelRef.current = 0;
      bhopStreakRef.current = 0;
      if (!roomState.bears) {
        const freshBears = createInitialBears();
        bearsRef.current = freshBears;
        setBearsRenderState(freshBears.map((b) => ({ ...b })));
      }
      if (localPlayer) {
        localWater.current = localPlayer.waterCarried;
      }
    } else {
      soundEngine.init();
      soundEngine.muteAmbientImmediately();
      setLocalCutscenePhase('orbit');
      onCutscenePhaseChange('orbit');
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  }, [roomState.climaxTriggered]);

  // Keyboard & First-Person Mouse Look / Left-Hand Action Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;
      soundEngine.init();

      if (roomState.climaxTriggered || isShopOpen) return;

      if (e.code === 'Digit1') onSelectLeftItem('cigarette');
      if (e.code === 'Digit2') onSelectLeftItem('knife');
      if (e.code === 'Digit3') onSelectLeftItem('spinner');
      if (e.code === 'Digit4') onSelectLeftItem('beer');
      if (e.code === 'Digit5') onSelectLeftItem('rifle');
      if (e.code === 'Digit6') onSelectLeftItem('polish');

      if ((e.code === 'KeyR' || e.code === 'KeyQ') && !e.repeat) {
        onTriggerLeftAction();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (isShopOpen || roomState.climaxTriggered) return;
      soundEngine.init();

      const target = e.target as HTMLElement;
      if (target && target.tagName === 'CANVAS') {
        isMouseDragging.current = true;
        if (document.pointerLockElement !== gl.domElement) {
          gl.domElement.requestPointerLock?.();
        } else if (e.button === 0) {
          onTriggerLeftAction();
        }
      }
    };

    const onMouseUp = () => {
      isMouseDragging.current = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (roomState.climaxTriggered || isShopOpen) return;
      if (document.pointerLockElement === gl.domElement || isMouseDragging.current) {
        fpYaw.current -= e.movementX * 0.0032;
        fpPitch.current = Math.max(
          -1.15,
          Math.min(1.05, fpPitch.current - e.movementY * 0.0028)
        );
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [
    gl.domElement,
    isShopOpen,
    roomState.climaxTriggered,
    onSelectLeftItem,
    onTriggerLeftAction,
  ]);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(0.1, rawDelta);
    const t = clock.getElapsedTime();
    if (!localPlayer) return;

    // =========================================================================
    // FIRST-PERSON CLIMAX CUTSCENE SEQUENCE
    // =========================================================================
    if (roomState.climaxTriggered) {
      cutsceneTimeRef.current += delta;
      const ct = cutsceneTimeRef.current;

      if (ct >= 1.2) {
        if (!snapPlayedRef.current) {
          snapPlayedRef.current = true;
          soundEngine.playHandleSnap();
          setLocalCutscenePhase('snap');
          onCutscenePhaseChange('snap');
        }
        const snapElapsed = (ct - 1.2) * 0.78;
        setClimaxSnapElapsed(snapElapsed);

        if (snapElapsed >= 0.55 && !shatterPlayedRef.current) {
          shatterPlayedRef.current = true;
          soundEngine.playPitcherShatter();
        }
      }

      if (ct >= 2.35 && ct < 3.7) {
        setLocalCutscenePhase('zoom_hand');
        onCutscenePhaseChange('zoom_hand');
      } else if (ct >= 3.7 && !proverbPlayedRef.current) {
        proverbPlayedRef.current = true;
        soundEngine.playProverbChord();
        setLocalCutscenePhase('proverb');
        onCutscenePhaseChange('proverb');
      }

      const eyeY = localPos.current.y + 1.66;
      let shakeX = 0;
      let shakeY = 0;
      const snapEl = ct >= 1.2 ? (ct - 1.2) * 0.78 : 0;
      if (snapEl >= 0.55 && snapEl <= 1.25) {
        const decay = Math.exp(-(snapEl - 0.55) * 6);
        shakeX = Math.sin(t * 65) * 0.065 * decay;
        shakeY = Math.cos(t * 58) * 0.065 * decay;
      }

      camera.position.set(
        localPos.current.x + shakeX,
        eyeY + shakeY,
        localPos.current.z
      );

      const desiredPitch = ct < 1.2 ? -0.18 : ct < 2.35 ? -0.42 : -0.12;
      fpPitch.current = THREE.MathUtils.lerp(
        fpPitch.current,
        desiredPitch,
        Math.min(1, delta * 4)
      );

      const euler = new THREE.Euler(fpPitch.current, fpYaw.current, shakeX * 0.8, 'YXZ');
      camera.quaternion.setFromEuler(euler);

      // Synchronously lock First-Person Rig to camera in the exact same frame!
      if (fpRigRootRef.current) {
        fpRigRootRef.current.position.copy(camera.position);
        fpRigRootRef.current.quaternion.copy(camera.quaternion);
        fpRigRootRef.current.updateMatrixWorld(true);
      }
      return;
    }

    // =========================================================================
    // ACTIVE FIRST-PERSON GAMEPLAY LOOP
    // =========================================================================
    const keys = keysPressed.current;

    if (keys['ArrowLeft']) fpYaw.current += 1.9 * delta;
    if (keys['ArrowRight']) fpYaw.current -= 1.9 * delta;

    let moveForward = 0;
    let moveRight = 0;
    if (!isShopOpen) {
      if (keys['KeyW'] || keys['ArrowUp']) moveForward += 1;
      if (keys['KeyS'] || keys['ArrowDown']) moveForward -= 1;
      if (keys['KeyD']) moveRight += 1;
      if (keys['KeyA']) moveRight -= 1;
    }

    const isShiftHeld = Boolean(keys['ShiftLeft']) || Boolean(keys['ShiftRight']);
    const isSprinting = isShiftHeld && (moveForward !== 0 || moveRight !== 0);

    const inSpring = isInSpringWater(localPos.current.x, localPos.current.z);
    const nearWell = isNearWell(localPos.current.x, localPos.current.z);
    const nearMerchant = isNearMerchant(localPos.current.x, localPos.current.z);
    const offRoad = !isOnRoad(localPos.current.x, localPos.current.z);

    onZoneChange({ inSpring, nearWell, nearMerchant, offRoad });

    const interactHeld = !isShopOpen && Boolean(keys['KeyE']);
    const jumpHeld = !isShopOpen && Boolean(keys['Space']);

    // 1. Refilling Pitcher at the Valley Spring ([E])
    let isFilling = false;
    if (inSpring && interactHeld && localWater.current < localPlayer.waterCapacity) {
      isFilling = true;
      const fillRate = getFlowRatePerSecond(
        localPlayer.upgrades.flowTier,
        localPlayer.waterCapacity
      );
      localWater.current = Math.min(
        localPlayer.waterCapacity,
        localWater.current + fillRate * delta
      );
      if (localWater.current >= 5) {
        hadFullLoadOnTrip.current = true;
      }

      balanceAngleRef.current *= 0.85;
      balanceVelRef.current = 0;

      dipAudioTimer.current += delta;
      if (dipAudioTimer.current >= 0.13) {
        dipAudioTimer.current = 0;
        soundEngine.playWaterDipTick(localWater.current / localPlayer.waterCapacity);
      }
    }

    // 2. Pouring Water into the Hilltop Well (with accurate trip & score flushing!)
    let isPouring = false;
    if (nearWell && interactHeld && localWater.current > 0) {
      isPouring = true;
      balanceAngleRef.current *= 0.85;
      balanceVelRef.current = 0;

      const pourRate = getFlowRatePerSecond(
        localPlayer.upgrades.flowTier,
        localPlayer.waterCapacity
      );
      const stepPour = Math.min(localWater.current, pourRate * delta);
      localWater.current = Math.max(0, localWater.current - stepPour);
      pourAccumulated.current += stepPour;

      const remainingWellRoom = Math.max(
        0,
        roomState.wellMax - roomState.wellCurrent
      );
      const willFinishWell = pourAccumulated.current >= remainingWellRoom;

      if (
        pourAccumulated.current >= 2.5 ||
        localWater.current <= 0.01 ||
        willFinishWell
      ) {
        const sendAmt = Math.round(pourAccumulated.current * 10) / 10;
        pourAccumulated.current = 0;
        if (sendAmt > 0) {
          onPourWater(sendAmt);
        }
      }

      if (
        (localWater.current <= 0.02 || willFinishWell) &&
        hadFullLoadOnTrip.current
      ) {
        hadFullLoadOnTrip.current = false;
        soundEngine.playCoinChime(false);
        onCompleteTrip();
      }

      pourAudioTimer.current += delta;
      if (pourAudioTimer.current >= 0.12) {
        pourAudioTimer.current = 0;
        soundEngine.playWaterPourTick();
      }
    } else if (pourAccumulated.current > 0) {
      // Flush any residual poured water when releasing [E]
      const sendAmt = Math.round(pourAccumulated.current * 10) / 10;
      pourAccumulated.current = 0;
      if (sendAmt > 0) {
        onPourWater(sendAmt);
      }
    }

    // 3. Walking vs Sprinting, Jumping & Bunnyhops, and Pitcher Hand-Balancing
    let isMoving = false;
    if (spillCooldownRef.current > 0) {
      spillCooldownRef.current = Math.max(0, spillCooldownRef.current - delta);
      if (spillCooldownRef.current <= 0) {
        setIsSpillingState(false);
        balanceAngleRef.current = 0;
        balanceVelRef.current = 0;
      }
    }

    const hasWaterInPitcher = localWater.current > 0.1;
    const fillRatio =
      localPlayer.waterCapacity > 0
        ? Math.min(1, localWater.current / localPlayer.waterCapacity)
        : 0;
    const balanceLvl = localPlayer.upgrades.balanceTier ?? 0;
    const upgradeStabilityFactor = Math.max(0.22, 1 - balanceLvl * 0.16);

    // -------------------------------------------------------------------------
    // JUMP & BUNNYHOP PHYSICS ([Space]) — Hits Pitcher Balance Pretty Hard!
    // -------------------------------------------------------------------------
    const isOnGround = jumpOffsetRef.current <= 0.001 && jumpVelRef.current <= 0;
    const hasMoveInput =
      (moveForward !== 0 || moveRight !== 0) &&
      !isFilling &&
      !isPouring &&
      spillCooldownRef.current <= 0;

    if (isOnGround) {
      groundGraceTimerRef.current += delta;
      if (groundGraceTimerRef.current > 0.24 || !hasMoveInput) {
        bhopStreakRef.current = 0;
      }

      if (jumpHeld && !isFilling && !isPouring && spillCooldownRef.current <= 0) {
        if (groundGraceTimerRef.current <= 0.24 && hasMoveInput) {
          bhopStreakRef.current = Math.min(6, bhopStreakRef.current + 1);
        } else {
          bhopStreakRef.current = 0;
        }
        groundGraceTimerRef.current = 0;
        jumpVelRef.current = 8.2;
        soundEngine.playJump(bhopStreakRef.current > 0);

        // Jumping & Bunnyhopping hits the pitcher balance hard!
        if (hasWaterInPitcher) {
          const joltDir =
            Math.abs(balanceAngleRef.current) > 0.08
              ? Math.sign(balanceAngleRef.current)
              : Math.random() < 0.5
              ? -1
              : 1;
          const jumpTiltImpulse =
            (0.26 + bhopStreakRef.current * 0.16) *
            (0.5 + fillRatio * 0.5) *
            upgradeStabilityFactor;
          balanceAngleRef.current += joltDir * jumpTiltImpulse;
          balanceVelRef.current +=
            joltDir *
            (1.1 + bhopStreakRef.current * 0.55) *
            fillRatio *
            upgradeStabilityFactor;
        }
      }
    }

    if (jumpOffsetRef.current > 0 || jumpVelRef.current > 0) {
      jumpOffsetRef.current += jumpVelRef.current * delta;
      jumpVelRef.current -= 24.5 * delta;
      if (jumpOffsetRef.current <= 0) {
        jumpOffsetRef.current = 0;
        jumpVelRef.current = 0;
        groundGraceTimerRef.current = 0;

        // Landing impact shock on pitcher balance
        if (hasWaterInPitcher && spillCooldownRef.current <= 0) {
          const landDir =
            Math.abs(balanceAngleRef.current) > 0.05
              ? Math.sign(balanceAngleRef.current)
              : Math.random() < 0.5
              ? -1
              : 1;
          balanceAngleRef.current +=
            landDir *
            (0.12 + bhopStreakRef.current * 0.1) *
            fillRatio *
            upgradeStabilityFactor;
        }
      }
    }

    const isAirborne = jumpOffsetRef.current > 0.01;

    if (hasMoveInput) {
      isMoving = true;
      const inputLen = Math.hypot(moveForward, moveRight);
      const normF = moveForward / inputLen;
      const normR = moveRight / inputLen;

      const forwardX = -Math.sin(fpYaw.current);
      const forwardZ = -Math.cos(fpYaw.current);
      const rightX = Math.cos(fpYaw.current);
      const rightZ = -Math.sin(fpYaw.current);

      const dirX = forwardX * normF + rightX * normR;
      const dirZ = forwardZ * normF + rightZ * normR;

      const baseSpeed = isSprinting ? 10.5 : 4.6;
      const speedMult = getMoveSpeedMultiplier(
        localWater.current,
        localPlayer.waterCapacity,
        localPlayer.upgrades.bootsTier
      );
      const bhopSpeedMult = 1 + bhopStreakRef.current * 0.14;

      const currentGroundY = getTerrainHeight(localPos.current.x, localPos.current.z);
      const probeY = getTerrainHeight(
        localPos.current.x + dirX * 1.0,
        localPos.current.z + dirZ * 1.0
      );
      const slopeDelta = probeY - currentGroundY;
      const slopeFactor = slopeDelta > 0.05 ? 0.88 : slopeDelta < -0.05 ? 1.08 : 1.0;

      const finalSpeed = baseSpeed * speedMult * slopeFactor * bhopSpeedMult;
      let nextX = localPos.current.x + dirX * finalSpeed * delta;
      let nextZ = localPos.current.z + dirZ * finalSpeed * delta;

      nextX = Math.max(-58, Math.min(58, nextX));
      nextZ = Math.max(-130, Math.min(130, nextZ));

      // Collide with Hilltop Well
      const dWell = Math.hypot(nextX - WORLD_LOCATIONS.WELL.x, nextZ - WORLD_LOCATIONS.WELL.z);
      if (dWell < WORLD_LOCATIONS.WELL.radius) {
        const pushAngle = Math.atan2(
          nextZ - WORLD_LOCATIONS.WELL.z,
          nextX - WORLD_LOCATIONS.WELL.x
        );
        nextX = WORLD_LOCATIONS.WELL.x + Math.cos(pushAngle) * WORLD_LOCATIONS.WELL.radius;
        nextZ = WORLD_LOCATIONS.WELL.z + Math.sin(pushAngle) * WORLD_LOCATIONS.WELL.radius;
      }

      // Collide with Merchant Cart
      const dMerch = Math.hypot(
        nextX - WORLD_LOCATIONS.MERCHANT.x,
        nextZ - WORLD_LOCATIONS.MERCHANT.z
      );
      if (dMerch < WORLD_LOCATIONS.MERCHANT.radius) {
        const pushAngle = Math.atan2(
          nextZ - WORLD_LOCATIONS.MERCHANT.z,
          nextX - WORLD_LOCATIONS.MERCHANT.x
        );
        nextX =
          WORLD_LOCATIONS.MERCHANT.x + Math.cos(pushAngle) * WORLD_LOCATIONS.MERCHANT.radius;
        nextZ =
          WORLD_LOCATIONS.MERCHANT.z + Math.sin(pushAngle) * WORLD_LOCATIONS.MERCHANT.radius;
      }

      // Collide with nearby Tree Trunks
      for (const tree of WORLD_PROPS.trees) {
        const dt = Math.hypot(nextX - tree.x, nextZ - tree.z);
        const minDist = tree.trunkRadius + 0.35;
        if (dt < minDist) {
          const pushAngle = Math.atan2(nextZ - tree.z, nextX - tree.x);
          nextX = tree.x + Math.cos(pushAngle) * minDist;
          nextZ = tree.z + Math.sin(pushAngle) * minDist;
        }
      }

      const nextGroundY = getTerrainHeight(nextX, nextZ);
      localPos.current.set(nextX, nextGroundY + jumpOffsetRef.current, nextZ);

      if (!isAirborne) {
        stepTimer.current += delta * speedMult * (isSprinting ? 1.35 : 0.72);
        if (stepTimer.current >= 0.34) {
          stepTimer.current = 0;
          soundEngine.playFootstep(inSpring, fillRatio, fractureRatio);
        }
      }
    } else {
      const groundY = getTerrainHeight(localPos.current.x, localPos.current.z);
      localPos.current.y = groundY + jumpOffsetRef.current;
    }

    // -------------------------------------------------------------------------
    // PITCHER HAND-BALANCE SIMULATION (Active ONLY while sprinting or airborne!)
    // Stopping running or walking on the ground immediately stabilizes the pitcher!
    // -------------------------------------------------------------------------
    const balanceActive =
      hasWaterInPitcher &&
      spillCooldownRef.current <= 0 &&
      (isSprinting || isAirborne);

    // Check if jump/landing impulse crossed spill threshold
    if (
      hasWaterInPitcher &&
      spillCooldownRef.current <= 0 &&
      Math.abs(balanceAngleRef.current) >= 1.0
    ) {
      soundEngine.playSpillCrash();
      localWater.current = 0;
      hadFullLoadOnTrip.current = false;
      spillCooldownRef.current = 1.15;
      setIsSpillingState(true);
      balanceAngleRef.current = Math.sign(balanceAngleRef.current) * 0.95;
      balanceVelRef.current = 0;
      straightLineTimeRef.current = 0;
      bhopStreakRef.current = 0;
      onBalanceUpdate(balanceAngleRef.current, true, true, isSprinting);
    } else if (!balanceActive && spillCooldownRef.current <= 0) {
      straightLineTimeRef.current = 0;
      balanceVelRef.current = 0;
      balanceAngleRef.current = THREE.MathUtils.lerp(
        balanceAngleRef.current,
        0,
        Math.min(1, delta * 6.5)
      );
    } else if (balanceActive) {
      const towerHeightFactor =
        1 +
        localPlayer.upgrades.clayTier * 0.14 +
        localPlayer.upgrades.ironTier * 0.22 +
        localPlayer.upgrades.funnelTier * 0.34;

      // ~30% harder balancing while sprinting/jumping!
      const fullnessDifficulty = 0.55 + Math.pow(fillRatio, 1.25) * 1.55;

      wanderTimerRef.current += delta;
      if (wanderTimerRef.current > 1.1) {
        wanderTimerRef.current = 0;
        if (Math.abs(balanceAngleRef.current) < 0.2) {
          wanderDirRef.current = Math.random() < 0.5 ? -1 : 1;
        } else {
          wanderDirRef.current = Math.sign(balanceAngleRef.current);
        }
      }

      if (moveRight === 0) {
        straightLineTimeRef.current += delta;
      } else {
        straightLineTimeRef.current = Math.max(
          0,
          straightLineTimeRef.current - delta * 2.5
        );
      }

      const sprintRamp = Math.min(1, straightLineTimeRef.current / 0.35);
      const straightPenalty = 0.65 + sprintRamp * Math.min(2.1, straightLineTimeRef.current * 0.78);
      const bhopInstability = 1 + bhopStreakRef.current * 0.35 + (isAirborne ? 0.38 : 0);

      const gravityTorque =
        Math.sin(balanceAngleRef.current * 1.32) *
        1.42 *
        towerHeightFactor *
        fullnessDifficulty *
        bhopInstability *
        upgradeStabilityFactor;
      const stepPerturbation =
        wanderDirRef.current *
        0.58 *
        straightPenalty *
        fullnessDifficulty *
        bhopInstability *
        upgradeStabilityFactor;

      // Reversed [A]/[D] counter-balancing movements (A and D swapped!)
      const playerCorrection = -moveRight * (3.05 + balanceLvl * 0.45);

      balanceVelRef.current +=
        (gravityTorque + stepPerturbation + playerCorrection) * delta;
      balanceVelRef.current *= Math.pow(0.22, delta);
      balanceAngleRef.current += balanceVelRef.current * delta;

      if (Math.abs(balanceAngleRef.current) >= 1.0) {
        soundEngine.playSpillCrash();
        localWater.current = 0;
        hadFullLoadOnTrip.current = false;
        spillCooldownRef.current = 1.15;
        setIsSpillingState(true);
        balanceAngleRef.current = Math.sign(balanceAngleRef.current) * 0.95;
        balanceVelRef.current = 0;
        straightLineTimeRef.current = 0;
        bhopStreakRef.current = 0;
        onBalanceUpdate(balanceAngleRef.current, true, true, isSprinting);
      }
    }

    // =========================================================================
    // 3B. FOREST BEARS AI LOOP & HIT DETECTION
    // =========================================================================
    if (bearAttackCooldownRef.current > 0) {
      bearAttackCooldownRef.current = Math.max(0, bearAttackCooldownRef.current - delta);
    }

    if (roomState.bears) {
      // Online mode: server drives bear movement, client also checks immediate hit & roar!
      for (const bear of bearsRef.current) {
        if (bear.isDead) continue;
        const distToLocal = Math.hypot(
          localPos.current.x - bear.x,
          localPos.current.z - bear.z
        );
        if (distToLocal <= 2.35 && bearAttackCooldownRef.current <= 0) {
          bearAttackCooldownRef.current = 2.2;
          localWater.current = 0;
          hadFullLoadOnTrip.current = false;
          spillCooldownRef.current = 1.15;
          setIsSpillingState(true);
          balanceAngleRef.current = 0.95;
          balanceVelRef.current = 0;
          straightLineTimeRef.current = 0;
          onBalanceUpdate(0.95, true, true, isSprinting);
          onBearAttackPlayer();
        }
      }
    } else {
      const playerForestSide = getForestSide(localPos.current.x, localPos.current.z);
      const nowMs = Date.now();

      for (const bear of bearsRef.current) {
        if (bear.isDead) continue;

        // 1-Minute Regeneration Rule: After 60s since first shot, regenerate HP back to 100%!
        if (bear.hp < bear.maxHp && bear.lastDamagedAt !== null) {
          if (nowMs - bear.lastDamagedAt >= BEAR_REGEN_DELAY_MS) {
            bear.isRegenerating = true;
            bear.hp = Math.min(bear.maxHp, bear.hp + delta * 2.5);
            if (bear.hp >= bear.maxHp) {
              bear.hp = bear.maxHp;
              bear.isRegenerating = false;
              bear.lastDamagedAt = null;
            }
          }
        }

        // Check if player stepped off the road into THIS bear's side of the forest
        const distToPlayer = Math.hypot(
          localPos.current.x - bear.x,
          localPos.current.z - bear.z
        );
        const canSeePlayerOffRoad =
          playerForestSide === bear.side && distToPlayer <= 110;

        if (canSeePlayerOffRoad) {
          if (!bear.isChasing) {
            bear.isChasing = true;
            soundEngine.playBearRoar();
          }

          // Run towards the player (~30% faster!)
          const dx = localPos.current.x - bear.x;
          const dz = localPos.current.z - bear.z;
          const len = Math.hypot(dx, dz) || 1;
          const chaseSpeed = 11.6;
          bear.rotY = Math.atan2(dx, dz);
          bear.x += (dx / len) * chaseSpeed * delta;
          bear.z += (dz / len) * chaseSpeed * delta;
          bear.y = getTerrainHeight(bear.x, bear.z);

          // Hit the player if close enough -> spill water AND drop all bullets!
          const newDist = Math.hypot(
            localPos.current.x - bear.x,
            localPos.current.z - bear.z
          );
          if (newDist <= 2.35 && bearAttackCooldownRef.current <= 0) {
            bearAttackCooldownRef.current = 2.2;
            localWater.current = 0;
            hadFullLoadOnTrip.current = false;
            spillCooldownRef.current = 1.15;
            setIsSpillingState(true);
            balanceAngleRef.current = 0.95;
            balanceVelRef.current = 0;
            straightLineTimeRef.current = 0;
            onBalanceUpdate(0.95, true, true, isSprinting);
            onBearAttackPlayer();

            // Step back slightly after striking
            bear.x -= (dx / len) * 2.2;
            bear.z -= (dz / len) * 2.2;
            bear.y = getTerrainHeight(bear.x, bear.z);
          }
        } else {
          // Player is on the road (or on the other side): stop chasing & walk around the forest!
          if (bear.isChasing) {
            bear.isChasing = false;
          }

          let wp = bearWaypointsRef.current[bear.id];
          const distToWp = wp ? Math.hypot(wp.x - bear.x, wp.z - bear.z) : 0;

          if (!wp || distToWp < 2.5) {
            const nextZ = -70 + Math.random() * 150;
            const roadCenterAtZ = getPathCenterX(nextZ);
            const forestOffset = 11 + Math.random() * 24;
            const nextX =
              bear.side === 'west'
                ? roadCenterAtZ - forestOffset
                : roadCenterAtZ + forestOffset;
            wp = {
              x: Math.max(-52, Math.min(52, nextX)),
              z: nextZ,
            };
            bearWaypointsRef.current[bear.id] = wp;
          }

          const dx = wp.x - bear.x;
          const dz = wp.z - bear.z;
          const len = Math.hypot(dx, dz) || 1;
          const walkSpeed = 4.2; // ~30% faster forest walk speed!
          bear.rotY = Math.atan2(dx, dz);
          let nextBearX = bear.x + (dx / len) * walkSpeed * delta;
          const nextBearZ = bear.z + (dz / len) * walkSpeed * delta;

          // Keep patrolling bear strictly inside its forest side off the road
          const roadCenter = getPathCenterX(nextBearZ);
          if (bear.side === 'west' && nextBearX > roadCenter - 7.5) {
            nextBearX = roadCenter - 7.5;
          } else if (bear.side === 'east' && nextBearX < roadCenter + 7.5) {
            nextBearX = roadCenter + 7.5;
          }

          bear.x = nextBearX;
          bear.z = nextBearZ;
          bear.y = getTerrainHeight(bear.x, bear.z);
        }
      }

      bearSyncTimerRef.current += delta;
      if (bearSyncTimerRef.current >= 0.05) {
        bearSyncTimerRef.current = 0;
        setBearsRenderState(bearsRef.current.map((b) => ({ ...b })));
      }
    }

    setBalanceTiltState(balanceAngleRef.current);

    hudBalanceTimer.current += delta;
    if (hudBalanceTimer.current >= 0.05) {
      hudBalanceTimer.current = 0;
      onBalanceUpdate(
        balanceAngleRef.current,
        hasWaterInPitcher && Math.abs(balanceAngleRef.current) >= 0.62,
        spillCooldownRef.current > 0,
        isSprinting || isAirborne || bhopStreakRef.current > 0
      );
    }

    localPlayer.x = localPos.current.x;
    localPlayer.y = localPos.current.y;
    localPlayer.z = localPos.current.z;
    localPlayer.rotY = fpYaw.current + Math.PI;
    localPlayer.isMoving = isMoving;
    localPlayer.isFilling = isFilling;
    localPlayer.isPouring = isPouring;
    localPlayer.isSpilling = spillCooldownRef.current > 0;
    localPlayer.leftHandItem = leftHandItem;
    localPlayer.leftActionCounter = leftActionTrigger;
    localPlayer.waterCarried = localWater.current;

    netSyncTimer.current += delta;
    if (netSyncTimer.current >= 0.05) {
      netSyncTimer.current = 0;
      onLocalPlayerMove(
        localPos.current.x,
        localPos.current.y,
        localPos.current.z,
        fpYaw.current + Math.PI,
        isMoving,
        isFilling,
        isPouring,
        spillCooldownRef.current > 0,
        localWater.current,
        leftHandItem,
        leftActionTrigger
      );
    }

    // 4. Strictly First-Person Camera Transform + Synchronous Viewmodel Lock!
    const bobFreq = isSprinting ? 11.0 : 6.2;
    const bobAmp = isSprinting ? 0.058 : 0.026;
    const headBobY = isMoving
      ? Math.abs(Math.sin(t * bobFreq)) * bobAmp
      : Math.sin(t * 1.8) * 0.006;
    const headBobX = isMoving ? Math.cos(t * (bobFreq * 0.5)) * (bobAmp * 0.45) : 0;
    const eyeHeight = 1.68 + headBobY;

    camera.position.set(
      localPos.current.x + headBobX,
      localPos.current.y + eyeHeight,
      localPos.current.z
    );

    const cameraRoll = -balanceAngleRef.current * 0.045;
    const euler = new THREE.Euler(fpPitch.current, fpYaw.current, cameraRoll, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Issue 2 Fix: Lock FirstPersonRig directly to the newly updated camera transform in the SAME frame!
    if (fpRigRootRef.current) {
      fpRigRootRef.current.position.copy(camera.position);
      fpRigRootRef.current.quaternion.copy(camera.quaternion);
      fpRigRootRef.current.updateMatrixWorld(true);
    }
  });

  return (
    <>
      <color attach="background" args={['#e8d5b7']} />
      <fog attach="fog" args={['#e8d5b7', 35, 165]} />

      <ambientLight intensity={0.62} color="#ffeed6" />
      <hemisphereLight args={['#fff5e4', '#5c704c', 0.55]} />
      <directionalLight
        castShadow
        position={[45, 72, 25]}
        intensity={1.65}
        color="#fff0d4"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={5}
        shadow-camera-far={240}
        shadow-camera-left={-75}
        shadow-camera-right={75}
        shadow-camera-top={130}
        shadow-camera-bottom={-130}
        shadow-bias={-0.0005}
      />

      <WorldEnvironment wellFillRatio={fractureRatio} />

      {bearsRenderState.map((bear) => (
        <BearModel key={bear.id} bear={bear} />
      ))}

      {localPlayer && (
        <FirstPersonRig
          rigRootRef={fpRigRootRef}
          player={localPlayer}
          fractureRatio={fractureRatio}
          balanceTilt={balanceTiltState}
          isSpilling={isSpillingState}
          leftHandItem={leftHandItem}
          leftActionTrigger={leftActionTrigger}
          climaxSnapElapsed={climaxSnapElapsed}
          cutscenePhase={localCutscenePhase}
          onSpinnerRpmChange={onSpinnerRpmChange}
        />
      )}

      {Object.values(roomState.players)
        .filter((p) => p.id !== localPlayerId)
        .map((player) => (
          <CharacterModel
            key={player.id}
            player={player}
            isLocal={false}
            fractureRatio={fractureRatio}
            climaxSnapElapsed={roomState.climaxTriggered ? climaxSnapElapsed : null}
          />
        ))}
    </>
  );
};
