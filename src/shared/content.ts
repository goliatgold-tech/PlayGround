/**
 * Data-driven content registry.
 *
 * Everything the game knows about items, factions, fruits, NPCs and ship upgrades
 * lives here. Adding content means adding an entry — no system code changes.
 * In a production build this module would be hydrated from JSON/CMS/database;
 * the shape is already serialisable, so that swap is mechanical.
 */

import type { FactionId, FruitId, NpcType, Rarity } from './types';

export interface ItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  value: number;
  stack: number;
  description: string;
}

export const ITEMS: Record<string, ItemDef> = {
  cannonball: { id: 'cannonball', name: 'Kanonenkugel', rarity: 'common', value: 2, stack: 200, description: 'Munition für alle Bordkanonen.' },
  rum: { id: 'rum', name: 'Flasche Rum', rarity: 'common', value: 8, stack: 20, description: 'Heilt 25 HP. Fragwürdige Qualität.' },
  driftwood: { id: 'driftwood', name: 'Treibholz', rarity: 'common', value: 3, stack: 50, description: 'Reparaturmaterial für den Rumpf.' },
  marine_insignia: { id: 'marine_insignia', name: 'Marine-Abzeichen', rarity: 'uncommon', value: 25, stack: 20, description: 'Beweis für erledigte Patrouillen.' },
  kraken_ink: { id: 'kraken_ink', name: 'Kraken-Tinte', rarity: 'epic', value: 220, stack: 5, description: 'Tinte des Tiefenwächters. Schwarzer Markt zahlt gut.' },
  ancient_coin: { id: 'ancient_coin', name: 'Antike Münze', rarity: 'legendary', value: 900, stack: 1, description: 'Aus einer versunkenen Zivilisation.' },
};

export interface FactionDef {
  id: FactionId;
  name: string;
  color: number;
  accent: number;
  enemies: FactionId[];
  homeX: number;
  homeZ: number;
  blurb: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  pirate: {
    id: 'pirate',
    name: 'Piraten',
    color: 0x2b2b33,
    accent: 0xd9483b,
    enemies: ['marine'],
    homeX: -175,
    homeZ: 232,
    blurb: 'Freiheit, Kopfgeld und der Schwarze Markt.',
  },
  marine: {
    id: 'marine',
    name: 'Marine',
    color: 0x1f3f6b,
    accent: 0x9fd3ff,
    enemies: ['pirate'],
    homeX: 175,
    homeZ: 232,
    blurb: 'Ordnung, Sold und der Tempelorden.',
  },
};

export interface FruitSkillDef {
  name: string;
  damage: number;
  cooldownMs: number;
  speed: number;
  radius: number;
}

export interface FruitDef {
  id: FruitId;
  name: string;
  category: 'element' | 'beast' | 'mystic';
  element: string;
  unlockLevel: number;
  color: number;
  skill: FruitSkillDef;
}

export const FRUITS: Record<FruitId, FruitDef> = {
  fire: {
    id: 'fire',
    name: 'Flamma-Frucht',
    category: 'element',
    element: 'Feuer',
    unlockLevel: 3,
    color: 0xff7a1a,
    skill: { name: 'Feuerlanze', damage: 42, cooldownMs: 3500, speed: 150, radius: 10 },
  },
};

export interface NpcLootDef {
  itemId: string;
  chance: number;
  min: number;
  max: number;
}

export interface NpcDef {
  type: NpcType;
  name: string;
  faction: FactionId;
  hp: number;
  damage: number;
  xp: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldownMs: number;
  gold: number;
  bounty: number;
  scale: number;
  color: number;
  loot: NpcLootDef[];
}

export const NPCS: Record<NpcType, NpcDef> = {
  marine_grunt: {
    type: 'marine_grunt',
    name: 'Marine-Patrouille',
    faction: 'marine',
    hp: 70,
    damage: 9,
    xp: 45,
    speed: 15,
    aggroRange: 210,
    attackRange: 150,
    attackCooldownMs: 1500,
    gold: 12,
    bounty: 20,
    scale: 0.85,
    color: 0x35598a,
    loot: [
      { itemId: 'marine_insignia', chance: 0.45, min: 1, max: 1 },
      { itemId: 'cannonball', chance: 0.7, min: 3, max: 8 },
    ],
  },
  marine_captain: {
    type: 'marine_captain',
    name: 'Marine-Kapitän',
    faction: 'marine',
    hp: 190,
    damage: 16,
    xp: 130,
    speed: 13,
    aggroRange: 240,
    attackRange: 170,
    attackCooldownMs: 1300,
    gold: 45,
    bounty: 90,
    scale: 1.15,
    color: 0x244a7d,
    loot: [
      { itemId: 'marine_insignia', chance: 1, min: 1, max: 2 },
      { itemId: 'rum', chance: 0.5, min: 1, max: 2 },
    ],
  },
  boss_kraken: {
    type: 'boss_kraken',
    name: 'Tiefenwächter',
    faction: 'marine',
    hp: 900,
    damage: 26,
    xp: 900,
    speed: 10,
    aggroRange: 185,
    attackRange: 170,
    attackCooldownMs: 1800,
    gold: 260,
    bounty: 500,
    scale: 2.4,
    color: 0x0d1b2a,
    loot: [
      { itemId: 'kraken_ink', chance: 1, min: 1, max: 2 },
      { itemId: 'ancient_coin', chance: 0.25, min: 1, max: 1 },
    ],
  },
};

export interface ShipUpgradeDef {
  id: 'hull' | 'cannons' | 'crew';
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
}

export const SHIP_UPGRADES: ShipUpgradeDef[] = [
  { id: 'hull', name: 'Rumpf', description: '+20 max. HP pro Stufe', maxLevel: 5, baseCost: 60, costGrowth: 1.6 },
  { id: 'cannons', name: 'Kanonen', description: '+3 Schaden pro Stufe', maxLevel: 5, baseCost: 80, costGrowth: 1.7 },
  { id: 'crew', name: 'Crew', description: '-12% Nachladezeit pro Stufe', maxLevel: 5, baseCost: 70, costGrowth: 1.6 },
];

export const upgradeCost = (def: ShipUpgradeDef, currentLevel: number): number =>
  Math.round(def.baseCost * Math.pow(def.costGrowth, Math.max(0, currentLevel - 1)));

/** XP required to advance *from* `level` to `level + 1`. */
export const xpForLevel = (level: number): number => Math.floor(90 * Math.pow(level, 1.45));

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#c8d0da',
  uncommon: '#6fd36f',
  rare: '#5aa9ff',
  epic: '#c07bff',
  legendary: '#ffb648',
};
