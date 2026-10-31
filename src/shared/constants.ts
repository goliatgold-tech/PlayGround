/**
 * Shared tuning constants. Imported by both the authoritative server and the client
 * so that prediction and simulation never drift apart.
 */

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = 10;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

export const WORLD_RADIUS = 900;
export const ISLAND_RADIUS = 150;
export const ISLAND_EXCLUSION = ISLAND_RADIUS + 26;
export const ISLAND_HEIGHT = 14;
export const CAVE = { x: 62, z: 184, radius: 26 };
export const DOCK = { x: -30, z: 190 };
export const DOCK_RADIUS = 80;

export const MAX_PLAYERS = 64;

export const PLAYER_SPEED = 30; // units per second
export const PLAYER_MAX_HP = 100;
export const PLAYER_RADIUS = 6;

export const CANNON_RANGE = 280;
export const CANNON_COOLDOWN_MS = 850;
export const CANNON_SPEED = 190;
export const CANNON_DAMAGE = 14;

export const FIREBALL_SPEED = 150;
export const FIREBALL_RADIUS = 10;

export const RESPAWN_MS = 5000;
export const NPC_RESPAWN_MS = 20000;

export const INTERACT_RADIUS = 26;
export const CHAT_MAX_LEN = 140;
