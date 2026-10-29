import { WebSocketServer, WebSocket } from 'ws';
import {
  AMMO_PER_GUN_PURCHASE,
  BASE_WATER_CAPACITY,
  BEAR_MAX_HP,
  BEAR_REGEN_DELAY_MS,
  BearState,
  calculateWaterCapacity,
  ClientMessage,
  DEFAULT_WELL_MAX,
  getUpgradeCost,
  GOLD_PER_LITER,
  MAX_RIFLE_AMMO,
  PlayerState,
  RoomState,
  ServerMessage,
  UPGRADE_CATALOG,
} from '../shared/types.js';
import {
  getForestSide,
  getPathCenterX,
  getTerrainHeight,
  WORLD_LOCATIONS,
} from '../shared/world.js';

const PORT = Number(process.env.PORT || 3001);
const MAX_PLAYERS_PER_ROOM = 8;

const PLAYER_COLORS = [
  '#d96b43', // Terracotta Rust
  '#5b8c5a', // Forest Sage
  '#4a7c9b', // Creek Slate Blue
  '#c99e32', // Harvest Ochre
  '#8f5d78', // Heather Plum
  '#c45151', // Bohemian Crimson
  '#4b9387', // Pine Teal
  '#a67c52', // Warm Bark
];

interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  roomId: string;
}

interface BearWaypointState {
  x: number;
  z: number;
  waitTimer: number;
  attackCooldown: number;
}

const rooms = new Map<string, RoomState>();
const clients = new Map<WebSocket, ConnectedClient>();
const roomBearWaypoints = new Map<
  string,
  Record<'bear_west' | 'bear_east', BearWaypointState>
>();

function createDefaultWaypoints(): Record<'bear_west' | 'bear_east', BearWaypointState> {
  return {
    bear_west: { x: -28, z: 22, waitTimer: 0, attackCooldown: 0 },
    bear_east: { x: 28, z: -22, waitTimer: 0, attackCooldown: 0 },
  };
}

function createRoomBears(): Record<string, BearState> {
  const westX = -24;
  const westZ = -18;
  const eastX = 24;
  const eastZ = 24;
  return {
    bear_west: {
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
    bear_east: {
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
  };
}

function createEmptyRoom(roomId: string): RoomState {
  roomBearWaypoints.set(roomId, createDefaultWaypoints());
  return {
    roomId,
    wellCurrent: 0,
    wellMax: DEFAULT_WELL_MAX,
    climaxTriggered: false,
    climaxTriggeredBy: null,
    climaxTimestamp: null,
    totalTrips: 0,
    players: {},
    bears: createRoomBears(),
  };
}

function getOrCreateRoom(roomId: string): RoomState {
  const cleanId = (roomId || 'vesnice-1').trim().toLowerCase().slice(0, 24);
  let room = rooms.get(cleanId);
  if (!room) {
    room = createEmptyRoom(cleanId);
    rooms.set(cleanId, room);
  }
  return room;
}

function broadcastToRoom(roomId: string, message: ServerMessage) {
  const payload = JSON.stringify(message);
  for (const [, client] of clients) {
    if (client.roomId === roomId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws: WebSocket) => {
  const playerId = `p_${Math.random().toString(36).slice(2, 9)}`;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;

      if (msg.type === 'join') {
        let targetRoomId = (msg.roomId || 'vesnice-1').trim().toLowerCase();
        let room = getOrCreateRoom(targetRoomId);

        const humanCount = Object.values(room.players).filter((p) => !p.isBot).length;
        if (humanCount >= MAX_PLAYERS_PER_ROOM) {
          targetRoomId = `${targetRoomId}-${Math.floor(Math.random() * 90 + 10)}`;
          room = getOrCreateRoom(targetRoomId);
        }

        const idx = Object.keys(room.players).length;
        const angle = (idx / MAX_PLAYERS_PER_ROOM) * Math.PI * 2;
        const spawnX = WORLD_LOCATIONS.SPAWN_CENTER.x + Math.cos(angle) * 3.2;
        const spawnZ = WORLD_LOCATIONS.SPAWN_CENTER.z + Math.sin(angle) * 2.5;
        const spawnY = getTerrainHeight(spawnX, spawnZ);

        const initialUpgrades = {
          clayTier: 0,
          ironTier: 0,
          funnelTier: 0,
          bootsTier: 0,
          flowTier: 0,
          balanceTier: 0,
          rifleUnlock: 0,
        };

        const player: PlayerState = {
          id: playerId,
          name: (msg.name || `Vodonoš ${idx + 1}`).slice(0, 18),
          color: msg.color || PLAYER_COLORS[idx % PLAYER_COLORS.length],
          x: spawnX,
          y: spawnY,
          z: spawnZ,
          rotY: 0,
          waterCarried: 0,
          waterCapacity: BASE_WATER_CAPACITY,
          gold: 20,
          ammo: 0,
          totalWaterDelivered: 0,
          totalGoldEarned: 20,
          tripsCompleted: 0,
          isFilling: false,
          isPouring: false,
          isMoving: false,
          isSpilling: false,
          leftHandItem: 'cigarette',
          leftActionCounter: 0,
          upgrades: initialUpgrades,
        };

        room.players[playerId] = player;
        clients.set(ws, { ws, playerId, roomId: room.roomId });

        const welcome: ServerMessage = {
          type: 'welcome',
          playerId,
          state: room,
        };
        ws.send(JSON.stringify(welcome));

        broadcastToRoom(room.roomId, { type: 'state_sync', state: room });
        return;
      }

      const clientInfo = clients.get(ws);
      if (!clientInfo) return;
      const room = rooms.get(clientInfo.roomId);
      if (!room) return;
      const player = room.players[clientInfo.playerId];
      if (!player) return;

      switch (msg.type) {
        case 'move': {
          if (room.climaxTriggered) return;
          player.x = msg.x;
          player.y = msg.y;
          player.z = msg.z;
          player.rotY = msg.rotY;
          player.isMoving = msg.isMoving;
          player.isFilling = msg.isFilling;
          player.isPouring = msg.isPouring;
          player.isSpilling = Boolean(msg.isSpilling);
          if (msg.leftHandItem) {
            player.leftHandItem = msg.leftHandItem;
          }
          if (typeof msg.leftActionCounter === 'number') {
            player.leftActionCounter = msg.leftActionCounter;
          }
          player.waterCarried = Math.max(
            0,
            Math.min(player.waterCapacity, msg.waterCarried)
          );
          break;
        }

        case 'pour': {
          if (room.climaxTriggered) return;
          const amount = Math.max(0, Math.min(msg.amount, room.wellMax - room.wellCurrent));
          if (amount <= 0) return;

          room.wellCurrent = Math.min(room.wellMax, room.wellCurrent + amount);
          player.totalWaterDelivered += amount;

          // Economy: Only THIS player receives gold for the water they personally poured (50% of previous rate)!
          const tierMultiplier =
            1 +
            player.upgrades.clayTier * 0.08 +
            player.upgrades.ironTier * 0.15 +
            player.upgrades.funnelTier * 0.25;
          const goldEarned = amount * GOLD_PER_LITER * tierMultiplier;
          player.gold += goldEarned;
          player.totalGoldEarned += goldEarned;

          broadcastToRoom(room.roomId, {
            type: 'pour_event',
            playerId: player.id,
            amount,
            wellCurrent: room.wellCurrent,
          });

          if (room.wellCurrent >= room.wellMax && !room.climaxTriggered) {
            room.wellCurrent = room.wellMax;
            room.climaxTriggered = true;
            room.climaxTriggeredBy = player.id;
            room.climaxTimestamp = Date.now();

            broadcastToRoom(room.roomId, {
              type: 'climax_start',
              triggeredBy: player.id,
              state: room,
            });
          }
          break;
        }

        case 'bot_pour': {
          if (room.climaxTriggered) return;
          const amount = Math.max(0, Math.min(msg.amount, room.wellMax - room.wellCurrent));
          if (msg.botTripsDelta && msg.botTripsDelta > 0) {
            room.totalTrips += msg.botTripsDelta;
          }
          if (amount <= 0) return;

          room.wellCurrent = Math.min(room.wellMax, room.wellCurrent + amount);
          if (room.wellCurrent >= room.wellMax && !room.climaxTriggered) {
            room.wellCurrent = room.wellMax;
            room.climaxTriggered = true;
            room.climaxTriggeredBy = 'bot_honza';
            room.climaxTimestamp = Date.now();

            broadcastToRoom(room.roomId, {
              type: 'climax_start',
              triggeredBy: 'bot_honza',
              state: room,
            });
          }
          break;
        }

        case 'use_bullet': {
          if (room.climaxTriggered) return;
          player.ammo = Math.max(0, player.ammo - 1);
          break;
        }

        case 'bear_attack_player': {
          if (room.climaxTriggered) return;
          player.waterCarried = 0;
          player.ammo = 0; // Drops all bullets!
          player.isSpilling = true;
          broadcastToRoom(room.roomId, { type: 'state_sync', state: room });
          break;
        }

        case 'shoot_bear': {
          if (room.climaxTriggered) return;
          if (!room.bears) room.bears = createRoomBears();
          const bear = room.bears[msg.bearId];
          if (!bear || bear.isDead) return;
          const now = Date.now();
          if (bear.hp >= bear.maxHp || bear.lastDamagedAt === null) {
            bear.lastDamagedAt = now;
          }
          bear.hp = Math.max(0, bear.hp - 1);
          if (bear.hp <= 0) {
            bear.hp = 0;
            bear.isDead = true;
            bear.isChasing = false;
            bear.isAttacking = false;
          }
          broadcastToRoom(room.roomId, { type: 'state_sync', state: room });
          break;
        }

        case 'shoot_pitcher': {
          if (room.climaxTriggered) return;
          if (!player.upgrades.rifleUnlock) return;
          const target = room.players[msg.targetId];
          if (target) {
            target.waterCarried = 0;
            target.isSpilling = true;
          }
          broadcastToRoom(room.roomId, {
            type: 'pitcher_shot',
            shooterId: player.id,
            targetId: msg.targetId,
          });
          broadcastToRoom(room.roomId, { type: 'state_sync', state: room });
          break;
        }

        case 'complete_trip': {
          player.tripsCompleted += 1;
          room.totalTrips += 1;
          broadcastToRoom(room.roomId, { type: 'state_sync', state: room });
          break;
        }

        case 'buy_upgrade': {
          if (room.climaxTriggered) return;
          const def = UPGRADE_CATALOG[msg.upgrade];
          if (!def) return;
          const currentLevel = player.upgrades[msg.upgrade];

          if (msg.upgrade === 'rifleUnlock') {
            if (player.ammo >= MAX_RIFLE_AMMO) return;
          } else {
            if (currentLevel >= def.maxLevel) return;
          }

          const cost = getUpgradeCost(msg.upgrade, currentLevel);
          if (player.gold < cost) return;

          player.gold -= cost;
          player.upgrades[msg.upgrade] = currentLevel + 1;

          // Every time player buys the Rifle in the store, they get +3 bullets (up to 99 max)!
          if (msg.upgrade === 'rifleUnlock') {
            player.ammo = Math.min(MAX_RIFLE_AMMO, player.ammo + AMMO_PER_GUN_PURCHASE);
          }

          player.waterCapacity = calculateWaterCapacity(player.upgrades);
          broadcastToRoom(room.roomId, { type: 'state_sync', state: room });
          break;
        }

        case 'set_well_target': {
          if (room.climaxTriggered) return;
          const clamped = Math.max(500, Math.min(20000, Math.round(msg.wellMax)));
          room.wellMax = clamped;
          if (room.wellCurrent >= room.wellMax) {
            room.wellCurrent = room.wellMax;
            room.climaxTriggered = true;
            room.climaxTriggeredBy = player.id;
            room.climaxTimestamp = Date.now();
            broadcastToRoom(room.roomId, {
              type: 'climax_start',
              triggeredBy: player.id,
              state: room,
            });
          } else {
            broadcastToRoom(room.roomId, { type: 'state_sync', state: room });
          }
          break;
        }

        case 'reset_game': {
          room.wellCurrent = 0;
          room.climaxTriggered = false;
          room.climaxTriggeredBy = null;
          room.climaxTimestamp = null;
          room.totalTrips = 0;
          room.bears = createRoomBears();
          roomBearWaypoints.set(room.roomId, {
            bear_west: { x: -24, z: -26, waitTimer: 0, attackCooldown: 0 },
            bear_east: { x: 24, z: 22, waitTimer: 0, attackCooldown: 0 },
          });

          Object.values(room.players).forEach((p, idx) => {
            const angle = (idx / MAX_PLAYERS_PER_ROOM) * Math.PI * 2;
            p.x = WORLD_LOCATIONS.SPAWN_CENTER.x + Math.cos(angle) * 3.2;
            p.z = WORLD_LOCATIONS.SPAWN_CENTER.z + Math.sin(angle) * 2.5;
            p.y = getTerrainHeight(p.x, p.z);
            p.waterCarried = 0;
            p.waterCapacity = BASE_WATER_CAPACITY;
            p.gold = 20;
            p.ammo = 0;
            p.totalWaterDelivered = 0;
            p.totalGoldEarned = 20;
            p.tripsCompleted = 0;
            p.isFilling = false;
            p.isPouring = false;
            p.isMoving = false;
            p.isSpilling = false;
            p.leftHandItem = 'cigarette';
            p.leftActionCounter = 0;
            p.upgrades = {
              clayTier: 0,
              ironTier: 0,
              funnelTier: 0,
              bootsTier: 0,
              flowTier: 0,
              balanceTier: 0,
              rifleUnlock: 0,
            };
          });

          broadcastToRoom(room.roomId, { type: 'game_reset', state: room });
          break;
        }
      }
    } catch (err) {
      console.error('Failed to process client message:', err);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (!info) return;
    clients.delete(ws);

    const room = rooms.get(info.roomId);
    if (room) {
      delete room.players[info.playerId];
      if (Object.keys(room.players).length === 0) {
        rooms.delete(info.roomId);
        roomBearWaypoints.delete(info.roomId);
      } else {
        broadcastToRoom(room.roomId, { type: 'state_sync', state: room });
      }
    }
  });
});

setInterval(() => {
  const dt = 0.05; // 50ms tick
  const now = Date.now();

  for (const [roomId, room] of rooms) {
    const playerList = Object.values(room.players);
    if (playerList.length === 0) continue;

    if (!room.bears) {
      room.bears = createRoomBears();
    }
    let wpMap = roomBearWaypoints.get(roomId);
    if (!wpMap) {
      wpMap = createDefaultWaypoints();
      roomBearWaypoints.set(roomId, wpMap);
    }

    if (!room.climaxTriggered) {
      for (const bearId of ['bear_west', 'bear_east'] as const) {
        const bear = room.bears[bearId];
        const wp = wpMap[bearId];
        if (!bear || !wp) continue;

        if (typeof wp.waitTimer !== 'number' || Number.isNaN(wp.waitTimer)) {
          wp.waitTimer = 0;
        }
        if (typeof wp.attackCooldown !== 'number' || Number.isNaN(wp.attackCooldown)) {
          wp.attackCooldown = 0;
        }

        if (bear.isDead) {
          bear.isChasing = false;
          bear.isAttacking = false;
          continue;
        }

        // 1-minute (60,000ms) window from first shot before HP regenerates back to 100%
        if (bear.hp < bear.maxHp && bear.lastDamagedAt !== null) {
          const elapsedSinceFirstHit = now - bear.lastDamagedAt;
          if (elapsedSinceFirstHit >= BEAR_REGEN_DELAY_MS) {
            bear.isRegenerating = true;
            bear.hp = Math.min(bear.maxHp, bear.hp + dt * 2.5);
            if (bear.hp >= bear.maxHp) {
              bear.hp = bear.maxHp;
              bear.isRegenerating = false;
              bear.lastDamagedAt = null;
            }
          }
        }

        if (wp.attackCooldown > 0) {
          wp.attackCooldown = Math.max(0, wp.attackCooldown - dt);
        }
        bear.isAttacking = wp.attackCooldown > 1.3;

        // Check if any player in the room stepped off the road on this bear's side of the forest
        let targetPlayer: PlayerState | null = null;
        let closestDist = 110;

        for (const p of playerList) {
          const pForestSide = getForestSide(p.x, p.z);
          if (pForestSide !== bear.side) continue;

          const distToBear = Math.hypot(p.x - bear.x, p.z - bear.z);
          if (distToBear < closestDist) {
            closestDist = distToBear;
            targetPlayer = p;
          }
        }

        if (targetPlayer) {
          bear.isChasing = true;
          const dx = targetPlayer.x - bear.x;
          const dz = targetPlayer.z - bear.z;
          const dist = Math.hypot(dx, dz) || 1;
          bear.rotY = Math.atan2(dx, dz);

          const chaseSpeed = 11.6; // ~30% faster bear chase speed
          bear.x += (dx / dist) * chaseSpeed * dt;
          bear.z += (dz / dist) * chaseSpeed * dt;
          bear.y = getTerrainHeight(bear.x, bear.z);

          // Check distance after moving: Bear hits player -> spills water and drops all bullets!
          const newDist = Math.hypot(targetPlayer.x - bear.x, targetPlayer.z - bear.z);
          if (newDist <= 2.35 && wp.attackCooldown <= 0) {
            wp.attackCooldown = 2.2;
            bear.isAttacking = true;
            targetPlayer.waterCarried = 0;
            targetPlayer.ammo = 0;
            targetPlayer.isSpilling = true;

            // Step back slightly after striking
            bear.x -= (dx / dist) * 2.2;
            bear.z -= (dz / dist) * 2.2;
            bear.y = getTerrainHeight(bear.x, bear.z);

            broadcastToRoom(roomId, {
              type: 'pitcher_shot',
              shooterId: bear.id,
              targetId: targetPlayer.id,
            });
          }
        } else {
          // Player is safely on the road (or on the other side) -> stop chasing & patrol the forest
          bear.isChasing = false;
          const dx = wp.x - bear.x;
          const dz = wp.z - bear.z;
          const dist = Math.hypot(dx, dz) || 1;

          if (dist < 2.5) {
            const nextZ = -70 + Math.random() * 150;
            const roadCenterAtZ = getPathCenterX(nextZ);
            const forestOffset = 11 + Math.random() * 24;
            const nextX =
              bear.side === 'west'
                ? roadCenterAtZ - forestOffset
                : roadCenterAtZ + forestOffset;
            wp.x = Math.max(-52, Math.min(52, nextX));
            wp.z = nextZ;
          } else {
            const wanderSpeed = 4.2; // ~30% faster forest walk speed
            bear.rotY = Math.atan2(dx, dz);
            let nextBearX = bear.x + (dx / dist) * wanderSpeed * dt;
            const nextBearZ = bear.z + (dz / dist) * wanderSpeed * dt;

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
      }
    }

    broadcastToRoom(roomId, { type: 'state_sync', state: room });
  }
}, 50);

console.log(`[ChoditSDzbanem] Multiplayer WebSocket Server listening on ws://localhost:${PORT}`);
