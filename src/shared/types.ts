/** Wire + simulation types shared by server and client. */

export type FactionId = 'pirate' | 'marine';
export type FruitId = 'fire';
export type NpcType = 'marine_grunt' | 'marine_captain' | 'boss_kraken';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ProjectileKind = 'cannon' | 'fireball';

export interface InventoryStack {
  itemId: string;
  count: number;
}

export interface ShipState {
  hull: number;
  cannons: number;
  crew: number;
}

export interface PlayerState {
  id: string;
  name: string;
  faction: FactionId;
  x: number;
  z: number;
  rot: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpNext: number;
  fruit: FruitId | null;
  gold: number;
  bounty: number;
  inventory: InventoryStack[];
  ship: ShipState;
  alive: boolean;
  respawnAt: number;
  lastAttackAt: number;
  lastSkillAt: number;
}

export interface NpcState {
  id: string;
  type: NpcType;
  faction: FactionId;
  x: number;
  z: number;
  rot: number;
  hp: number;
  maxHp: number;
  level: number;
  alive: boolean;
  respawnAt: number;
  homeX: number;
  homeZ: number;
  lastAttackAt: number;
  aggroId: string | null;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  kind: ProjectileKind;
  faction: FactionId;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  ttl: number;
}

export interface Snapshot {
  t: number;
  players: PlayerState[];
  npcs: NpcState[];
  projectiles: ProjectileState[];
}

export interface InputState {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  aimX: number;
  aimZ: number;
}

export type ClientMessage =
  | { type: 'join'; name: string; faction: FactionId; token: string }
  | { type: 'input'; input: InputState }
  | { type: 'attack' }
  | { type: 'skill' }
  | { type: 'dock'; stat: 'hull' | 'cannons' | 'crew' }
  | { type: 'chat'; text: string }
  | { type: 'respawn' };

export type ServerMessage =
  | { type: 'welcome'; playerId: string; token: string; snapshot: Snapshot }
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'chat'; from: string; text: string; faction: FactionId | null }
  | { type: 'event'; kind: 'info' | 'loot' | 'levelup' | 'death' | 'combat'; text: string }
  | { type: 'levelup'; level: number }
  | { type: 'error'; text: string };
