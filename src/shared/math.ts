/** Small vector / angle helpers used by both sides. */

export interface Vec2 {
  x: number;
  z: number;
}

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};

export const distSq = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

export const normalize = (x: number, z: number): Vec2 => {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 0 };
  return { x: x / len, z: z / len };
};

/** Heading in radians around the Y axis, matching Three.js `rotation.y`. */
export const headingTo = (fromX: number, fromZ: number, toX: number, toZ: number): number =>
  Math.atan2(toX - fromX, toZ - fromZ);

export const angleDelta = (a: number, b: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Keep a ship inside the ocean ring and outside the island.
 * Used by both the server simulation and the client prediction so they agree.
 */
export function clampToPlayable(x: number, z: number, worldRadius: number, islandRadius: number): Vec2 {
  const r = Math.hypot(x, z);
  if (r > worldRadius) {
    return { x: (x / r) * worldRadius, z: (z / r) * worldRadius };
  }
  if (r < islandRadius) {
    if (r < 1e-3) return { x: 0, z: islandRadius };
    return { x: (x / r) * islandRadius, z: (z / r) * islandRadius };
  }
  return { x, z };
}
