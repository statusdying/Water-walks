import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AMMO_PER_GUN_PURCHASE,
  BASE_WATER_CAPACITY,
  calculateWaterCapacity,
  ClientMessage,
  DEFAULT_WELL_MAX,
  getUpgradeCost,
  GOLD_PER_LITER,
  LeftHandItemType,
  MAX_RIFLE_AMMO,
  PlayerState,
  RoomState,
  ServerMessage,
  UPGRADE_CATALOG,
  UpgradeType,
} from '../../shared/types';
import { getPathCenterX, getTerrainHeight, WORLD_LOCATIONS } from '../../shared/world';
import { soundEngine } from '../audio/SoundEngine';

interface BotInternalState {
  id: string;
  phase: 'going_down' | 'filling' | 'going_up' | 'pouring';
  lateralOffset: number;
  speed: number;
  spillStunTimer: number;
}

const BOT_PROFILES = [
  { id: 'bot_honza', name: 'Honza (Bot)', color: '#5b8c5a', offset: -1.4 },
  { id: 'bot_marenka', name: 'Mařenka (Bot)', color: '#c99e32', offset: 1.4 },
  { id: 'bot_kuba', name: 'Kuba (Bot)', color: '#4a7c9b', offset: 0.2 },
];

export function useGameSession() {
  const [connectedMode, setConnectedMode] = useState<
    'connecting' | 'online' | 'fallback_local'
  >('connecting');
  const [localPlayerId, setLocalPlayerId] = useState<string>('local_hero');
  const [botsEnabled, setBotsEnabled] = useState<boolean>(true);
  const [shotByRemoteCounter, setShotByRemoteCounter] = useState<number>(0);
  const [shotNotification, setShotNotification] = useState<string | null>(null);

  const [roomState, setRoomState] = useState<RoomState>(() => {
    const spawnX = WORLD_LOCATIONS.SPAWN_CENTER.x;
    const spawnZ = WORLD_LOCATIONS.SPAWN_CENTER.z;
    const spawnY = getTerrainHeight(spawnX, spawnZ);
    return {
      roomId: 'vesnice-1',
      wellCurrent: 0,
      wellMax: DEFAULT_WELL_MAX,
      climaxTriggered: false,
      climaxTriggeredBy: null,
      climaxTimestamp: null,
      totalTrips: 0,
      players: {
        local_hero: {
          id: 'local_hero',
          name: 'Vodonoš',
          color: '#d96b43',
          x: spawnX,
          y: spawnY,
          z: spawnZ,
          rotY: 0,
          waterCarried: 0,
          waterCapacity: BASE_WATER_CAPACITY,
          gold: 30,
          ammo: 0,
          totalWaterDelivered: 0,
          totalGoldEarned: 30,
          tripsCompleted: 0,
          isFilling: false,
          isPouring: false,
          isMoving: false,
          isSpilling: false,
          leftHandItem: 'cigarette',
          leftActionCounter: 0,
          upgrades: {
            clayTier: 0,
            ironTier: 0,
            funnelTier: 0,
            bootsTier: 0,
            flowTier: 0,
            balanceTier: 0,
            rifleUnlock: 0,
          },
        },
      },
    };
  });

  const wsRef = useRef<WebSocket | null>(null);
  const localIdRef = useRef<string>('local_hero');
  const modeRef = useRef<'connecting' | 'online' | 'fallback_local'>('connecting');
  const botsStateRef = useRef<Record<string, BotInternalState>>({});

  const showTempNotification = useCallback((text: string) => {
    setShotNotification(text);
    window.setTimeout(() => {
      setShotNotification((prev) => (prev === text ? null : prev));
    }, 3200);
  }, []);

  const connectToRoom = useCallback(
    (roomId: string, playerName: string) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
      setConnectedMode('connecting');
      modeRef.current = 'connecting';

      let didConnect = false;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const fallbackTimeout = window.setTimeout(() => {
        if (!didConnect && ws.readyState !== WebSocket.OPEN) {
          ws.close();
          modeRef.current = 'fallback_local';
          setConnectedMode('fallback_local');
        }
      }, 6000);

      ws.onopen = () => {
        didConnect = true;
        window.clearTimeout(fallbackTimeout);
        modeRef.current = 'online';
        setConnectedMode('online');
        setBotsEnabled(false);

        const joinMsg: ClientMessage = {
          type: 'join',
          roomId,
          name: playerName,
        };
        ws.send(JSON.stringify(joinMsg));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          if (msg.type === 'welcome') {
            localIdRef.current = msg.playerId;
            setLocalPlayerId(msg.playerId);
            setRoomState((prev) => mergeServerWithLocalBots(msg.state, prev));
          } else if (msg.type === 'pitcher_shot') {
            if (msg.targetId === localIdRef.current) {
              if (msg.shooterId.startsWith('bear_')) {
                soundEngine.playBearAttack();
                setRoomState((prev) => {
                  const p = prev.players[localIdRef.current];
                  if (!p) return prev;
                  return {
                    ...prev,
                    players: {
                      ...prev.players,
                      [localIdRef.current]: {
                        ...p,
                        waterCarried: 0,
                        ammo: 0,
                        isSpilling: true,
                      },
                    },
                  };
                });
              }
              setShotByRemoteCounter((c) => c + 1);
            }
          } else if (
            msg.type === 'state_sync' ||
            msg.type === 'climax_start' ||
            msg.type === 'game_reset'
          ) {
            setRoomState((prev) => {
              const localP = prev.players[localIdRef.current];
              const merged = mergeServerWithLocalBots(msg.state, prev);
              if (
                msg.type === 'state_sync' &&
                localP &&
                merged.players[localIdRef.current]
              ) {
                merged.players[localIdRef.current] = {
                  ...merged.players[localIdRef.current],
                  x: localP.x,
                  y: localP.y,
                  z: localP.z,
                  rotY: localP.rotY,
                  isMoving: localP.isMoving,
                  isFilling: localP.isFilling,
                  isPouring: localP.isPouring,
                  isSpilling: localP.isSpilling,
                  leftHandItem: localP.leftHandItem,
                  leftActionCounter: localP.leftActionCounter,
                  waterCarried: localP.waterCarried,
                };
              }
              return merged;
            });
          }
        } catch (e) {
          console.error('WS message parse error', e);
        }
      };

      ws.onerror = () => {
        window.clearTimeout(fallbackTimeout);
        if (modeRef.current !== 'fallback_local') {
          modeRef.current = 'fallback_local';
          setConnectedMode('fallback_local');
        }
      };

      ws.onclose = () => {
        window.clearTimeout(fallbackTimeout);
        if (modeRef.current !== 'fallback_local') {
          modeRef.current = 'fallback_local';
          setConnectedMode('fallback_local');
          localIdRef.current = 'local_hero';
          setLocalPlayerId('local_hero');
        }
      };
    },
    [showTempNotification]
  );

  function mergeServerWithLocalBots(incoming: RoomState, prev: RoomState): RoomState {
    const nextPlayers = { ...incoming.players };
    const isFreshReset =
      incoming.wellCurrent === 0 &&
      incoming.totalTrips === 0 &&
      !incoming.climaxTriggered;

    for (const [id, p] of Object.entries(prev.players)) {
      if (p.isBot) {
        if (isFreshReset) {
          nextPlayers[id] = {
            ...p,
            waterCarried: 0,
            totalWaterDelivered: 0,
            totalGoldEarned: 0,
            tripsCompleted: 0,
          };
        } else {
          nextPlayers[id] = p;
        }
      }
    }

    const sumTrips = Object.values(nextPlayers).reduce(
      (sum, pl) => sum + (pl.tripsCompleted || 0),
      0
    );

    return {
      ...incoming,
      totalTrips: Math.max(incoming.totalTrips, sumTrips),
      players: nextPlayers,
    };
  }

  useEffect(() => {
    connectToRoom('vesnice-1', 'Vodonoš');
    return () => {
      wsRef.current?.close();
    };
  }, [connectToRoom]);

  // Spawn or remove cooperative dummy bots along the expanded 240m trail
  useEffect(() => {
    setRoomState((prev) => {
      const nextPlayers = { ...prev.players };
      if (!botsEnabled) {
        for (const prof of BOT_PROFILES) {
          delete nextPlayers[prof.id];
        }
        return { ...prev, players: nextPlayers };
      }

      BOT_PROFILES.forEach((prof, idx) => {
        if (!nextPlayers[prof.id]) {
          const startZ = -65 + idx * 55;
          const startX = getPathCenterX(startZ) + prof.offset;
          const startY = getTerrainHeight(startX, startZ);
          nextPlayers[prof.id] = {
            id: prof.id,
            name: prof.name,
            color: prof.color,
            x: startX,
            y: startY,
            z: startZ,
            rotY: 0,
            waterCarried: idx === 1 ? 75 : 0,
            waterCapacity: 90,
            gold: 0,
            ammo: 0,
            totalWaterDelivered: 0,
            totalGoldEarned: 0,
            tripsCompleted: 0,
            isFilling: false,
            isPouring: false,
            isMoving: true,
            isSpilling: false,
            leftHandItem: idx === 0 ? 'cigarette' : idx === 1 ? 'spinner' : 'beer',
            leftActionCounter: 0,
            isBot: true,
            upgrades: {
              clayTier: 1,
              ironTier: idx === 2 ? 1 : 0,
              funnelTier: 0,
              bootsTier: 1,
              flowTier: 1,
              balanceTier: 1,
              rifleUnlock: 0,
            },
          };
          botsStateRef.current[prof.id] = {
            id: prof.id,
            phase: idx === 1 ? 'going_up' : 'going_down',
            lateralOffset: prof.offset,
            speed: 5.2 + idx * 0.5,
            spillStunTimer: 0,
          };
        }
      });

      return { ...prev, players: nextPlayers };
    });
  }, [botsEnabled]);

  // AI loop for cooperative dummy bots
  useEffect(() => {
    if (!botsEnabled) return;
    const dt = 0.05;

    const interval = window.setInterval(() => {
      setRoomState((prev) => {
        if (prev.climaxTriggered) return prev;

        const nextPlayers = { ...prev.players };
        let wellDelta = 0;
        let tripsDelta = 0;
        let triggeredByBot: string | null = null;

        for (const prof of BOT_PROFILES) {
          const bot = nextPlayers[prof.id];
          const bState = botsStateRef.current[prof.id];
          if (!bot || !bState) continue;

          const updatedBot = { ...bot };

          // Handle stun & spill when shot by a player's Rifle!
          if (bState.spillStunTimer > 0) {
            bState.spillStunTimer = Math.max(0, bState.spillStunTimer - dt);
            updatedBot.isMoving = false;
            updatedBot.isFilling = false;
            updatedBot.isPouring = false;
            updatedBot.isSpilling = bState.spillStunTimer > 0.2;
            updatedBot.waterCarried = 0;
            if (bState.spillStunTimer <= 0) {
              updatedBot.isSpilling = false;
              bState.phase = 'going_down';
            }
            nextPlayers[prof.id] = updatedBot;
            continue;
          }

          if (bState.phase === 'going_down') {
            updatedBot.isMoving = true;
            updatedBot.isFilling = false;
            updatedBot.isPouring = false;
            const nextZ = Math.min(111.5, updatedBot.z + bState.speed * dt);
            const nextX = getPathCenterX(nextZ) + bState.lateralOffset;
            const dx = nextX - updatedBot.x;
            const dz = nextZ - updatedBot.z;
            updatedBot.rotY = Math.atan2(dx, dz);
            updatedBot.x = nextX;
            updatedBot.z = nextZ;
            updatedBot.y = getTerrainHeight(nextX, nextZ);

            if (nextZ >= 111.2) {
              bState.phase = 'filling';
            }
          } else if (bState.phase === 'filling') {
            updatedBot.isMoving = false;
            updatedBot.isFilling = true;
            updatedBot.waterCarried = Math.min(
              updatedBot.waterCapacity,
              updatedBot.waterCarried + 45 * dt
            );
            if (updatedBot.waterCarried >= updatedBot.waterCapacity) {
              updatedBot.isFilling = false;
              bState.phase = 'going_up';
            }
          } else if (bState.phase === 'going_up') {
            updatedBot.isMoving = true;
            updatedBot.isFilling = false;
            updatedBot.isPouring = false;
            const loadedSpeed = bState.speed * 0.78;
            const nextZ = Math.max(-107.5, updatedBot.z - loadedSpeed * dt);
            const nextX = getPathCenterX(nextZ) + bState.lateralOffset;
            const dx = nextX - updatedBot.x;
            const dz = nextZ - updatedBot.z;
            updatedBot.rotY = Math.atan2(dx, dz);
            updatedBot.x = nextX;
            updatedBot.z = nextZ;
            updatedBot.y = getTerrainHeight(nextX, nextZ);

            if (nextZ <= -107.2) {
              bState.phase = 'pouring';
            }
          } else if (bState.phase === 'pouring') {
            updatedBot.isMoving = false;
            updatedBot.isFilling = true;
            updatedBot.isPouring = true;
            updatedBot.rotY = Math.atan2(
              WORLD_LOCATIONS.WELL.x - updatedBot.x,
              WORLD_LOCATIONS.WELL.z - updatedBot.z
            );
            const pourStep = Math.min(updatedBot.waterCarried, 48 * dt);
            updatedBot.waterCarried = Math.max(0, updatedBot.waterCarried - pourStep);
            updatedBot.totalWaterDelivered += pourStep;
            // Bot tracks its own gold for leaderboard only — NEVER adds to local player's gold!
            updatedBot.totalGoldEarned += pourStep * GOLD_PER_LITER;
            wellDelta += pourStep;

            if (updatedBot.waterCarried <= 0.01) {
              updatedBot.waterCarried = 0;
              updatedBot.isPouring = false;
              updatedBot.tripsCompleted += 1;
              tripsDelta += 1;

              if (
                updatedBot.tripsCompleted % 2 === 0 &&
                updatedBot.upgrades.clayTier < 4
              ) {
                updatedBot.upgrades = {
                  ...updatedBot.upgrades,
                  clayTier: updatedBot.upgrades.clayTier + 1,
                };
                updatedBot.waterCapacity = calculateWaterCapacity(updatedBot.upgrades);
              } else if (
                updatedBot.tripsCompleted % 3 === 0 &&
                updatedBot.upgrades.funnelTier < 2
              ) {
                updatedBot.upgrades = {
                  ...updatedBot.upgrades,
                  funnelTier: updatedBot.upgrades.funnelTier + 1,
                };
                updatedBot.waterCapacity = calculateWaterCapacity(updatedBot.upgrades);
              }

              bState.phase = 'going_down';
            }
          }

          nextPlayers[prof.id] = updatedBot;
        }

        // Send `bot_pour` (NOT `pour`) so the server does NOT credit bot gold to the human player!
        if (
          (wellDelta > 0 || tripsDelta > 0) &&
          modeRef.current === 'online' &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          wsRef.current.send(
            JSON.stringify({
              type: 'bot_pour',
              amount: wellDelta,
              botTripsDelta: tripsDelta,
            } as ClientMessage)
          );
          return {
            ...prev,
            totalTrips: prev.totalTrips + tripsDelta,
            players: nextPlayers,
          };
        }

        const nextWellCurrent = Math.min(prev.wellMax, prev.wellCurrent + wellDelta);
        const reachedClimax = nextWellCurrent >= prev.wellMax && !prev.climaxTriggered;
        if (reachedClimax) {
          triggeredByBot = BOT_PROFILES[0].id;
        }

        return {
          ...prev,
          wellCurrent: nextWellCurrent,
          totalTrips: prev.totalTrips + tripsDelta,
          climaxTriggered: prev.climaxTriggered || reachedClimax,
          climaxTriggeredBy: prev.climaxTriggeredBy || triggeredByBot,
          climaxTimestamp:
            prev.climaxTimestamp || (reachedClimax ? Date.now() : null),
          players: nextPlayers,
        };
      });
    }, 50);

    return () => window.clearInterval(interval);
  }, [botsEnabled]);

  const sendLocalMove = useCallback(
    (
      x: number,
      y: number,
      z: number,
      rotY: number,
      isMoving: boolean,
      isFilling: boolean,
      isPouring: boolean,
      isSpilling: boolean,
      waterCarried: number,
      leftHandItem?: LeftHandItemType,
      leftActionCounter?: number
    ) => {
      if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = {
          type: 'move',
          x,
          y,
          z,
          rotY,
          isMoving,
          isFilling,
          isPouring,
          isSpilling,
          leftHandItem,
          leftActionCounter,
          waterCarried,
        };
        wsRef.current.send(JSON.stringify(msg));
        setRoomState((prev) => {
          const p = prev.players[localIdRef.current];
          if (!p) return prev;
          return {
            ...prev,
            players: {
              ...prev.players,
              [localIdRef.current]: {
                ...p,
                x,
                y,
                z,
                rotY,
                isMoving,
                isFilling,
                isPouring,
                isSpilling,
                leftHandItem: leftHandItem ?? p.leftHandItem,
                leftActionCounter: leftActionCounter ?? p.leftActionCounter,
                waterCarried,
              },
            },
          };
        });
      } else {
        setRoomState((prev) => {
          const p = prev.players[localIdRef.current];
          if (!p) return prev;
          return {
            ...prev,
            players: {
              ...prev.players,
              [localIdRef.current]: {
                ...p,
                x,
                y,
                z,
                rotY,
                isMoving,
                isFilling,
                isPouring,
                isSpilling,
                leftHandItem: leftHandItem ?? p.leftHandItem,
                leftActionCounter: leftActionCounter ?? p.leftActionCounter,
                waterCarried,
              },
            },
          };
        });
      }
    },
    []
  );

  // Consume 1 bullet when firing the Rifle
  const useBullet = useCallback(() => {
    setRoomState((prev) => {
      const p = prev.players[localIdRef.current];
      if (!p) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          [localIdRef.current]: {
            ...p,
            ammo: Math.max(0, p.ammo - 1),
          },
        },
      };
    });

    if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'use_bullet' } as ClientMessage));
    }
  }, []);

  // Bear attack: spills player's water AND drops all player's bullets!
  const onBearAttackPlayer = useCallback(() => {
    soundEngine.playBearAttack();
    soundEngine.playSpillCrash();

    setRoomState((prev) => {
      const p = prev.players[localIdRef.current];
      if (!p) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          [localIdRef.current]: {
            ...p,
            waterCarried: 0,
            ammo: 0,
            isSpilling: true,
          },
        },
      };
    });

    if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'bear_attack_player' } as ClientMessage)
      );
    }
  }, []);

  // Shoot another player's or bot's pitcher with the Rifle!
  const shootPitcher = useCallback((targetId: string) => {
    soundEngine.playSpillCrash();
    const bState = botsStateRef.current[targetId];
    if (bState) {
      bState.spillStunTimer = 1.4;
    }

    setRoomState((prev) => {
      const target = prev.players[targetId];
      if (!target) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          [targetId]: {
            ...target,
            waterCarried: 0,
            isSpilling: true,
            isMoving: false,
          },
        },
      };
    });

    if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'shoot_pitcher', targetId } as ClientMessage)
      );
    }
  }, []);

  // Shoot a shared forest bear with the Rifle!
  const shootBear = useCallback((bearId: 'bear_west' | 'bear_east') => {
    soundEngine.playBearHit();

    setRoomState((prev) => {
      if (!prev.bears || !prev.bears[bearId]) return prev;
      const bear = prev.bears[bearId];
      if (bear.isDead) return prev;
      const now = Date.now();
      const lastDamagedAt =
        bear.hp >= bear.maxHp || bear.lastDamagedAt === null ? now : bear.lastDamagedAt;
      const nextHp = Math.max(0, bear.hp - 1);
      const isDead = nextHp <= 0;
      if (isDead) {
        soundEngine.playBearRoar();
      }
      return {
        ...prev,
        bears: {
          ...prev.bears,
          [bearId]: {
            ...bear,
            hp: nextHp,
            lastDamagedAt,
            isDead,
            isChasing: isDead ? false : bear.isChasing,
            isAttacking: isDead ? false : bear.isAttacking,
          },
        },
      };
    });

    if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'shoot_bear', bearId } as ClientMessage)
      );
    }
  }, []);

  const pourWater = useCallback((amount: number) => {
    if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'pour', amount };
      wsRef.current.send(JSON.stringify(msg));
    } else {
      setRoomState((prev) => {
        if (prev.climaxTriggered) return prev;
        const p = prev.players[localIdRef.current];
        if (!p) return prev;

        const actual = Math.max(0, Math.min(amount, prev.wellMax - prev.wellCurrent));
        const nextWell = Math.min(prev.wellMax, prev.wellCurrent + actual);
        const tierMult =
          1 +
          p.upgrades.clayTier * 0.08 +
          p.upgrades.ironTier * 0.15 +
          p.upgrades.funnelTier * 0.25;
        const goldGain = actual * GOLD_PER_LITER * tierMult;
        const reachedClimax = nextWell >= prev.wellMax;

        return {
          ...prev,
          wellCurrent: nextWell,
          climaxTriggered: reachedClimax,
          climaxTriggeredBy: reachedClimax ? localIdRef.current : null,
          climaxTimestamp: reachedClimax ? Date.now() : null,
          players: {
            ...prev.players,
            [localIdRef.current]: {
              ...p,
              gold: p.gold + goldGain,
              totalGoldEarned: p.totalGoldEarned + goldGain,
              totalWaterDelivered: p.totalWaterDelivered + actual,
            },
          },
        };
      });
    }
  }, []);

  const completeTrip = useCallback(() => {
    if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'complete_trip' } as ClientMessage));
    } else {
      setRoomState((prev) => {
        const p = prev.players[localIdRef.current];
        if (!p) return prev;
        return {
          ...prev,
          totalTrips: prev.totalTrips + 1,
          players: {
            ...prev.players,
            [localIdRef.current]: {
              ...p,
              tripsCompleted: p.tripsCompleted + 1,
            },
          },
        };
      });
    }
  }, []);

  const buyUpgrade = useCallback((upgrade: UpgradeType) => {
    soundEngine.playCoinChime(true);
    if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'buy_upgrade', upgrade } as ClientMessage)
      );
    } else {
      setRoomState((prev) => {
        const p = prev.players[localIdRef.current];
        if (!p) return prev;
        const def = UPGRADE_CATALOG[upgrade];
        const currentLvl = p.upgrades[upgrade];
        if (upgrade === 'rifleUnlock') {
          if (p.ammo >= MAX_RIFLE_AMMO) return prev;
        } else {
          if (currentLvl >= def.maxLevel) return prev;
        }
        const cost = getUpgradeCost(upgrade, currentLvl);
        if (p.gold < cost) return prev;

        const nextUpgrades = {
          ...p.upgrades,
          [upgrade]: currentLvl + 1,
        };
        const nextAmmo =
          upgrade === 'rifleUnlock'
            ? Math.min(MAX_RIFLE_AMMO, p.ammo + AMMO_PER_GUN_PURCHASE)
            : p.ammo;

        return {
          ...prev,
          players: {
            ...prev.players,
            [localIdRef.current]: {
              ...p,
              gold: p.gold - cost,
              ammo: nextAmmo,
              upgrades: nextUpgrades,
              waterCapacity: calculateWaterCapacity(nextUpgrades),
            },
          },
        };
      });
    }
  }, []);

  const setWellTarget = useCallback((wellMax: number) => {
    if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'set_well_target', wellMax } as ClientMessage)
      );
    } else {
      setRoomState((prev) => {
        const clamped = Math.max(500, Math.min(20000, Math.round(wellMax)));
        const reached = prev.wellCurrent >= clamped;
        return {
          ...prev,
          wellMax: clamped,
          wellCurrent: Math.min(prev.wellCurrent, clamped),
          climaxTriggered: prev.climaxTriggered || reached,
          climaxTriggeredBy:
            prev.climaxTriggeredBy || (reached ? localIdRef.current : null),
        };
      });
    }
  }, []);

  const resetGame = useCallback(() => {
    if (modeRef.current === 'online' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reset_game' } as ClientMessage));
    } else {
      setRoomState((prev) => {
        const nextPlayers: Record<string, PlayerState> = {};
        Object.values(prev.players).forEach((p, idx) => {
          const spawnX = (idx - 1) * 2.2;
          const spawnZ = WORLD_LOCATIONS.SPAWN_CENTER.z;
          nextPlayers[p.id] = {
            ...p,
            x: spawnX,
            y: getTerrainHeight(spawnX, spawnZ),
            z: spawnZ,
            waterCarried: 0,
            waterCapacity: p.isBot ? 90 : BASE_WATER_CAPACITY,
            gold: p.isBot ? 0 : 30,
            ammo: 0,
            totalWaterDelivered: 0,
            totalGoldEarned: p.isBot ? 0 : 30,
            tripsCompleted: 0,
            isFilling: false,
            isPouring: false,
            isMoving: false,
            isSpilling: false,
            upgrades: {
              clayTier: p.isBot ? 1 : 0,
              ironTier: 0,
              funnelTier: 0,
              bootsTier: p.isBot ? 1 : 0,
              flowTier: p.isBot ? 1 : 0,
              balanceTier: p.isBot ? 1 : 0,
              rifleUnlock: 0,
            },
          };
        });
        return {
          ...prev,
          wellCurrent: 0,
          climaxTriggered: false,
          climaxTriggeredBy: null,
          climaxTimestamp: null,
          totalTrips: 0,
          players: nextPlayers,
        };
      });
    }
  }, []);

  return {
    connectedMode,
    localPlayerId,
    roomState,
    botsEnabled,
    setBotsEnabled,
    shotByRemoteCounter,
    shotNotification,
    showTempNotification,
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
  };
}
