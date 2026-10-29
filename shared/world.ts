// Deterministic world math shared between 3D terrain mesh, player physics, and AI bots
// Expanded map: ~240 meters from Hilltop Well (z = -112) to Valley Spring (z = +112)

export const WORLD_LOCATIONS = {
  WELL: { x: 0, z: -112, radius: 3.2, interactRadius: 6.0 },
  MERCHANT: { x: 12.5, z: -103, radius: 3.0, interactRadius: 5.8 },
  SPAWN_CENTER: { x: 0, z: -98 },
  SPRING_Z_MIN: 102,
  SPRING_Z_MAX: 122,
};

/**
 * Returns the X coordinate of the long winding downhill forest path for a given Z coordinate.
 * Features multiple switchback S-curves between the Hilltop Hub (z <= -92) and Valley Spring (z >= 102).
 */
export function getPathCenterX(z: number): number {
  if (z <= -94) return 0;
  if (z >= 106) return 0;
  const t = (z - -94) / (106 - -94); // 0 at hilltop, 1 at valley
  const envelope = Math.sin(t * Math.PI); // Smooth 0 at ends, 1 in middle
  // Multi-frequency switchbacks so the trail snakes dramatically down the mountain
  return (
    (Math.sin(z * 0.052 + 0.4) * 18.0 + Math.cos(z * 0.11 - 0.8) * 6.5) *
    envelope
  );
}

/**
 * Returns the half-width of the walkable dirt trail at a given Z.
 */
export function getPathHalfWidth(z: number): number {
  if (z < -90) {
    const hubDist = Math.hypot(0, z - -106);
    if (hubDist < 20) return 20;
  }
  if (z > 98) {
    return 18;
  }
  return 4.0;
}

/**
 * Deterministic terrain elevation Y at world coordinates (x, z).
 * - Hilltop Hub (z around -120 to -92): elevated plateau around y = 26.0
 * - Winding Slope (z from -92 to +98): long descent from y = 26.0 down to y = 0.5
 * - Valley Spring (z from +98 to +125): creek bed dipping down to y = -0.45 in the water channel
 */
export function getTerrainHeight(x: number, z: number): number {
  let baseElevation = 0;
  if (z <= -92) {
    baseElevation = 26.0;
  } else if (z >= 98) {
    baseElevation = 0.45;
  } else {
    const t = (z - -92) / (98 - -92);
    const smoothT = t * t * (3 - 2 * t);
    // Add two subtle terrace undulations along the long mountain slope
    const terraceRipple = Math.sin(t * Math.PI * 4) * 0.65 * Math.sin(t * Math.PI);
    baseElevation = 26.0 * (1 - smoothT) + 0.45 * smoothT + terraceRipple;
  }

  const pathX = getPathCenterX(z);
  const distFromPath = Math.abs(x - pathX);
  const distFromHub = Math.hypot(x, z - -106);

  let lateralMound = 0;
  if (z < -90 && distFromHub < 19.5) {
    const edgeFactor = Math.max(0, (distFromHub - 14.5) / 5.0);
    lateralMound = edgeFactor * edgeFactor * 1.2;
  } else if (z >= -90 && z <= 98) {
    const offTrail = Math.max(0, distFromPath - 3.2);
    const bankRise = Math.min(7.5, offTrail * 0.28);
    const organicWave =
      Math.sin(x * 0.11 + z * 0.08) * 0.95 +
      Math.cos(x * 0.21 - z * 0.14) * 0.45;
    lateralMound = bankRise + (offTrail > 1 ? organicWave * Math.min(1, offTrail / 5) : 0);
  } else if (z > 98) {
    // Creek channel depression around z = 112
    const creekCenterZ = 112.0 + Math.sin(x * 0.1) * 1.8;
    const distFromCreek = Math.abs(z - creekCenterZ);
    if (distFromCreek < 5.5) {
      const dip = Math.cos((distFromCreek / 5.5) * (Math.PI / 2));
      baseElevation -= dip * 0.85;
    } else if (z > 117.5) {
      baseElevation += (z - 117.5) * 0.32;
    }
    const sideBank = Math.max(0, Math.abs(x) - 18) * 0.25;
    lateralMound = sideBank;
  }

  const outerX = Math.max(0, Math.abs(x) - 42);
  const outerZBack = Math.max(0, -126 - z);
  const outerRim = outerX * 0.4 + outerZBack * 0.5;

  return baseElevation + lateralMound + outerRim;
}

/**
 * Water surface elevation at the Valley Spring.
 */
export const SPRING_WATER_LEVEL = 0.08;

/**
 * Checks if position (x, z) is standing in the Valley Spring water to refill the pitcher.
 */
export function isInSpringWater(x: number, z: number): boolean {
  if (Math.abs(x) > 22) return false;
  const creekCenterZ = 112.0 + Math.sin(x * 0.1) * 1.8;
  return Math.abs(z - creekCenterZ) < 5.5;
}

/**
 * Checks if position (x, z) is within pouring range of the Hilltop Well.
 */
export function isNearWell(x: number, z: number): boolean {
  const dist = Math.hypot(x - WORLD_LOCATIONS.WELL.x, z - WORLD_LOCATIONS.WELL.z);
  return dist <= WORLD_LOCATIONS.WELL.interactRadius;
}

/**
 * Checks if position (x, z) is within shopping range of the Merchant Stall.
 */
export function isNearMerchant(x: number, z: number): boolean {
  const dist = Math.hypot(x - WORLD_LOCATIONS.MERCHANT.x, z - WORLD_LOCATIONS.MERCHANT.z);
  return dist <= WORLD_LOCATIONS.MERCHANT.interactRadius;
}

/**
 * Checks if position (x, z) is safely on the road, hilltop plaza, or creek clearing.
 * When false, the player has stepped off the road into the forest where the 2 bears roam!
 */
export function isOnRoad(x: number, z: number): boolean {
  // Hilltop Hub plaza (around Well & Merchant)
  if (z < -90) {
    const hubDist = Math.hypot(x, z - -105);
    if (hubDist <= 16.5) return true;
  }
  // Valley Spring clearing
  if (z > 98 && Math.abs(x) <= 17.5) {
    return true;
  }
  // Winding mountain road corridor
  const pathX = getPathCenterX(z);
  return Math.abs(x - pathX) <= 4.1;
}

/**
 * Returns which forest side ('west' for -X, 'east' for +X, or null if on the road) the player is in.
 */
export function getForestSide(x: number, z: number): 'west' | 'east' | null {
  if (isOnRoad(x, z)) return null;
  const pathX = getPathCenterX(z);
  return x < pathX ? 'west' : 'east';
}

export interface TreeInstanceData {
  id: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotY: number;
  tintIndex: number;
  trunkRadius: number;
}

export interface RockInstanceData {
  id: number;
  idKey?: number;
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  radius: number;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateWorldProps(): {
  trees: TreeInstanceData[];
  rocks: RockInstanceData[];
} {
  const rand = mulberry32(9876543);
  const trees: TreeInstanceData[] = [];
  const rocks: RockInstanceData[] = [];

  // Generate ~450 low-poly pine trees across the expanded mountain valley
  let treeId = 0;
  for (let i = 0; i < 620; i++) {
    const x = (rand() - 0.5) * 96;
    const z = -128 + rand() * 256;

    const distWell = Math.hypot(x - WORLD_LOCATIONS.WELL.x, z - WORLD_LOCATIONS.WELL.z);
    const distMerchant = Math.hypot(
      x - WORLD_LOCATIONS.MERCHANT.x,
      z - WORLD_LOCATIONS.MERCHANT.z
    );
    const distHub = Math.hypot(x, z - -106);
    if (distWell < 13 || distMerchant < 9 || (z < -90 && distHub < 15)) continue;

    const pathX = getPathCenterX(z);
    if (z >= -95 && z <= 105 && Math.abs(x - pathX) < 5.0) continue;

    const creekZ = 112.0 + Math.sin(x * 0.1) * 1.8;
    if (Math.abs(z - creekZ) < 7.0 && Math.abs(x) < 24) continue;

    const y = getTerrainHeight(x, z);
    const scale = 0.8 + rand() * 0.85;

    trees.push({
      id: treeId++,
      x,
      y,
      z,
      scale,
      rotY: rand() * Math.PI * 2,
      tintIndex: Math.floor(rand() * 4),
      trunkRadius: 0.45 * scale,
    });
  }

  // Generate ~220 low-poly boulders along the long winding trail and valley
  let rockId = 0;
  for (let i = 0; i < 280; i++) {
    const x = (rand() - 0.5) * 86;
    const z = -124 + rand() * 248;

    const distWell = Math.hypot(x - WORLD_LOCATIONS.WELL.x, z - WORLD_LOCATIONS.WELL.z);
    const distMerchant = Math.hypot(
      x - WORLD_LOCATIONS.MERCHANT.x,
      z - WORLD_LOCATIONS.MERCHANT.z
    );
    if (distWell < 10 || distMerchant < 7.5) continue;

    const pathX = getPathCenterX(z);
    if (Math.abs(x - pathX) < 3.8) continue;

    const y = getTerrainHeight(x, z);
    const baseScale = 0.6 + rand() * 1.3;

    rocks.push({
      id: rockId++,
      x,
      y: y - 0.15,
      z,
      scaleX: baseScale * (0.8 + rand() * 0.5),
      scaleY: baseScale * (0.65 + rand() * 0.5),
      scaleZ: baseScale * (0.8 + rand() * 0.5),
      rotX: rand() * 0.5,
      rotY: rand() * Math.PI * 2,
      rotZ: rand() * 0.5,
      radius: baseScale * 0.7,
    });
  }

  return { trees, rocks };
}

export const WORLD_PROPS = generateWorldProps();
