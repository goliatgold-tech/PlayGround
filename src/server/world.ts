/**
 * Authoritative world simulation.
 *
 * The client only sends *intents* (movement flags, aim vector, "attack", "skill").
 * Every position, hit, death, loot roll and level-up is decided here.
 * That keeps the client honest and makes the netcode trivial to reason about.
 */

import { randomUUID } from 'node:crypto';
import * as C from '../shared/constants';
import { FACTIONS, FRUITS, ITEMS, NPCS, SHIP_UPGRADES, upgradeCost, xpForLevel } from '../shared/content';
import { clampToPlayable, dist2, headingTo, normalize } from '../shared/math';
import type {
  ClientMessage,
  FactionId,
  FruitId,
  InputState,
  InventoryStack,
  NpcState,
  NpcType,
  PlayerState,
  ProjectileState,
  ServerMessage,
  ShipState,
  Snapshot,
} from '../shared/types';

export interface PlayerSave {
  name: string;
  faction: FactionId;
  level: number;
  xp: number;
  gold: number;
  bounty: number;
  fruit: FruitId | null;
  inventory: InventoryStack[];
  ship: ShipState;
}

type Emit = (msg: ServerMessage) => void;

const emptyInput = (): InputState => ({
  seq: 0,
  up: false,
  down: false,
  left: false,
  right: false,
  aimX: 0,
  aimZ: 0,
});

export class World {
  readonly players = new Map<string, PlayerState>();
  readonly npcs = new Map<string, NpcState>();
  readonly projectiles = new Map<string, ProjectileState>();
  private readonly inputs = new Map<string, InputState>();
  private emit: Emit = () => {};

  constructor(emit?: Emit) {
    if (emit) this.emit = emit;
    this.seedNpcs();
  }

  setEmitter(emit: Emit): void {
    this.emit = emit;
  }

  // ---------------------------------------------------------------- spawning

  private seedNpcs(): void {
    const marineHome = FACTIONS.marine;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.spawnNpc('marine_grunt', marineHome.homeX + Math.cos(a) * 70, marineHome.homeZ + Math.sin(a) * 70);
    }
    this.spawnNpc('marine_captain', 210, 40);
    this.spawnNpc('boss_kraken', C.CAVE.x, C.CAVE.z);
  }

  spawnNpc(type: NpcType, x: number, z: number): NpcState {
    const def = NPCS[type];
    const npc: NpcState = {
      id: `npc_${randomUUID().slice(0, 8)}`,
      type,
      faction: def.faction,
      x,
      z,
      rot: 0,
      hp: def.hp,
      maxHp: def.hp,
      level: type === 'boss_kraken' ? 12 : type === 'marine_captain' ? 5 : 2,
      alive: true,
      respawnAt: 0,
      homeX: x,
      homeZ: z,
      lastAttackAt: 0,
      aggroId: null,
    };
    this.npcs.set(npc.id, npc);
    return npc;
  }

  addPlayer(id: string, name: string, faction: FactionId, save?: PlayerSave): PlayerState {
    const home = FACTIONS[faction];
    const level = save?.level ?? 1;
    const ship = save?.ship ?? { hull: 1, cannons: 1, crew: 1 };
    const maxHp = this.maxHpFor(level, ship);
    const player: PlayerState = {
      id,
      name: (save?.name ?? name).slice(0, 16) || 'Kapitän',
      faction,
      x: home.homeX + (Math.random() - 0.5) * 60,
      z: home.homeZ + (Math.random() - 0.5) * 60,
      rot: Math.PI,
      hp: maxHp,
      maxHp,
      level,
      xp: save?.xp ?? 0,
      xpNext: xpForLevel(level),
      fruit: save?.fruit ?? null,
      gold: save?.gold ?? 0,
      bounty: save?.bounty ?? 0,
      inventory: save?.inventory ? save.inventory.map((s) => ({ ...s })) : [],
      ship: { ...ship },
      alive: true,
      respawnAt: 0,
      lastAttackAt: 0,
      lastSkillAt: 0,
    };
    this.players.set(id, player);
    this.inputs.set(id, emptyInput());
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.inputs.delete(id);
  }

  // ---------------------------------------------------------------- messages

  handleMessage(playerId: string, msg: ClientMessage): void {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case 'input':
        this.inputs.set(playerId, msg.input);
        break;
      case 'attack':
        this.tryAttack(player);
        break;
      case 'skill':
        this.trySkill(player);
        break;
      case 'dock':
        this.tryUpgrade(player, msg.stat);
        break;
      case 'respawn':
        if (!player.alive && Date.now() >= player.respawnAt) this.respawnPlayer(player);
        break;
      case 'chat': {
        const text = msg.text.trim().slice(0, C.CHAT_MAX_LEN);
        if (text) this.emit({ type: 'chat', from: player.name, text, faction: player.faction });
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- combat

  private cannonCooldown(player: PlayerState): number {
    return C.CANNON_COOLDOWN_MS * (1 - 0.12 * (player.ship.crew - 1));
  }

  private cannonDamage(player: PlayerState): number {
    return C.CANNON_DAMAGE + (player.ship.cannons - 1) * 3;
  }

  private tryAttack(player: PlayerState): void {
    if (!player.alive) return;
    const now = Date.now();
    if (now - player.lastAttackAt < this.cannonCooldown(player)) return;
    player.lastAttackAt = now;

    const aim = this.aimOf(player.id);
    let dir = normalize(aim.x, aim.z);
    if (dir.x === 0 && dir.z === 0) dir = { x: Math.sin(player.rot), z: Math.cos(player.rot) };

    this.spawnProjectile({
      ownerId: player.id,
      kind: 'cannon',
      faction: player.faction,
      x: player.x + dir.x * 10,
      z: player.z + dir.z * 10,
      vx: dir.x * C.CANNON_SPEED,
      vz: dir.z * C.CANNON_SPEED,
      damage: this.cannonDamage(player),
      ttl: (C.CANNON_RANGE / C.CANNON_SPEED) * 1000,
    });
  }

  private trySkill(player: PlayerState): void {
    if (!player.alive || !player.fruit) return;
    const fruit = FRUITS[player.fruit];
    if (player.level < fruit.unlockLevel) return;
    const now = Date.now();
    if (now - player.lastSkillAt < fruit.skill.cooldownMs) return;
    player.lastSkillAt = now;

    const aim = this.aimOf(player.id);
    let dir = normalize(aim.x, aim.z);
    if (dir.x === 0 && dir.z === 0) dir = { x: Math.sin(player.rot), z: Math.cos(player.rot) };

    this.spawnProjectile({
      ownerId: player.id,
      kind: 'fireball',
      faction: player.faction,
      x: player.x + dir.x * 12,
      z: player.z + dir.z * 12,
      vx: dir.x * fruit.skill.speed,
      vz: dir.z * fruit.skill.speed,
      damage: fruit.skill.damage,
      ttl: 2600,
    });
    this.emit({ type: 'event', kind: 'combat', text: `${player.name} wirkt ${fruit.skill.name}!` });
  }

  private aimOf(playerId: string): { x: number; z: number } {
    const input = this.inputs.get(playerId);
    if (!input) return { x: 0, z: 0 };
    return { x: input.aimX, z: input.aimZ };
  }

  private spawnProjectile(p: Omit<ProjectileState, 'id'>): void {
    const proj: ProjectileState = { ...p, id: `pr_${randomUUID().slice(0, 8)}` };
    this.projectiles.set(proj.id, proj);
  }

  private hitRadius(kind: ProjectileState['kind']): number {
    return kind === 'fireball' ? C.FIREBALL_RADIUS : 7;
  }

  // ---------------------------------------------------------------- tick

  update(dtMs: number, now: number): void {
    const dt = dtMs / 1000;

    for (const player of this.players.values()) this.updatePlayer(player, dt, now);
    for (const npc of this.npcs.values()) this.updateNpc(npc, dt, now);
    this.updateProjectiles(dt, now);
  }

  private updatePlayer(player: PlayerState, dt: number, now: number): void {
    if (!player.alive) {
      if (now >= player.respawnAt) this.respawnPlayer(player);
      return;
    }

    const input = this.inputs.get(player.id) ?? emptyInput();
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dz = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 || dz !== 0) {
      const dir = normalize(dx, dz);
      player.x += dir.x * C.PLAYER_SPEED * dt;
      player.z += dir.z * C.PLAYER_SPEED * dt;
      player.rot = headingTo(0, 0, dir.x, dir.z);
    }

    // Keep everyone inside the playable ocean ring and off the island.
    const fixed = clampToPlayable(player.x, player.z, C.WORLD_RADIUS, C.ISLAND_EXCLUSION);
    player.x = fixed.x;
    player.z = fixed.z;

    // Slow out-of-combat regeneration so the slice is survivable.
    if (now - player.lastAttackAt > 6000 && now - player.lastSkillAt > 6000) {
      player.hp = Math.min(player.maxHp, player.hp + 4 * dt);
    }
  }

  private updateNpc(npc: NpcState, dt: number, now: number): void {
    if (!npc.alive) {
      if (now >= npc.respawnAt) {
        npc.alive = true;
        npc.hp = npc.maxHp;
        npc.x = npc.homeX;
        npc.z = npc.homeZ;
        npc.aggroId = null;
      }
      return;
    }

    const def = NPCS[npc.type];

    // Acquire / validate target.
    let target = npc.aggroId ? this.players.get(npc.aggroId) : undefined;
    if (!target || !target.alive || target.faction === npc.faction || dist2(npc.x, npc.z, target.x, target.z) > def.aggroRange * 1.35) {
      target = undefined;
      npc.aggroId = null;
      let best = def.aggroRange;
      for (const p of this.players.values()) {
        if (!p.alive || p.faction === npc.faction) continue;
        const d = dist2(npc.x, npc.z, p.x, p.z);
        if (d < best) {
          best = d;
          target = p;
        }
      }
      if (target) npc.aggroId = target.id;
    }

    if (target) {
      const d = dist2(npc.x, npc.z, target.x, target.z);
      npc.rot = headingTo(npc.x, npc.z, target.x, target.z);
      if (d > def.attackRange) {
        const dir = normalize(target.x - npc.x, target.z - npc.z);
        npc.x += dir.x * def.speed * dt;
        npc.z += dir.z * def.speed * dt;
      } else if (now - npc.lastAttackAt >= def.attackCooldownMs) {
        npc.lastAttackAt = now;
        const dir = normalize(target.x - npc.x, target.z - npc.z);
        this.spawnProjectile({
          ownerId: npc.id,
          kind: 'cannon',
          faction: npc.faction,
          x: npc.x + dir.x * 10,
          z: npc.z + dir.z * 10,
          vx: dir.x * C.CANNON_SPEED * 0.85,
          vz: dir.z * C.CANNON_SPEED * 0.85,
          damage: def.damage,
          ttl: (def.attackRange / (C.CANNON_SPEED * 0.85)) * 1000 + 400,
        });
      }
      return;
    }

    // Idle patrol around the spawn point.
    const orbit = now / 4000 + npc.homeX * 0.01;
    const px = npc.homeX + Math.cos(orbit) * 22;
    const pz = npc.homeZ + Math.sin(orbit) * 22;
    const dir = normalize(px - npc.x, pz - npc.z);
    npc.x += dir.x * def.speed * 0.25 * dt;
    npc.z += dir.z * def.speed * 0.25 * dt;
    if (dir.x !== 0 || dir.z !== 0) npc.rot = headingTo(0, 0, dir.x, dir.z);
  }

  private updateProjectiles(dt: number, now: number): void {
    for (const proj of [...this.projectiles.values()]) {
      proj.ttl -= dt * 1000;
      if (proj.ttl <= 0) {
        this.projectiles.delete(proj.id);
        continue;
      }
      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;

      const radius = this.hitRadius(proj.kind);
      let consumed = false;

      // Player targets.
      for (const target of this.players.values()) {
        if (!target.alive || target.faction === proj.faction) continue;
        if (dist2(proj.x, proj.z, target.x, target.z) > radius + C.PLAYER_RADIUS) continue;
        this.damagePlayer(target, proj.damage, proj.ownerId);
        consumed = true;
        break;
      }

      // NPC targets.
      if (!consumed) {
        for (const npc of this.npcs.values()) {
          if (!npc.alive || npc.faction === proj.faction) continue;
          if (dist2(proj.x, proj.z, npc.x, npc.z) > radius + 8) continue;
          this.damageNpc(npc, proj.damage, proj.ownerId);
          consumed = true;
          break;
        }
      }

      if (consumed) this.projectiles.delete(proj.id);
    }
  }

  private damagePlayer(target: PlayerState, amount: number, ownerId: string): void {
    target.hp -= amount;
    if (target.hp > 0) return;

    target.hp = 0;
    target.alive = false;
    target.respawnAt = Date.now() + C.RESPAWN_MS;

    const killer = this.players.get(ownerId);
    if (killer && killer.faction !== target.faction) {
      killer.bounty += 25;
      killer.gold += 20;
      this.grantXp(killer, 40);
      this.emit({ type: 'event', kind: 'death', text: `${killer.name} versenkte ${target.name}.` });
    } else {
      this.emit({ type: 'event', kind: 'death', text: `${target.name} wurde versenkt.` });
    }
  }

  private damageNpc(npc: NpcState, amount: number, ownerId: string): void {
    npc.hp -= amount;
    if (npc.hp > 0) return;

    npc.hp = 0;
    npc.alive = false;
    npc.respawnAt = Date.now() + C.NPC_RESPAWN_MS;
    npc.aggroId = null;

    const def = NPCS[npc.type];
    const killer = this.players.get(ownerId);
    if (!killer) return;

    killer.gold += def.gold;
    killer.bounty += def.bounty;
    this.grantXp(killer, def.xp);

    const drops: string[] = [];
    for (const loot of def.loot) {
      if (Math.random() > loot.chance) continue;
      const count = loot.min + Math.floor(Math.random() * (loot.max - loot.min + 1));
      this.addItem(killer, loot.itemId, count);
      drops.push(`${count}x ${ITEMS[loot.itemId]?.name ?? loot.itemId}`);
    }

    this.emit({ type: 'event', kind: 'combat', text: `${killer.name} versenkte ${def.name}.` });
    if (drops.length) this.emit({ type: 'event', kind: 'loot', text: `Beute: ${drops.join(', ')}` });
  }

  private respawnPlayer(player: PlayerState): void {
    const home = FACTIONS[player.faction];
    player.alive = true;
    player.hp = player.maxHp;
    player.x = home.homeX;
    player.z = home.homeZ;
    player.rot = Math.PI;
    player.respawnAt = 0;
  }

  // ---------------------------------------------------------------- progression

  private maxHpFor(level: number, ship: ShipState): number {
    return C.PLAYER_MAX_HP + (level - 1) * 5 + (ship.hull - 1) * 20;
  }

  grantXp(player: PlayerState, amount: number): void {
    player.xp += amount;
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.level += 1;
      player.xpNext = xpForLevel(player.level);
      player.maxHp = this.maxHpFor(player.level, player.ship);
      player.hp = player.maxHp;
      if (!player.fruit && player.level >= FRUITS.fire.unlockLevel) {
        player.fruit = 'fire';
        this.emit({ type: 'event', kind: 'levelup', text: `${player.name} erwachte die Flamma-Frucht!` });
      }
      this.emit({ type: 'levelup', level: player.level });
      this.emit({ type: 'event', kind: 'levelup', text: `${player.name} erreichte Level ${player.level}.` });
    }
  }

  addItem(player: PlayerState, itemId: string, count: number): void {
    const def = ITEMS[itemId];
    if (!def) return;
    const stack = player.inventory.find((s) => s.itemId === itemId);
    if (stack) {
      stack.count = Math.min(def.stack, stack.count + count);
    } else {
      player.inventory.push({ itemId, count: Math.min(def.stack, count) });
    }
  }

  // ---------------------------------------------------------------- shipyard

  private tryUpgrade(player: PlayerState, stat: 'hull' | 'cannons' | 'crew'): void {
    if (!player.alive) return;
    if (dist2(player.x, player.z, C.DOCK.x, C.DOCK.z) > C.DOCK_RADIUS) return;

    const def = SHIP_UPGRADES.find((u) => u.id === stat);
    if (!def) return;
    const current = player.ship[stat];
    if (current >= def.maxLevel) {
      this.emit({ type: 'event', kind: 'info', text: `${def.name} ist bereits maximal ausgebaut.` });
      return;
    }
    const cost = upgradeCost(def, current);
    if (player.gold < cost) {
      this.emit({ type: 'event', kind: 'info', text: `Zu wenig Gold (${cost} nötig).` });
      return;
    }

    player.gold -= cost;
    player.ship[stat] = current + 1;
    player.maxHp = this.maxHpFor(player.level, player.ship);
    if (stat === 'hull') player.hp = player.maxHp;
    this.emit({ type: 'event', kind: 'info', text: `${def.name} auf Stufe ${current + 1} ausgebaut (-${cost} Gold).` });
  }

  // ---------------------------------------------------------------- snapshot

  snapshot(now = Date.now()): Snapshot {
    return {
      t: now,
      players: [...this.players.values()].map((p) => ({ ...p, inventory: p.inventory.map((s) => ({ ...s })) })),
      npcs: [...this.npcs.values()].map((n) => ({ ...n })),
      projectiles: [...this.projectiles.values()].map((p) => ({ ...p })),
    };
  }
}
