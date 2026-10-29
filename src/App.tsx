import React, { useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { GameScene } from './components/GameScene';
import { GameHUD } from './components/GameHUD';
import { LeftHandItem } from './components/FirstPersonRig';
import { useGameSession } from './network/useGameSession';
import { soundEngine } from './audio/SoundEngine';

export const App: React.FC = () => {
  const {
    connectedMode,
    localPlayerId,
    roomState,
    botsEnabled,
    setBotsEnabled,
    shotByRemoteCounter,
    connectToRoom,
    sendLocalMove,
    useBullet,
    onBearAttackPlayer,
    shootPitcher,
    shootBear,
    pourWater,
    completeTrip,
    buyUpgrade,
    setWellTarget,
    resetGame,
  } = useGameSession();

  const [zones, setZones] = useState({
    inSpring: false,
    nearWell: false,
    nearMerchant: false,
    offRoad: false,
  });

  const [cutscenePhase, setCutscenePhase] = useState<
    'none' | 'orbit' | 'snap' | 'zoom_hand' | 'proverb'
  >('none');

  const [isShopOpen, setIsShopOpen] = useState(false);

  // Left-Hand Item & Action State
  const [leftHandItem, setLeftHandItem] = useState<LeftHandItem>('cigarette');
  const [leftActionTrigger, setLeftActionTrigger] = useState<number>(0);
  const [spinnerRpm, setSpinnerRpm] = useState<number>(0);

  // Pitcher Hand-Balance State
  const [balanceInfo, setBalanceInfo] = useState({
    tilt: 0,
    isDanger: false,
    spilledRecently: false,
    isSprinting: false,
  });

  const localPlayer = roomState.players[localPlayerId];

  const handleSelectLeftItem = useCallback(
    (item: LeftHandItem) => {
      if (item === 'rifle') {
        const ownsRifle = (localPlayer?.upgrades.rifleUnlock ?? 0) > 0;
        if (!ownsRifle) {
          return;
        }
      }
      setLeftHandItem(item);
    },
    [localPlayer]
  );

  const handleTriggerLeftAction = useCallback(() => {
    if (leftHandItem === 'rifle') {
      const currentAmmo = localPlayer?.ammo ?? 0;
      if (currentAmmo <= 0) {
        soundEngine.playEmptyClick();
        return;
      }
      useBullet();
      soundEngine.playRifleShot();
      setLeftActionTrigger((prev) => prev + 1);
      return;
    }

    setLeftActionTrigger((prev) => prev + 1);
    if (leftHandItem === 'cigarette') {
      soundEngine.playCigarettePuff();
    } else if (leftHandItem === 'knife') {
      soundEngine.playKnifeTrick();
    } else if (leftHandItem === 'spinner') {
      soundEngine.playSpinnerFlick();
    } else if (leftHandItem === 'beer') {
      soundEngine.playBeerDrink();
    } else if (leftHandItem === 'polish') {
      soundEngine.playPolishAndPiss();
    }
  }, [leftHandItem, localPlayer, useBullet]);

  const handleBalanceUpdate = useCallback(
    (
      tilt: number,
      isDanger: boolean,
      spilledRecently: boolean,
      isSprinting: boolean
    ) => {
      setBalanceInfo({ tilt, isDanger, spilledRecently, isSprinting });
    },
    []
  );

  const handleZoneChange = useCallback(
    (next: {
      inSpring: boolean;
      nearWell: boolean;
      nearMerchant: boolean;
      offRoad: boolean;
    }) => {
      setZones((prev) => {
        if (
          prev.inSpring === next.inSpring &&
          prev.nearWell === next.nearWell &&
          prev.nearMerchant === next.nearMerchant &&
          prev.offRoad === next.offRoad
        ) {
          return prev;
        }
        return next;
      });
    },
    []
  );

  const handleCutscenePhaseChange = useCallback(
    (phase: 'none' | 'orbit' | 'snap' | 'zoom_hand' | 'proverb') => {
      setCutscenePhase((prev) => (prev === phase ? prev : phase));
    },
    []
  );

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeInProverb {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* 3D React Three Fiber First-Person Canvas */}
      <Canvas
        shadows
        camera={{ fov: 62, near: 0.08, far: 260, position: [0, 27.6, -98] }}
        gl={{ antialias: true }}
      >
        <GameScene
          roomState={roomState}
          localPlayerId={localPlayerId}
          leftHandItem={leftHandItem}
          leftActionTrigger={leftActionTrigger}
          shotByRemoteCounter={shotByRemoteCounter}
          onTriggerLeftAction={handleTriggerLeftAction}
          onSelectLeftItem={handleSelectLeftItem}
          onShootPitcher={shootPitcher}
          onShootBear={shootBear}
          onBearAttackPlayer={onBearAttackPlayer}
          onSpinnerRpmChange={setSpinnerRpm}
          onBalanceUpdate={handleBalanceUpdate}
          onLocalPlayerMove={sendLocalMove}
          onPourWater={pourWater}
          onCompleteTrip={completeTrip}
          onZoneChange={handleZoneChange}
          onCutscenePhaseChange={handleCutscenePhaseChange}
          isShopOpen={isShopOpen}
        />
      </Canvas>

      {/* 2D HUD, Balance Gauge, Left-Hand Item Bar, Shop & Climax Cutscene Overlay */}
      <GameHUD
        roomState={roomState}
        localPlayerId={localPlayerId}
        connectedMode={connectedMode}
        botsEnabled={botsEnabled}
        onToggleBots={setBotsEnabled}
        onJoinRoom={connectToRoom}
        onBuyUpgrade={buyUpgrade}
        onPourWater={pourWater}
        onSetWellTarget={setWellTarget}
        onResetGame={resetGame}
        zones={zones}
        cutscenePhase={cutscenePhase}
        isShopOpen={isShopOpen}
        setIsShopOpen={setIsShopOpen}
        leftHandItem={leftHandItem}
        onSelectLeftItem={handleSelectLeftItem}
        onTriggerLeftAction={handleTriggerLeftAction}
        spinnerRpm={spinnerRpm}
        balanceInfo={balanceInfo}
      />
    </div>
  );
};

export default App;
