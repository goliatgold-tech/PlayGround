// Shared rules used by the browser client and the Node server.
// Pure JS on purpose: no DOM, no three.js, deterministic where it matters.

export const SEA_LIMIT = 1500;
export const MAX_LEVEL = 50;

export const RARITY = {
  common: { label: 'Gewöhnlich', color: '#b9c4c9', power: 1 },
  uncommon: { label: 'Ungewöhnlich', color: '#7fdc8f', power: 1.6 },
  rare: { label: 'Selten', color: '#6fb6ff', power: 2.4 },
  epic: { label: 'Episch', color: '#c08cff', power: 3.4 },
  legendary: { label: 'Legendär', color: '#ffc65c', power: 5 }
};

export function xpForLevel(level) {
  return Math.round(120 * Math.pow(level, 1.55));
}

export function levelFromXp(xp) {
  let level = 1;
  let rest = xp;
  while (level < MAX_LEVEL && rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level += 1;
  }
  return { level, rest, need: xpForLevel(level) };
}

export function clampSea(x, z) {
  const d = Math.hypot(x, z);
  if (d <= SEA_LIMIT) return { x, z };
  const s = SEA_LIMIT / d;
  return { x: x * s, z: z * s };
}

export function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Small deterministic PRNG so loot tables are testable.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOOT_POOL = [
  { id: 'treibholz', count: [2, 6], weight: 26 },
  { id: 'kanonenkugel', count: [4, 10], weight: 22 },
  { id: 'segeltuch', count: [1, 4], weight: 16 },
  { id: 'rum', count: [1, 2], weight: 14 },
  { id: 'eisenbarren', count: [1, 3], weight: 12 },
  { id: 'koralle', count: [1, 2], weight: 6 },
  { id: 'obsidian', count: [1, 1], weight: 4 },
  { id: 'tempelrelikt', count: [1, 1], weight: 2 },
  { id: 'kartenfragment', count: [1, 1], weight: 1.4 },
  { id: 'urlaubsfrucht', count: [1, 1], weight: 0.6 }
];

export function rollLoot(enemy, rng = Math.random) {
  const rolls = enemy.boss ? 3 : 1;
  const drops = [];
  for (let i = 0; i < rolls; i++) {
    const total = LOOT_POOL.reduce((s, e) => s + e.weight, 0);
    let pick = rng() * total;
    for (const entry of LOOT_POOL) {
      pick -= entry.weight;
      if (pick <= 0) {
        const [lo, hi] = entry.count;
        const count = lo + Math.floor(rng() * (hi - lo + 1));
        const existing = drops.find((d) => d.id === entry.id);
        if (existing) existing.count += count;
        else drops.push({ id: entry.id, count });
        break;
      }
    }
  }
  return {
    drops,
    gold: Math.round((enemy.gold || 20) * (0.8 + rng() * 0.6)),
    xp: Math.round((enemy.xp || 20) * (0.9 + rng() * 0.2))
  };
}

export function cannonDamage(base, skills = {}, fruitPassive = 0) {
  const powder = 1 + 0.07 * (skills.pulverfaust || 0);
  const crit = skills.meisterschuetze ? (Math.random() < 0.12 ? 2 : 1) : 1;
  return Math.round(base * powder * (1 + fruitPassive) * crit);
}
