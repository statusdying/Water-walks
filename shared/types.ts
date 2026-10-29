export type UpgradeType =
  | 'clayTier'
  | 'ironTier'
  | 'funnelTier'
  | 'bootsTier'
  | 'flowTier'
  | 'balanceTier'
  | 'rifleUnlock';

export type LeftHandItemType =
  | 'cigarette'
  | 'knife'
  | 'spinner'
  | 'beer'
  | 'rifle'
  | 'polish';

export interface PlayerUpgrades {
  clayTier: number;      // Tier I: +40 water cap per level
  ironTier: number;      // Tier II: +90 water cap per level
  funnelTier: number;    // Tier III: +180 water cap per level
  bootsTier: number;     // Reduces weight slowdown & boosts walk/sprint speed (10 levels)
  flowTier: number;      // Boosts filling & pouring speed
  balanceTier: number;   // Improves pitcher balance stability while sprinting
  rifleUnlock: number;   // Number of times Rifle (+3 bullets each) was bought
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  waterCarried: number;
  waterCapacity: number;
  gold: number;
  ammo: number;          // Current rifle bullets (0..99). Buying gun gives +3 bullets
  totalWaterDelivered: number;
  totalGoldEarned: number;
  tripsCompleted: number;
  isFilling: boolean;
  isPouring: boolean;
  isMoving: boolean;
  isSpilling?: boolean;
  leftHandItem?: LeftHandItemType;
  leftActionCounter?: number;
  upgrades: PlayerUpgrades;
  isBot?: boolean;
}

export interface BearState {
  id: 'bear_west' | 'bear_east';
  name: string;
  side: 'west' | 'east'; // 'west' = -X forest, 'east' = +X forest
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;            // 0..9 (takes 9 shots within 60s to kill)
  maxHp: number;         // 9
  lastDamagedAt: number | null; // Timestamp (ms) of first shot in window
  isChasing: boolean;
  isAttacking?: boolean;
  isDead: boolean;
  isRegenerating?: boolean;
}

export interface RoomState {
  roomId: string;
  wellCurrent: number;
  wellMax: number;
  climaxTriggered: boolean;
  climaxTriggeredBy: string | null;
  climaxTimestamp: number | null;
  totalTrips: number;
  players: Record<string, PlayerState>;
  bears?: Record<string, BearState>;
}

export type ClientMessage =
  | { type: 'join'; roomId: string; name: string; color?: string }
  | {
      type: 'move';
      x: number;
      y: number;
      z: number;
      rotY: number;
      isMoving: boolean;
      isFilling: boolean;
      isPouring: boolean;
      isSpilling?: boolean;
      waterCarried: number;
      leftHandItem?: LeftHandItemType;
      leftActionCounter?: number;
    }
  | { type: 'pour'; amount: number }
  | { type: 'bot_pour'; amount: number; botTripsDelta?: number }
  | { type: 'use_bullet' }
  | { type: 'bear_attack_player' }
  | { type: 'shoot_bear'; bearId: 'bear_west' | 'bear_east' }
  | { type: 'shoot_pitcher'; targetId: string }
  | { type: 'complete_trip' }
  | { type: 'buy_upgrade'; upgrade: UpgradeType }
  | { type: 'set_well_target'; wellMax: number }
  | { type: 'reset_game' };

export type ServerMessage =
  | { type: 'welcome'; playerId: string; state: RoomState }
  | { type: 'state_sync'; state: RoomState }
  | { type: 'pour_event'; playerId: string; amount: number; wellCurrent: number }
  | { type: 'pitcher_shot'; shooterId: string; targetId: string }
  | { type: 'climax_start'; triggeredBy: string; state: RoomState }
  | { type: 'game_reset'; state: RoomState };

export interface UpgradeDefinition {
  id: UpgradeType;
  nameCs: string;
  nameEn: string;
  description: string;
  category: 'pitcher' | 'character' | 'special';
  baseCost: number;
  costMultiplier: number;
  maxLevel: number;
  capacityBonus?: number;
}

export const MAX_RIFLE_AMMO = 99;
export const AMMO_PER_GUN_PURCHASE = 3;
export const BEAR_MAX_HP = 9;
export const BEAR_REGEN_DELAY_MS = 60000; // 1 minute (60,000 ms)
export const GOLD_PER_LITER = 0.325;      // 50% of previous 0.65 gold rate!

export const UPGRADE_CATALOG: Record<UpgradeType, UpgradeDefinition> = {
  clayTier: {
    id: 'clayTier',
    nameCs: 'Hliněný Prstenec I',
    nameEn: 'Clay Extension Ring I',
    description: 'Adds a hand-molded clay ring atop the pitcher (+40L capacity). Same old handle.',
    category: 'pitcher',
    baseCost: 50,
    costMultiplier: 1.45,
    maxLevel: 5,
    capacityBonus: 40,
  },
  ironTier: {
    id: 'ironTier',
    nameCs: 'Okovaná Obruč II',
    nameEn: 'Iron Hoop Extension II',
    description: 'Heavy iron-strapped barrel extension stacked higher (+90L capacity). Heavy strain on handle!',
    category: 'pitcher',
    baseCost: 150,
    costMultiplier: 1.55,
    maxLevel: 4,
    capacityBonus: 90,
  },
  funnelTier: {
    id: 'funnelTier',
    nameCs: 'Měděný Trychtýř III',
    nameEn: 'Brazen Funnel Crown III',
    description: 'Comically oversized copper funnel tower (+180L capacity). Wobbly and perilous!',
    category: 'pitcher',
    baseCost: 360,
    costMultiplier: 1.65,
    maxLevel: 3,
    capacityBonus: 180,
  },
  balanceTier: {
    id: 'balanceTier',
    nameCs: 'Pevné Zápěstí & Rovnováha',
    nameEn: 'Steady Grip & Pitcher Balance',
    description: 'Greatly reduces pitcher tilting while sprinting and makes [A]/[D] balancing much easier!',
    category: 'character',
    baseCost: 60,
    costMultiplier: 1.45,
    maxLevel: 5,
  },
  bootsTier: {
    id: 'bootsTier',
    nameCs: 'Kožené Škorně',
    nameEn: 'Sturdy Leather Boots',
    description: 'Increases walking & sprinting speed and offsets heavy water slowdown (10 levels total).',
    category: 'character',
    baseCost: 70,
    costMultiplier: 1.45,
    maxLevel: 10,
  },
  flowTier: {
    id: 'flowTier',
    nameCs: 'Široké Hrdlo & Grif',
    nameEn: 'Rapid Dip & Pour Technique',
    description: 'Increases creek dipping and well pouring speed by +40% per level.',
    category: 'character',
    baseCost: 60,
    costMultiplier: 1.5,
    maxLevel: 5,
  },
  rifleUnlock: {
    id: 'rifleUnlock',
    nameCs: 'Myslivecká Puška (+3 Náboje) [5]',
    nameEn: 'Marksman Rifle (+3 Bullets, Max 99)',
    description: 'Gives the Rifle in slot [5] with +3 bullets per purchase (up to 99 max). Shoot other players’ pitchers or forest bears (9 shots within 1 min to kill a bear)!',
    category: 'special',
    baseCost: 90,
    costMultiplier: 1.0,
    maxLevel: 999,
  },
};

export const BASE_WATER_CAPACITY = 50;
export const DEFAULT_WELL_MAX = 5000;

export function calculateWaterCapacity(upgrades: PlayerUpgrades): number {
  return (
    BASE_WATER_CAPACITY +
    upgrades.clayTier * (UPGRADE_CATALOG.clayTier.capacityBonus ?? 40) +
    upgrades.ironTier * (UPGRADE_CATALOG.ironTier.capacityBonus ?? 90) +
    upgrades.funnelTier * (UPGRADE_CATALOG.funnelTier.capacityBonus ?? 180)
  );
}

export function getUpgradeCost(upgrade: UpgradeType, currentLevel: number): number {
  const def = UPGRADE_CATALOG[upgrade];
  if (upgrade === 'rifleUnlock') {
    return def.baseCost;
  }
  return Math.round(def.baseCost * Math.pow(def.costMultiplier, currentLevel));
}

export function getMoveSpeedMultiplier(
  waterCarried: number,
  waterCapacity: number,
  bootsTier: number
): number {
  const baseSpeedBoost = 1 + bootsTier * 0.12;
  const fillRatio = waterCapacity > 0 ? waterCarried / waterCapacity : 0;
  const heavyLoadFactor = Math.min(1, waterCarried / 450);
  const penaltyReduction = Math.max(0.1, 1 - bootsTier * 0.09);
  const weightPenalty = (fillRatio * 0.42 + heavyLoadFactor * 0.23) * penaltyReduction;
  return Math.max(0.38, baseSpeedBoost * (1 - weightPenalty));
}

export function getFlowRatePerSecond(flowTier: number, waterCapacity: number): number {
  return (38 + waterCapacity * 0.14) * (1 + flowTier * 0.42);
}
