import React, { useEffect, useState } from 'react';
import {
  Droplets,
  Coins,
  ShoppingBag,
  Users,
  Volume2,
  VolumeX,
  RotateCcw,
  Trophy,
  Footprints,
  Bot,
  Sliders,
  Flame,
  Scissors,
  Disc,
  Compass,
  Beer,
  Crosshair,
  Lock,
} from 'lucide-react';
import {
  AMMO_PER_GUN_PURCHASE,
  getMoveSpeedMultiplier,
  getUpgradeCost,
  MAX_RIFLE_AMMO,
  PlayerState,
  RoomState,
  UPGRADE_CATALOG,
  UpgradeType,
} from '../../shared/types';
import { WORLD_LOCATIONS } from '../../shared/world';
import { soundEngine } from '../audio/SoundEngine';
import { LeftHandItem } from './FirstPersonRig';

interface GameHUDProps {
  roomState: RoomState;
  localPlayerId: string;
  connectedMode: 'connecting' | 'online' | 'fallback_local';
  botsEnabled: boolean;
  onToggleBots: (enabled: boolean) => void;
  onJoinRoom: (roomId: string, name: string) => void;
  onBuyUpgrade: (upgrade: UpgradeType) => void;
  onPourWater: (amount: number) => void;
  onSetWellTarget: (target: number) => void;
  onResetGame: () => void;
  zones: {
    inSpring: boolean;
    nearWell: boolean;
    nearMerchant: boolean;
    offRoad: boolean;
  };
  cutscenePhase: 'none' | 'orbit' | 'snap' | 'zoom_hand' | 'proverb';
  isShopOpen: boolean;
  setIsShopOpen: React.Dispatch<React.SetStateAction<boolean>>;
  leftHandItem: LeftHandItem;
  onSelectLeftItem: (item: LeftHandItem) => void;
  onTriggerLeftAction: () => void;
  spinnerRpm: number;
  balanceInfo: {
    tilt: number;
    isDanger: boolean;
    spilledRecently: boolean;
    isSprinting: boolean;
  };
}

export const GameHUD: React.FC<GameHUDProps> = ({
  roomState,
  localPlayerId,
  connectedMode,
  botsEnabled,
  onToggleBots,
  onJoinRoom,
  onBuyUpgrade,
  onPourWater,
  onSetWellTarget,
  onResetGame,
  zones,
  cutscenePhase,
  isShopOpen,
  setIsShopOpen,
  leftHandItem,
  onSelectLeftItem,
  onTriggerLeftAction,
  spinnerRpm,
  balanceInfo,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomInput, setRoomInput] = useState(roomState.roomId);
  const [nameInput, setNameInput] = useState('Vodonoš');
  const [showDemoTools, setShowDemoTools] = useState(false);

  const localPlayer: PlayerState | undefined = roomState.players[localPlayerId];
  const fractureRatio =
    roomState.wellMax > 0
      ? Math.min(1, roomState.wellCurrent / roomState.wellMax)
      : 0;
  const wellPercent = Math.min(100, fractureRatio * 100);

  // Automatically close shop if player walks away from Merchant Cart
  useEffect(() => {
    if (!zones.nearMerchant && isShopOpen) {
      setIsShopOpen(false);
    }
  }, [zones.nearMerchant, isShopOpen, setIsShopOpen]);

  // Toggle shop with [F] or [B] ONLY when near Merchant Cart
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (roomState.climaxTriggered) return;
      if (e.code === 'KeyF' || e.code === 'KeyB') {
        if (zones.nearMerchant) {
          if (!isShopOpen && document.pointerLockElement) {
            document.exitPointerLock?.();
          }
          setIsShopOpen((prev) => !prev);
        }
      } else if (e.code === 'Escape') {
        setIsShopOpen(false);
        setShowRoomModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zones.nearMerchant, isShopOpen, roomState.climaxTriggered, setIsShopOpen]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
  };

  const playersList = Object.values(roomState.players);
  const sortedLeaderboard = [...playersList].sort(
    (a, b) =>
      b.totalGoldEarned - a.totalGoldEarned ||
      b.totalWaterDelivered - a.totalWaterDelivered ||
      b.tripsCompleted - a.tripsCompleted
  );
  const highestEarner = sortedLeaderboard[0];
  const totalWaterHauled = Math.round(
    playersList.reduce((acc, p) => acc + p.totalWaterDelivered, 0)
  );
  const totalTripsCount = Math.max(
    roomState.totalTrips,
    playersList.reduce((acc, p) => acc + (p.tripsCompleted || 0), 0)
  );

  // ===========================================================================
  // CLIMAX CUTSCENE & PROVERB OVERLAY
  // ===========================================================================
  if (roomState.climaxTriggered) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: cutscenePhase === 'proverb' ? 'auto' : 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          zIndex: 50,
        }}
      >
        <div
          style={{
            height: cutscenePhase === 'proverb' ? '12vh' : '11vh',
            background: 'linear-gradient(to bottom, #0b0908 75%, transparent)',
            transition: 'height 0.8s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#c9a675',
            fontSize: '13px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          {cutscenePhase === 'orbit' && 'Studna dosáhla 100 % kapacity...'}
          {cutscenePhase === 'snap' && 'KŘUP! PRÁSK! Džbán se utrhl a roztříštil o zem!'}
          {cutscenePhase === 'zoom_hand' && 'V pravé ruce ti zůstalo jen samotné ucho...'}
        </div>

        {cutscenePhase === 'proverb' && (
          <div
            style={{
              alignSelf: 'center',
              maxWidth: '760px',
              width: '92%',
              background: 'rgba(18, 14, 11, 0.92)',
              border: '2px solid #c88d51',
              borderRadius: '18px',
              padding: '32px 36px',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(10px)',
              textAlign: 'center',
              animation: 'fadeInProverb 1.1s ease-out forwards',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.25em',
                color: '#d98a3c',
                marginBottom: '12px',
                fontWeight: 700,
              }}
            >
              Staré české přísloví naplněno
            </div>

            <h1
              style={{
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 'clamp(22px, 3.3vw, 34px)',
                fontWeight: 900,
                color: '#fdf6eb',
                lineHeight: 1.35,
                margin: '0 0 24px 0',
                textShadow: '0 4px 18px rgba(217, 138, 60, 0.45)',
              }}
            >
              „Tak dlouho se chodí se džbánem pro vodu, až se ucho utrhne.“
            </h1>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '14px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(200, 141, 81, 0.3)',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <div style={{ color: '#a89b8c', fontSize: '12px', marginBottom: '4px' }}>
                  Celkem cest (Total Runs)
                </div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#f5efe6' }}>
                  {totalTripsCount}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(200, 141, 81, 0.3)',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <div style={{ color: '#a89b8c', fontSize: '12px', marginBottom: '4px' }}>
                  Nanosená voda (Total Water)
                </div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#63c5f2' }}>
                  {Math.max(roomState.wellMax, totalWaterHauled)} L
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(200, 141, 81, 0.3)',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <div style={{ color: '#a89b8c', fontSize: '12px', marginBottom: '4px' }}>
                  Nejbohatší vodonoš (Highest Earner)
                </div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Trophy size={18} />
                  <span>{highestEarner ? highestEarner.name : 'Vodonoš'}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#d4c5b4', marginTop: '2px' }}>
                  {highestEarner ? `${Math.round(highestEarner.totalGoldEarned)} zlaťáků` : ''}
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(0,0,0,0.35)',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '24px',
                textAlign: 'left',
                maxHeight: '150px',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  color: '#9c8f80',
                  marginBottom: '6px',
                  letterSpacing: '0.08em',
                }}
              >
                Žebříček vodonošů (Podle skóre a počtu cest)
              </div>
              {sortedLeaderboard.map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    padding: '5px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        color: idx === 0 ? '#fbbf24' : '#94a3b8',
                        minWidth: '20px',
                      }}
                    >
                      #{idx + 1}
                    </span>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: p.color,
                        display: 'inline-block',
                      }}
                    />
                    <strong>{p.name}</strong>
                    {p.id === roomState.climaxTriggeredBy && (
                      <span
                        style={{
                          fontSize: '10px',
                          background: '#ef4444',
                          color: '#fff',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        Utrhl ucho!
                      </span>
                    )}
                  </span>
                  <span style={{ color: '#cbd5e1' }}>
                    <strong>{p.tripsCompleted}</strong> cest &bull;{' '}
                    {Math.round(p.totalWaterDelivered)} L &bull;{' '}
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                      {Math.round(p.totalGoldEarned)} zl.
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={onResetGame}
              style={{
                background: 'linear-gradient(135deg, #d97736, #b8531c)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '14px 32px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 6px 20px rgba(217, 119, 54, 0.45)',
              }}
            >
              <RotateCcw size={18} />
              Hrát znovu (Play Again)
            </button>
          </div>
        )}

        <div
          style={{
            height: cutscenePhase === 'proverb' ? '12vh' : '11vh',
            background: 'linear-gradient(to top, #0b0908 75%, transparent)',
            transition: 'height 0.8s ease',
          }}
        />
      </div>
    );
  }

  if (!localPlayer) return null;

  const hasWater = localPlayer.waterCarried > 0.1;
  const waterFillPct = Math.min(
    100,
    (localPlayer.waterCarried / localPlayer.waterCapacity) * 100
  );
  const moveSpeedPct = Math.round(
    getMoveSpeedMultiplier(
      localPlayer.waterCarried,
      localPlayer.waterCapacity,
      localPlayer.upgrades.bootsTier
    ) *
      (balanceInfo.isSprinting ? 100 : 44)
  );

  const distToWell = Math.round(
    Math.hypot(
      localPlayer.x - WORLD_LOCATIONS.WELL.x,
      localPlayer.z - WORLD_LOCATIONS.WELL.z
    )
  );
  const distToSpring = Math.round(Math.abs(112.0 - localPlayer.z));

  const balanceMarkerPct = Math.max(2, Math.min(98, 50 + balanceInfo.tilt * 48));
  const ownsRifle = localPlayer.upgrades.rifleUnlock > 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '14px 20px',
        zIndex: 20,
      }}
    >
      {/* First-Person Center Crosshair (Turns into Rifle Reticle when Rifle [5] is equipped!) */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {leftHandItem === 'rifle' ? (
          <Crosshair size={26} color="#ef4444" strokeWidth={2.2} />
        ) : (
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.65)',
              border: '1px solid rgba(0, 0, 0, 0.5)',
            }}
          />
        )}
      </div>

      {/* ===================================================================== */}
      {/* TOP BAR: GLOBAL WELL PROGRESS, HANDLE FRACTURE & MULTIPLAYER ROOM     */}
      {/* ===================================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '14px',
          flexWrap: 'wrap',
        }}
      >
        {/* Left: Room, Bots, Distance Compass & Demo Controls */}
        <div
          style={{
            pointerEvents: 'auto',
            background: 'rgba(26, 21, 17, 0.86)',
            border: '1px solid rgba(200, 155, 105, 0.35)',
            borderRadius: '12px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background:
                  connectedMode === 'online'
                    ? '#4ade80'
                    : connectedMode === 'fallback_local'
                    ? '#f59e0b'
                    : '#94a3b8',
              }}
            />
            <span style={{ fontWeight: 700, fontSize: '13px', color: '#f5efe6' }}>
              {connectedMode === 'online'
                ? `Místnost: ${roomState.roomId}`
                : '1st-Person Lokální Režim'}
            </span>
            <button
              onClick={() => setShowRoomModal(true)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#e2d5c4',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <Users size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {playersList.length}/8
            </button>
            <button
              onClick={toggleMute}
              title={isMuted ? 'Zapnout zvuk' : 'Ztlumit zvuk'}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: '#e2d5c4',
                borderRadius: '6px',
                padding: '4px 6px',
                cursor: 'pointer',
              }}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </div>

          {/* Trail Distance Compass */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '11.5px',
              color: '#e2d5c4',
              background: 'rgba(0,0,0,0.3)',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            <Compass size={13} color="#fbbf24" />
            <span>
              Studna: <strong>{distToWell} m</strong>
            </span>
            <span>&bull;</span>
            <span style={{ color: '#63c5f2' }}>
              Studánka: <strong>{distToSpring} m</strong>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
            <button
              onClick={() => onToggleBots(!botsEnabled)}
              style={{
                background: botsEnabled
                  ? 'rgba(91, 140, 90, 0.35)'
                  : 'rgba(255,255,255,0.06)',
                border: `1px solid ${botsEnabled ? '#5b8c5a' : 'rgba(255,255,255,0.15)'}`,
                color: '#e2d5c4',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Bot size={12} />
              AI Vodonoši: {botsEnabled ? 'ZAP' : 'VYP'}
            </button>

            <button
              onClick={() => setShowDemoTools((p) => !p)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#c9b8a6',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Sliders size={11} />
              Test ucha
            </button>
          </div>

          {showDemoTools && (
            <div
              style={{
                marginTop: '4px',
                paddingTop: '6px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={() => onPourWater(roomState.wellMax * 0.25)}
                style={demoBtnStyle}
              >
                +25% Vody
              </button>
              <button
                onClick={() => {
                  const needed = Math.max(0, roomState.wellMax * 0.96 - roomState.wellCurrent);
                  if (needed > 0) onPourWater(needed);
                }}
                style={demoBtnStyle}
              >
                96% (Ohnuté ucho)
              </button>
              <button
                onClick={() => {
                  const rem = Math.max(10, roomState.wellMax - roomState.wellCurrent);
                  onPourWater(rem);
                }}
                style={{ ...demoBtnStyle, background: '#991b1b', color: '#fff' }}
              >
                100% (Utrhnout ucho!)
              </button>
            </div>
          )}

          {/* Live Leaderboard: Scores & Number of Runs */}
          <div
            style={{
              marginTop: '4px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10.5px',
                color: '#fbbf24',
                fontWeight: 700,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Trophy size={11} />
                Žebříček (Skóre &amp; Cesty)
              </span>
              <span style={{ color: '#cbd5e1' }}>Celkem cest: {totalTripsCount}</span>
            </div>
            {sortedLeaderboard.map((p, idx) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '11px',
                  color: p.id === localPlayerId ? '#fef08a' : '#e2d5c4',
                  fontWeight: p.id === localPlayerId ? 700 : 500,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '10px' }}>#{idx + 1}</span>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: p.color,
                      display: 'inline-block',
                    }}
                  />
                  <span>{p.name}</span>
                </span>
                <span style={{ fontSize: '10.5px', color: '#cbd5e1' }}>
                  <strong>{p.tripsCompleted}</strong> cest &bull;{' '}
                  {Math.round(p.totalWaterDelivered)}L &bull;{' '}
                  <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                    {Math.round(p.totalGoldEarned)} zl.
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Global Hilltop Well Progress Bar */}
        <div
          style={{
            pointerEvents: 'auto',
            flex: '1 1 400px',
            maxWidth: '540px',
            background: 'rgba(26, 21, 17, 0.88)',
            border: '1px solid rgba(200, 155, 105, 0.4)',
            borderRadius: '14px',
            padding: '12px 18px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Droplets size={16} color="#4fc3e8" />
              <span style={{ fontWeight: 700, fontSize: '14px', color: '#fdf6eb' }}>
                Obecní Studna na Kopci
              </span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#63c5f2' }}>
              {Math.round(roomState.wellCurrent)} / {roomState.wellMax} L (
              {wellPercent.toFixed(1)}%)
            </span>
          </div>

          <div
            style={{
              position: 'relative',
              height: '14px',
              background: 'rgba(0,0,0,0.55)',
              borderRadius: '7px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <div
              style={{
                width: `${wellPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>

        {/* Right: Merchant Button */}
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px',
          }}
        >
          <button
            disabled={!zones.nearMerchant}
            onClick={() => {
              if (!zones.nearMerchant) return;
              setIsShopOpen((prev) => !prev);
            }}
            style={{
              background: zones.nearMerchant
                ? 'linear-gradient(135deg, #d97736, #b8531c)'
                : 'rgba(26, 21, 17, 0.65)',
              border: zones.nearMerchant
                ? '1px solid #d98a3c'
                : '1px dashed rgba(255,255,255,0.2)',
              color: zones.nearMerchant ? '#fdf6eb' : '#9ca3af',
              borderRadius: '12px',
              padding: '10px 16px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: zones.nearMerchant ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: zones.nearMerchant ? 1 : 0.75,
              boxShadow: zones.nearMerchant
                ? '0 0 18px rgba(217, 119, 54, 0.6)'
                : '0 4px 12px rgba(0,0,0,0.35)',
            }}
          >
            {zones.nearMerchant ? <ShoppingBag size={16} /> : <Lock size={15} />}
            Kupecký Vůz [F]
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* WATER FILL / POUR INTERACTION PROMPT ([E])                            */}
      {/* ===================================================================== */}
      <div
        style={{
          alignSelf: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {zones.inSpring && (
          <div
            style={{
              background: 'rgba(15, 35, 48, 0.9)',
              border: '1.5px solid #38bdf8',
              borderRadius: '12px',
              padding: '10px 20px',
              color: '#e0f2fe',
              fontSize: '14px',
              fontWeight: 700,
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            }}
          >
            {localPlayer.waterCarried >= localPlayer.waterCapacity - 0.5
              ? 'Džbán je plný! Vynes vodu nahoru ke studni.'
              : 'Drž [E] pro nabrání vody z pramene do džbánu'}
          </div>
        )}

        {zones.nearWell && localPlayer.waterCarried > 0 && (
          <div
            style={{
              background: 'rgba(42, 28, 16, 0.92)',
              border: '1.5px solid #fbbf24',
              borderRadius: '12px',
              padding: '10px 20px',
              color: '#fef3c7',
              fontSize: '14px',
              fontWeight: 700,
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            }}
          >
            Drž [E] pro vylití vody ze džbánu do studny
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* BOTTOM AREA: LEFT-HAND ITEMS + PITCHER BALANCE GAUGE + RIGHT-HAND HUD */}
      {/* ===================================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '14px',
          flexWrap: 'wrap',
        }}
      >
        {/* Bottom-Left: Left-Hand Item Selector (1: Cig, 2: Knife, 3: Spinner, 4: Beer, 5: Rifle) */}
        <div
          style={{
            pointerEvents: 'auto',
            background: 'rgba(26, 21, 17, 0.9)',
            border: '1px solid rgba(200, 155, 105, 0.45)',
            borderRadius: '14px',
            padding: '10px 14px',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: '#c4b5a5',
            }}
          >
            <span>
              <strong>Levá ruka</strong> ([1]–[6])
            </span>
            <button
              onClick={onTriggerLeftAction}
              style={{
                background: 'linear-gradient(135deg, #d97736, #b8531c)',
                border: 'none',
                color: '#fff',
                borderRadius: '6px',
                padding: '3px 9px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {leftHandItem === 'cigarette' && 'Potáhnout [R / Klik]'}
              {leftHandItem === 'knife' && 'Trik [R / Klik]'}
              {leftHandItem === 'spinner' && `Roztočit [R / Klik] (${spinnerRpm} RPM)`}
              {leftHandItem === 'beer' && 'Napít se [R / Klik]'}
              {leftHandItem === 'rifle' &&
                `Vystřelit [R / Klik] (${localPlayer.ammo}/${MAX_RIFLE_AMMO})`}
              {leftHandItem === 'polish' && 'Leštit [R / Klik]'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => onSelectLeftItem('cigarette')}
              style={leftItemBtnStyle(leftHandItem === 'cigarette')}
            >
              <Flame size={15} color={leftHandItem === 'cigarette' ? '#ff5722' : '#a89b8c'} />
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>[1] Cigareta</div>
                <div style={{ fontSize: '9.5px', color: '#9c8f80' }}>Kouření</div>
              </div>
            </button>

            <button
              onClick={() => onSelectLeftItem('knife')}
              style={leftItemBtnStyle(leftHandItem === 'knife')}
            >
              <Scissors size={15} color={leftHandItem === 'knife' ? '#38bdf8' : '#a89b8c'} />
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>[2] Motýlek</div>
                <div style={{ fontSize: '9.5px', color: '#9c8f80' }}>Triky</div>
              </div>
            </button>

            <button
              onClick={() => onSelectLeftItem('spinner')}
              style={leftItemBtnStyle(leftHandItem === 'spinner')}
            >
              <Disc size={15} color={leftHandItem === 'spinner' ? '#ef4444' : '#a89b8c'} />
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>[3] Spinner</div>
                <div style={{ fontSize: '9.5px', color: '#9c8f80' }}>{spinnerRpm} RPM</div>
              </div>
            </button>

            <button
              onClick={() => onSelectLeftItem('beer')}
              style={leftItemBtnStyle(leftHandItem === 'beer')}
            >
              <Beer size={15} color={leftHandItem === 'beer' ? '#fbbf24' : '#a89b8c'} />
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>[4] Pivo</div>
                <div style={{ fontSize: '9.5px', color: '#9c8f80' }}>Půllitr</div>
              </div>
            </button>

            <button
              onClick={() => onSelectLeftItem('rifle')}
              style={leftItemBtnStyle(leftHandItem === 'rifle', !ownsRifle)}
            >
              {ownsRifle ? (
                <Crosshair size={15} color={leftHandItem === 'rifle' ? '#ef4444' : '#a89b8c'} />
              ) : (
                <Lock size={14} color="#78716c" />
              )}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>[5] Puška</div>
                <div
                  style={{
                    fontSize: '9.5px',
                    color: !ownsRifle
                      ? '#f59e0b'
                      : localPlayer.ammo > 0
                      ? '#4ade80'
                      : '#ef4444',
                  }}
                >
                  {ownsRifle
                    ? `Náboje: ${localPlayer.ammo}/${MAX_RIFLE_AMMO}`
                    : 'V obchodě'}
                </div>
              </div>
            </button>

            <button
              onClick={() => onSelectLeftItem('polish')}
              style={leftItemBtnStyle(leftHandItem === 'polish')}
            >
              <Droplets size={15} color={leftHandItem === 'polish' ? '#ffffff' : '#a89b8c'} />
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>[6] Leštit</div>
                <div style={{ fontSize: '9.5px', color: '#9c8f80' }}>3x + proudy</div>
              </div>
            </button>
          </div>
        </div>

        {/* Bottom-Center: Pitcher Balance Bar & Water/Gold Readout */}
        <div
          style={{
            pointerEvents: 'auto',
            background: 'rgba(26, 21, 17, 0.92)',
            border: '2px solid rgba(200, 155, 105, 0.45)',
            borderRadius: '16px',
            padding: '12px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            minWidth: '430px',
          }}
        >
          {/* Clean Balance Gauge Bar (No text explaining whether pitcher is stable/unstable!) */}
          <div>
            <div
              style={{
                position: 'relative',
                height: '12px',
                borderRadius: '6px',
                background: hasWater
                  ? 'linear-gradient(90deg, #dc2626 0%, #eab308 24%, #22c55e 50%, #eab308 76%, #dc2626 100%)'
                  : 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                opacity: hasWater ? 1 : 0.5,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -2,
                  bottom: -2,
                  width: '2px',
                  background: '#fff',
                  transform: 'translateX(-50%)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: `${balanceMarkerPct}%`,
                  top: '-3px',
                  width: '14px',
                  height: '16px',
                  borderRadius: '4px',
                  background: '#fdf6eb',
                  border: '2px solid #1c1917',
                  transform: 'translateX(-50%)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  transition: 'left 0.05s linear',
                }}
              />
            </div>
          </div>

          {/* Pitcher Water, Walk/Sprint Mode & Own Gold */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '18px',
              paddingTop: '4px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  marginBottom: '4px',
                }}
              >
                <span style={{ color: '#d4c5b4', fontWeight: 600 }}>
                  Pravá ruka: Džbán
                </span>
                <span style={{ color: '#63c5f2', fontWeight: 700 }}>
                  {Math.round(localPlayer.waterCarried)} / {localPlayer.waterCapacity} L
                </span>
              </div>
              <div
                style={{
                  height: '9px',
                  background: 'rgba(0,0,0,0.55)',
                  borderRadius: '5px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${waterFillPct}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #38bdf8, #60a5fa)',
                    transition: 'width 0.1s linear',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderLeft: '1px solid rgba(255,255,255,0.12)',
                paddingLeft: '14px',
              }}
            >
              <Footprints
                size={17}
                color={balanceInfo.isSprinting ? '#fbbf24' : '#4ade80'}
              />
              <div>
                <div style={{ fontSize: '10.5px', color: '#a89b8c' }}>
                  {balanceInfo.isSprinting ? 'Sprint [Shift]' : 'Chůze [W]'}
                </div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: balanceInfo.isSprinting ? '#fbbf24' : '#e2e8f0',
                  }}
                >
                  {moveSpeedPct}%
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderLeft: '1px solid rgba(255,255,255,0.12)',
                paddingLeft: '14px',
              }}
            >
              <Coins size={19} color="#fbbf24" />
              <div>
                <div style={{ fontSize: '10.5px', color: '#a89b8c' }}>Moje Zlaťáky</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24' }}>
                  {Math.floor(localPlayer.gold)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MERCHANT UPGRADE STALL MODAL                                          */}
      {/* ===================================================================== */}
      {isShopOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 40,
          }}
          onClick={() => setIsShopOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1f1914',
              border: '2px solid #c88d51',
              borderRadius: '16px',
              width: '92%',
              maxWidth: '660px',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '24px 28px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              color: '#f5efe6',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: '22px',
                  color: '#fbbf24',
                }}
              >
                Kupecký Vůz — Vylepšení Džbánu a Výbavy
              </h2>
              <span style={{ fontWeight: 800, color: '#fbbf24', fontSize: '16px' }}>
                Moje Zlaťáky: {Math.floor(localPlayer.gold)}
              </span>
            </div>

            <div
              style={{
                background: 'rgba(217, 119, 54, 0.15)',
                border: '1px solid rgba(217, 119, 54, 0.45)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '12.5px',
                color: '#fed7aa',
                marginBottom: '16px',
              }}
            >
              <strong>Pravidlo hrnčíře:</strong> Ucho džbánu nelze nikdy vyměnit! Každý vodonoš
              má své vlastní zlaťáky za vodu, kterou sám donese.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(Object.keys(UPGRADE_CATALOG) as UpgradeType[]).map((upKey) => {
                const def = UPGRADE_CATALOG[upKey];
                const currentLvl = localPlayer.upgrades[upKey];
                const isRifleItem = upKey === 'rifleUnlock';
                const isMax = isRifleItem
                  ? localPlayer.ammo >= MAX_RIFLE_AMMO
                  : currentLvl >= def.maxLevel;
                const cost = getUpgradeCost(upKey, currentLvl);
                const canAfford = localPlayer.gold >= cost && !isMax;
                const isSpecial = def.category === 'special';

                return (
                  <div
                    key={upKey}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: isSpecial
                        ? 'rgba(220, 38, 38, 0.12)'
                        : 'rgba(255,255,255,0.04)',
                      border: isSpecial
                        ? '1px solid rgba(239, 68, 68, 0.45)'
                        : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ flex: 1, paddingRight: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong
                          style={{
                            fontSize: '15px',
                            color: isSpecial ? '#fca5a5' : '#fdf6eb',
                          }}
                        >
                          {def.nameCs}
                        </strong>
                        <span style={{ fontSize: '12px', color: '#9c8f80' }}>
                          ({def.nameEn})
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            background: isSpecial
                              ? 'rgba(239, 68, 68, 0.25)'
                              : 'rgba(200, 141, 81, 0.25)',
                            color: isSpecial ? '#fca5a5' : '#fbbf24',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontWeight: 700,
                          }}
                        >
                          {isRifleItem
                            ? `Náboje: ${localPlayer.ammo}/${MAX_RIFLE_AMMO} (+${AMMO_PER_GUN_PURCHASE} za nákup)`
                            : `Úroveň ${currentLvl}/${def.maxLevel}`}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#b8a99a', marginTop: '4px' }}>
                        {def.description}
                      </div>
                    </div>

                    <button
                      disabled={!canAfford}
                      onClick={() => {
                        onBuyUpgrade(upKey);
                        if (upKey === 'rifleUnlock') {
                          onSelectLeftItem('rifle');
                        }
                      }}
                      style={{
                        background: isMax
                          ? '#3f3a34'
                          : canAfford
                          ? 'linear-gradient(135deg, #d97736, #b8531c)'
                          : 'rgba(255,255,255,0.08)',
                        color: isMax ? '#8a7e72' : canAfford ? '#fff' : '#786e65',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '9px 16px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: canAfford ? 'pointer' : 'not-allowed',
                        minWidth: '135px',
                      }}
                    >
                      {isRifleItem
                        ? isMax
                          ? 'PLNÉ NÁBOJE (99)'
                          : `+${AMMO_PER_GUN_PURCHASE} náboje (${cost} zl.)`
                        : isMax
                        ? 'MAX'
                        : `${cost} zl.`}
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '18px', textAlign: 'right' }}>
              <button
                onClick={() => setIsShopOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#e2d5c4',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Zavřít [ESC]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MULTIPLAYER SESSION ROOM MODAL                                        */}
      {/* ===================================================================== */}
      {showRoomModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 40,
          }}
          onClick={() => setShowRoomModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1f1914',
              border: '2px solid #c88d51',
              borderRadius: '16px',
              width: '90%',
              maxWidth: '420px',
              padding: '22px 26px',
              color: '#f5efe6',
            }}
          >
            <h3 style={{ marginTop: 0, fontFamily: "'Cinzel', Georgia, serif" }}>
              Kooperativní Místnost (4–8 Hráčů)
            </h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                Jméno vodonoše:
              </label>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                ID Místnosti (Room ID):
              </label>
              <input
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                Kapacita obecní studny (Well Threshold):
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1000, 5000, 10000].map((val) => (
                  <button
                    key={val}
                    onClick={() => onSetWellTarget(val)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '6px',
                      border:
                        roomState.wellMax === val
                          ? '1px solid #fbbf24'
                          : '1px solid rgba(255,255,255,0.15)',
                      background:
                        roomState.wellMax === val
                          ? 'rgba(251, 191, 36, 0.2)'
                          : 'rgba(255,255,255,0.06)',
                      color: '#f5efe6',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {val} L
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowRoomModal(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#cbd5e1',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                Zrušit
              </button>
              <button
                onClick={() => {
                  onJoinRoom(roomInput, nameInput);
                  setShowRoomModal(false);
                }}
                style={{
                  background: '#d97736',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Připojit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const leftItemBtnStyle = (active: boolean, locked = false): React.CSSProperties => ({
  background: active
    ? 'rgba(217, 119, 54, 0.28)'
    : locked
    ? 'rgba(0,0,0,0.35)'
    : 'rgba(255,255,255,0.05)',
  border: active
    ? '1px solid #fbbf24'
    : locked
    ? '1px dashed rgba(255,255,255,0.15)'
    : '1px solid rgba(255,255,255,0.12)',
  color: locked ? '#9ca3af' : '#f5efe6',
  borderRadius: '8px',
  padding: '6px 9px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  textAlign: 'left',
});

const demoBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#f5efe6',
  borderRadius: '5px',
  padding: '3px 7px',
  fontSize: '10.5px',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.35)',
  color: '#fff',
  fontSize: '14px',
};
