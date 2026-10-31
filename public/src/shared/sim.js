import { clampSea, dist, angleDiff, rollLoot } from './rules.js';

const TAU = Math.PI * 2;

// Server-authoritative sea simulation. The offline client runs the exact same
// code, which keeps singleplayer and multiplayer behaviour identical.
export class SeaSim {
  constructor({ islands, enemies, rng = Math.random, seed = 1337 }) {
    this.islands = islands;
    this.enemyDefs = enemies;
    this.rng = rng;
    this.seed = seed;
    this.npcs = new Map();
    this.loot = new Map();
    this.players = new Map();
    this.events = [];
    this.nextId = 1;
    this.spawnTimer = 0;
    this.elapsed = 0;
    this.spawnInitial();
  }

  id(prefix) {
    return `${prefix}_${this.nextId++}`;
  }

  spawnInitial() {
    const spots = [
      ['marine_patrol', -160, -430], ['marine_patrol', 300, -520], ['marine_patrol', -620, -120],
      ['pirate_raider', -420, 330], ['pirate_raider', 420, 330], ['pirate_raider', -900, 520],
      ['smuggler', -640, -360], ['smuggler', 860, -60], ['smuggler', -1050, -90],
      ['marine_frigate', -250, -720], ['marine_frigate', 250, 900],
      ['ghost_ship', -980, 600], ['ghost_ship', 780, 980],
      ['pirate_raider', 700, 260], ['marine_patrol', 1000, -260],
      ['marine_patrol', 390, -50], ['pirate_raider', -380, -30]
    ];
    for (const [defId, x, z] of spots) this.spawnNpc(defId, x, z);
    this.spawnNpc('sea_leviathan', 900, 1150, true);
  }

  spawnNpc(defId, x, z, boss = false) {
    const def = this.enemyDefs.find((e) => e.id === defId) || this.enemyDefs[0];
    const npc = {
      id: this.id('npc'),
      defId: def.id,
      name: def.name,
      faction: def.faction,
      boss: Boolean(def.boss || boss),
      ship: def.ship,
      x, z, rot: this.rng() * TAU,
      hp: def.hp, maxHp: def.hp,
      speed: def.speed, turn: def.turn,
      damage: def.damage, range: def.range, aggro: def.aggro,
      xp: def.xp, gold: def.gold,
      patrol: { x, z },
      targetId: null,
      fireCd: 1 + this.rng() * 2,
      state: 'patrol',
      level: def.boss ? 15 : Math.max(1, Math.round(def.hp / 55)),
      alive: true,
      spawnAt: this.elapsed
    };
    this.npcs.set(npc.id, npc);
    this.events.push({ type: 'spawn', npc: this.publicNpc(npc) });
    return npc;
  }

  publicNpc(n) {
    return {
      id: n.id, defId: n.defId, name: n.name, faction: n.faction, boss: n.boss,
      ship: n.ship, x: n.x, z: n.z, rot: n.rot, hp: n.hp, maxHp: n.maxHp,
      level: n.level, state: n.state
    };
  }

  addPlayer(id, { name, faction = 'pirate', x = 0, z = 40, rot = 0, hp = 100, maxHp = 100 }) {
    const p = { id, name, faction, x, z, rot, hp, maxHp, alive: true, hidden: 0, lastHit: 0 };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  setPlayerPos(id, x, z, rot, hp) {
    const p = this.players.get(id);
    if (!p) return;
    const c = clampSea(x, z);
    p.x = c.x; p.z = c.z; p.rot = rot;
    if (typeof hp === 'number') p.hp = Math.max(0, Math.min(p.maxHp, hp));
    p.alive = p.hp > 0;
  }

  player(id) {
    return this.players.get(id) || null;
  }

  tick(dt) {
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;
    this.events.length = 0;

    for (const p of this.players.values()) {
      if (p.hidden > 0) p.hidden = Math.max(0, p.hidden - dt);
      if (!p.alive && this.elapsed - p.lastHit > 6) {
        p.hp = p.maxHp;
        p.alive = true;
        p.x = 0; p.z = 140;
        this.events.push({ type: 'respawn', playerId: p.id, x: p.x, z: p.z });
      }
    }

    for (const npc of this.npcs.values()) {
      if (!npc.alive) {
        if (this.elapsed - npc.sunkAt > 22) this.respawnNpc(npc);
        continue;
      }
      this.stepNpc(npc, dt);
    }

    for (const l of [...this.loot.values()]) {
      l.ttl -= dt;
      l.bob = (l.bob || 0) + dt;
      if (l.ttl <= 0) this.loot.delete(l.id);
    }

    return this.events;
  }

  stepNpc(npc, dt) {
    let target = null;
    let best = Infinity;
    for (const p of this.players.values()) {
      if (!p.alive || p.hidden > 0) continue;
      // harbours are safe zones: NPCs do not camp docks
      let inHarbor = false;
      for (const isl of this.islands) {
        if (dist(p.x, p.z, isl.x, isl.z) < isl.radius + 55) { inHarbor = true; break; }
      }
      if (inHarbor) continue;
      const d = dist(npc.x, npc.z, p.x, p.z);
      if (d < npc.aggro && d < best) { best = d; target = p; }
    }

    npc.targetId = target ? target.id : null;
    let desired = npc.rot;
    let throttle = 0.55;

    if (target) {
      npc.state = 'chase';
      const d = best;
      const toTarget = Math.atan2(target.x - npc.x, target.z - npc.z);
      if (d > npc.range * 0.82) {
        desired = toTarget;
        throttle = 1;
      } else if (d < npc.range * 0.45) {
        desired = toTarget + Math.PI;
        throttle = 0.7;
      } else {
        // circle the target so broadsides keep bearing
        desired = toTarget + Math.PI / 2 * (npc.id.charCodeAt(npc.id.length - 1) % 2 ? 1 : -1);
        throttle = 0.55;
      }
      npc.fireCd -= dt;
      if (npc.fireCd <= 0 && d < npc.range) {
        npc.fireCd = (npc.boss ? 1.9 : 2.8) + this.rng() * 1.2;
        const spread = (this.rng() - 0.5) * 0.16;
        const hitChance = npc.boss ? 0.82 : 0.62;
        const hit = this.rng() < hitChance;
        this.events.push({
          type: 'shot',
          npcId: npc.id,
          from: { x: npc.x, z: npc.z },
          to: { x: target.x + (this.rng() - 0.5) * 30, z: target.z + (this.rng() - 0.5) * 30 },
          rot: npc.rot,
          hostile: true
        });
        if (hit) {
          const dmg = Math.round(npc.damage * (0.85 + this.rng() * 0.4));
          target.hp = Math.max(0, target.hp - dmg);
          target.lastHit = this.elapsed;
          if (target.hp <= 0) target.alive = false;
          this.events.push({ type: 'playerHit', playerId: target.id, npcId: npc.id, dmg, hp: target.hp, x: target.x, z: target.z });
        }
      }
    } else {
      npc.state = 'patrol';
      const d = dist(npc.x, npc.z, npc.patrol.x, npc.patrol.z);
      if (d > 90) desired = Math.atan2(npc.patrol.x - npc.x, npc.patrol.z - npc.z);
      else desired = npc.rot + Math.sin(this.elapsed * 0.2 + npc.x) * 0.25;
      throttle = 0.35;
    }

    // avoid islands
    for (const isl of this.islands) {
      const d = dist(npc.x, npc.z, isl.x, isl.z);
      const keep = isl.radius + 46;
      if (d < keep) {
        const away = Math.atan2(npc.x - isl.x, npc.z - isl.z);
        desired = away;
        throttle = 1;
        break;
      }
    }

    // stay inside the world
    const dc = Math.hypot(npc.x, npc.z);
    if (dc > 1320) {
      desired = Math.atan2(-npc.x, -npc.z);
      throttle = 1;
    }

    const turn = npc.turn * dt;
    npc.rot += Math.max(-turn, Math.min(turn, angleDiff(npc.rot, desired)));
    const spd = npc.speed * throttle * (npc.state === 'chase' ? 1 : 0.7);
    npc.x += Math.sin(npc.rot) * spd * dt;
    npc.z += Math.cos(npc.rot) * spd * dt;
    const c = clampSea(npc.x, npc.z);
    npc.x = c.x; npc.z = c.z;
  }

  damageNpc(npcId, amount, playerId) {
    const npc = this.npcs.get(npcId);
    if (!npc || !npc.alive) return { ok: false, reason: 'gone' };
    npc.hp = Math.max(0, npc.hp - amount);
    const p = this.players.get(playerId);
    if (p) p.lastHit = this.elapsed;
    this.events.push({ type: 'npcHit', npcId, dmg: amount, hp: npc.hp, by: playerId, x: npc.x, z: npc.z });
    if (npc.hp <= 0) {
      npc.alive = false;
      npc.sunkAt = this.elapsed;
      const loot = rollLoot(npc, this.rng);
      const crate = {
        id: this.id('loot'),
        x: npc.x, z: npc.z,
        drops: loot.drops,
        gold: loot.gold,
        xp: loot.xp,
        ttl: 150,
        bob: 0
      };
      this.loot.set(crate.id, crate);
      this.events.push({
        type: 'sink',
        npc: { ...this.publicNpc(npc), gold: npc.gold, xp: npc.xp },
        x: npc.x, z: npc.z, by: playerId
      });
      this.events.push({ type: 'lootSpawn', loot: this.publicLoot(crate) });
    }
    return { ok: true, hp: npc.hp, sank: !npc.alive };
  }

  respawnNpc(npc) {
    const isl = this.islands[Math.floor(this.rng() * this.islands.length)];
    const a = this.rng() * TAU;
    const r = isl.radius + 120 + this.rng() * 160;
    npc.x = isl.x + Math.sin(a) * r;
    npc.z = isl.z + Math.cos(a) * r;
    npc.patrol = { x: npc.x, z: npc.z };
    npc.rot = this.rng() * TAU;
    npc.hp = npc.maxHp;
    npc.alive = true;
    npc.state = 'patrol';
    npc.fireCd = 2;
    this.events.push({ type: 'spawn', npc: this.publicNpc(npc) });
  }

  publicLoot(l) {
    return { id: l.id, x: l.x, z: l.z, drops: l.drops, gold: l.gold, xp: l.xp, ttl: l.ttl };
  }

  claimLoot(lootId, playerId) {
    const l = this.loot.get(lootId);
    if (!l) return null;
    this.loot.delete(lootId);
    const p = this.players.get(playerId);
    if (p) p.x = p.x;
    this.events.push({ type: 'lootClaimed', lootId, by: playerId, x: l.x, z: l.z });
    return { drops: l.drops, gold: l.gold, xp: l.xp };
  }

  snapshot() {
    const npcs = [];
    for (const n of this.npcs.values()) {
      if (!n.alive) continue;
      npcs.push(this.publicNpc(n));
    }
    const loot = [];
    for (const l of this.loot.values()) loot.push(this.publicLoot(l));
    return { npcs, loot };
  }
}
