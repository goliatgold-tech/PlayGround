import * as THREE from 'three';
import { World, waveHeight, factionColor } from './world.js';
import { buildShip, buildCaptain, buildCrate, buildProjectile } from './ship.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { UI, FACTIONS } from './ui.js';
import { SeaSim } from './shared/sim.js';
import {
  levelFromXp, xpForLevel, clampSea, dist, cannonDamage, RARITY
} from './shared/rules.js';

const SAVE_KEY = 'kaperfahrt.save.v1';
const TAU = Math.PI * 2;

function approach(current, target, delta) {
  if (current < target) return Math.min(target, current + delta);
  return Math.max(target, current - delta);
}

function moveTowardAngle(current, target, maxDelta) {
  let d = ((target - current + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return current + Math.max(-maxDelta, Math.min(maxDelta, d));
}

export class Game {
  constructor(data, net) {
    this.data = data;
    this.net = net;
    this.state = null;
    this.loadedProfile = null;
    this.time = 0;
    this.lastFrame = 0;
    this.pos = { x: 0, z: 70 };
    this.rot = 0;
    this.speed = 0;
    this.throttle = 0;
    this.rudder = 0;
    this.boostEnergy = 100;
    this.boosting = false;
    this.abilityReady = [0, 0, 0];
    this.shieldUntil = 0;
    this.boostUntil = 0;
    this.hiddenUntil = 0;
    this.waypoint = null;
    this.waypointMesh = null;
    this.nearIsland = null;
    this.dockedIsland = null;
    this.panelOpen = false;
    this.dead = false;
    this.respawnAt = 0;
    this.zoom = 0;
    this.cameraShake = 0;
    this.keys = new Set();
    this.touch = { active: false, x: 0, y: 0 };
    this.sim = null;
    this.npcMeshes = new Map();
    this.lootMeshes = new Map();
    this.claiming = new Set();
    this.shots = [];
    this.fireCooldown = 0;
    this.remoteMeshes = new Map();
    this.lastSave = 0;
    this.levelCheck = 1;
    this.hudTick = 0;
    this.acc = 0;
    this.offlineFallback = false;
    this.questToastShown = new Set();
  }

  /* ------------------------------- boot ------------------------------- */

  init() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbfe7ea, 0.00075);

    this.camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.5, 5000);
    this.camera.position.set(120, 60, 210);

    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('scene'),
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.world = new World(this.scene, this.data.islands);
    this.effects = new Effects(this.scene);
    this.audio = new Audio();
    this.ui = new UI(this);

    this.lookAt = new THREE.Vector3(0, 12, 0);
    this.cameraTarget = new THREE.Vector3(0, 10, 0);
    this.smoothCam = new THREE.Vector3(120, 60, 210);

    this.bindInput();
    this.bindNet();
    this.setupJoystick();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.loadedProfile = this.readSave();
    this.ui.showStart(Boolean(this.loadedProfile));

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.version === 1 ? parsed : null;
    } catch { return null; }
  }

  save() {
    if (!this.state) return;
    const s = this.state;
    const data = {
      version: 1,
      name: s.name,
      faction: s.faction,
      shipId: s.shipId,
      fruitId: s.fruitId,
      xp: s.xp,
      gold: s.gold,
      bounty: s.bounty,
      hp: Math.round(s.hp),
      skillPoints: s.skillPoints,
      skills: s.skills,
      inventory: s.inventory,
      quests: s.quests,
      ownedShips: s.ownedShips,
      upgrades: s.upgrades,
      pos: { x: this.pos.x, z: this.pos.z },
      rot: this.rot,
      playtime: s.playtime,
      savedAt: Date.now()
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
    this.loadedProfile = data;
  }

  resetSave() {
    if (!confirm('Wirklich einen neuen Spielstand beginnen? Der lokale Fortschritt geht verloren.')) return;
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }

  /* ------------------------------- input ------------------------------ */

  bindInput() {
    const isTyping = () => {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    };
    window.addEventListener('keydown', (e) => {
      if (isTyping()) {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }
      const k = e.key.toLowerCase();
      if ([' ', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.audio.resume();
      this.keys.add(k);
      if (k === ' ') this.fire();
      else if (k === 'f') this.interact();
      else if (k === 'm') this.ui.openMap();
      else if (k === 'tab') this.ui.openInventory();
      else if (k === 'k') this.ui.openSkills();
      else if (k === 'escape') {
        if (this.ui.panel) this.ui.closePanel();
        else this.ui.openMenu();
      } else if (k === 'enter') {
        this.ui.el['chat-input'].focus();
      } else if (['1', '2', '3'].includes(k)) {
        this.useAbility(Number(k) - 1);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('wheel', (e) => {
      this.zoom = Math.max(-12, Math.min(34, this.zoom + e.deltaY * 0.02));
    }, { passive: true });
    window.addEventListener('pointerdown', () => this.audio.resume(), { once: true });
  }

  setupJoystick() {
    const pad = this.ui.el.joystick;
    const knob = this.ui.el['joystick-knob'];
    if (!pad) return;
    let pointerId = null;
    const radius = 44;
    const move = (e) => {
      if (pointerId !== e.pointerId) return;
      const rect = pad.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touch.active = true;
      this.touch.x = dx / radius;
      this.touch.y = dy / radius;
    };
    pad.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      this.audio.resume();
      move(e);
    });
    pad.addEventListener('pointermove', move);
    const end = (e) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      knob.style.transform = '';
      this.touch.active = false;
      this.touch.x = 0;
      this.touch.y = 0;
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  /* ------------------------------ start ------------------------------- */

  startNew(draft, name) {
    const clean = (name || '').trim().slice(0, 16) || 'Kapitän';
    const faction = draft.faction || 'pirate';
    const fruit = draft.fruitId || 'kaze';
    const ship = draft.shipId || 'sloop';
    this.state = {
      name: clean,
      faction,
      shipId: ship,
      fruitId: fruit,
      xp: 0,
      gold: 250 + (faction === 'blackmarket' ? 150 : 0),
      bounty: 0,
      hp: 100,
      skillPoints: faction === 'temple' ? 1 : 0,
      skills: {},
      inventory: { rum: 2, kanonenkugel: 12 },
      quests: [],
      ownedShips: [ship],
      upgrades: { cannons: 0, hull: 0, sails: 0 },
      playtime: 0,
      lastLevel: 1
    };
    this.pos = { x: 45, z: 170 };
    this.rot = Math.PI + 0.15;
    this.state.hp = this.maxHp();
    this.enterWorld();
    this.ui.toast(`Willkommen auf See, ${clean}.`, 'gold', '⚓');
    this.connectMultiplayer();
  }

  loadSave() {
    const profile = this.loadedProfile || this.readSave();
    if (!profile) { this.ui.toast('Kein Spielstand gefunden.', 'danger', '⚠️'); return; }
    this.applyProfile(profile);
    this.enterWorld();
    this.ui.toast(`Willkommen zurück, ${this.state.name}.`, 'gold', '⚓');
    this.connectMultiplayer();
  }

  applyProfile(profile) {
    this.state = {
      name: profile.name || 'Kapitän',
      faction: profile.faction || 'pirate',
      shipId: profile.shipId || 'sloop',
      fruitId: profile.fruitId || 'kaze',
      xp: Math.max(0, profile.xp || 0),
      gold: Math.max(0, profile.gold || 0),
      bounty: Math.max(0, profile.bounty || 0),
      hp: profile.hp || 100,
      skillPoints: Math.max(0, profile.skillPoints || 0),
      skills: profile.skills || {},
      inventory: profile.inventory || {},
      quests: Array.isArray(profile.quests) ? profile.quests : [],
      ownedShips: Array.isArray(profile.ownedShips) && profile.ownedShips.length ? profile.ownedShips : [profile.shipId || 'sloop'],
      upgrades: profile.upgrades || { cannons: 0, hull: 0, sails: 0 },
      playtime: profile.playtime || 0,
      lastLevel: levelFromXp(profile.xp || 0).level
    };
    this.pos = { x: profile.pos?.x ?? 0, z: profile.pos?.z ?? 120 };
    this.rot = profile.rot ?? Math.PI;
    this.state.hp = Math.min(this.state.hp, this.maxHp());
    this.levelCheck = levelFromXp(this.state.xp).level;
    this.speed = 0;
    this.throttle = 0;
    this.rudder = 0;
  }

  enterWorld() {
    this.ui.hideStart();
    this.ui.renderAbilities();
    this.world.labels.forEach((l) => { l.visible = true; });
    this.createPlayerShip();
    this.dead = false;
    this.updateCamera(0.016, true);
    this.save();
  }

  createPlayerShip() {
    if (this.playerMesh) this.scene.remove(this.playerMesh);
    const accent = factionColor(this.state.faction);
    this.playerMesh = buildShip({ shipId: this.state.shipId, faction: this.state.faction, accent });
    this.playerMesh.rotation.order = 'YXZ';
    const captain = buildCaptain({
      coat: new THREE.Color(accent).getHex(),
      hat: 0x17171d
    });
    captain.position.set(0, 4.1, -4.4);
    captain.rotation.y = Math.PI;
    this.playerMesh.add(captain);
    this.playerMesh.userData.captain = captain;
    this.scene.add(this.playerMesh);
  }

  connectMultiplayer() {
    const profile = {
      name: this.state.name,
      faction: this.state.faction,
      ship: this.state.shipId,
      fruit: this.state.fruitId,
      xp: this.state.xp,
      gold: this.state.gold,
      bounty: this.state.bounty,
      skills: this.state.skills,
      x: this.pos.x,
      z: this.pos.z,
      rot: this.rot
    };
    this.net.connect(profile).then((ok) => {
      if (ok) {
        if (this.sim) {
          this.sim = null;
          this.clearSeaVisuals();
        }
        this.ui.chat('System', 'Mit dem Meer verbunden. Andere Kapitäne sind sichtbar.', 'neutral', true);
        this.ui.toast('Online-See verbunden.', 'good', '🌐');
      } else {
        this.offlineFallback = true;
        this.useOfflineSim();
        this.ui.chat('System', 'Kein Server erreichbar – du segelst allein.', 'neutral', true);
        this.ui.toast('Offline-Modus: Einzelspieler.', 'gold', '🧭');
      }
    });
  }

  /* ------------------------------ offline ----------------------------- */

  useOfflineSim() {
    if (this.net?.connected) return;
    if (this.sim) return;
    this.sim = new SeaSim({ islands: this.data.islands, enemies: this.data.ships.enemies });
    this.sim.addPlayer('local', {
      name: this.state.name,
      faction: this.state.faction,
      x: this.pos.x,
      z: this.pos.z,
      rot: this.rot,
      hp: this.state.hp,
      maxHp: this.maxHp()
    });
  }

  goOffline() {
    if (!this.state || this.offlineFallback) return;
    this.offlineFallback = true;
    this.net.disconnect();
    this.sim = null;
    this.clearSeaVisuals();
    this.useOfflineSim();
    this.ui.toast('Verbindung verloren – Einzelspieler aktiv.', 'danger', '📡');
  }

  clearSeaVisuals() {
    for (const [, v] of this.npcMeshes) this.scene.remove(v.group);
    this.npcMeshes.clear();
    for (const [, m] of this.lootMeshes) this.scene.remove(m);
    this.lootMeshes.clear();
    for (const [, m] of this.remoteMeshes) this.scene.remove(m.group);
    this.remoteMeshes.clear();
  }

  /* ------------------------------- net -------------------------------- */

  bindNet() {
    const net = this.net;
    net.on('welcome', (msg) => {
      this.ui.setOnline(msg.online);
      this.syncAll();
    });
    net.on('snapshot', () => {
      this.syncAll();
    });
    net.on('event', (ev) => this.onServerEvent(ev));
    net.on('reward', (reward) => {
      this.applyReward(reward);
      this.ui.toast(`Beute geborgen: +${Math.round(reward.gold)} Gold`, 'gold', '💰');
    });
    net.on('hit', (msg) => {
      if (!this.state) return;
      this.state.hp = Math.max(0, msg.hp);
      this.flashDamage();
      this.audio.hit();
      if (this.state.hp <= 0) this.handleDeath();
    });
    net.on('levelup', () => {
      this.ui.refresh();
    });
    net.on('chat', (msg) => this.ui.chat(msg.from, msg.text, msg.faction));
    net.on('online', (n) => this.ui.setOnline(n));
    net.on('disconnect', () => this.goOffline());
    net.on('joined', (p) => this.ui.chat('System', `${p.name} hat die See betreten.`, 'neutral', true));
    net.on('left', (id) => {
      const mesh = this.remoteMeshes.get(id);
      if (mesh) { this.scene.remove(mesh.group); this.remoteMeshes.delete(id); }
    });
  }

  syncAll() {
    if (!this.state) return;
    this.syncRemotePlayers();
    this.syncNpcs();
    this.syncLoot();
    this.ui.setOnline(this.net.online);
  }

  syncRemotePlayers() {
    if (!this.net.connected) return;
    const seen = new Set();
    for (const p of this.net.players.values()) {
      if (p.id === this.net.id) continue;
      seen.add(p.id);
      let entry = this.remoteMeshes.get(p.id);
      if (!entry) {
        const group = buildShip({ shipId: p.ship || 'sloop', faction: p.faction || 'pirate', accent: factionColor(p.faction) });
        group.rotation.order = 'YXZ';
        const cap = buildCaptain({ coat: factionColor(p.faction), hat: 0x17171d });
        cap.position.set(0, 4.1, -4.4);
        cap.rotation.y = Math.PI;
        group.add(cap);
        this.scene.add(group);
        entry = { group, x: p.x, z: p.z, rot: p.rot };
        this.remoteMeshes.set(p.id, entry);
      }
      entry.target = p;
    }
    for (const [id, entry] of this.remoteMeshes) {
      if (!seen.has(id)) { this.scene.remove(entry.group); this.remoteMeshes.delete(id); }
    }
  }

  syncNpcs() {
    if (this.net.connected) {
      const seen = new Set();
      for (const n of this.net.npcs.values()) {
        seen.add(n.id);
        this.ensureNpcMesh(n);
        const entry = this.npcMeshes.get(n.id);
        entry.target = n;
      }
      for (const [id, entry] of this.npcMeshes) {
        if (!seen.has(id) && !entry.sinking) this.sinkNpcMesh(id);
      }
    } else if (this.sim) {
      for (const n of this.sim.npcs.values()) {
        this.ensureNpcMesh(n);
        const entry = this.npcMeshes.get(n.id);
        if (n.alive) entry.target = n;
        else if (!entry.sinking) this.sinkNpcMesh(n.id);
      }
    }
  }

  ensureNpcMesh(n) {
    if (this.npcMeshes.has(n.id)) return;
    const def = this.data.ships.enemies.find((e) => e.id === n.defId) || {};
    const accent = factionColor(n.faction);
    const group = buildShip({ shipId: n.ship || 'sloop', faction: n.faction, accent });
    group.rotation.order = 'YXZ';
    if (n.boss) group.scale.setScalar(1.45);
    group.position.set(n.x, 0, n.z);
    group.rotation.y = n.rot;
    this.scene.add(group);
    this.npcMeshes.set(n.id, {
      group,
      x: n.x, z: n.z, rot: n.rot,
      target: n,
      boss: Boolean(n.boss),
      def,
      sinking: false,
      sinkT: 0
    });
  }

  sinkNpcMesh(id) {
    const entry = this.npcMeshes.get(id);
    if (!entry || entry.sinking) return;
    entry.sinking = true;
    entry.sinkT = 0;
    this.effects.explosion(entry.group.position.x, entry.group.position.z);
    this.audio.hit();
    setTimeout(() => {
      this.scene.remove(entry.group);
      this.npcMeshes.delete(id);
    }, 3000);
  }

  syncLoot() {
    const list = this.getLoot();
    const seen = new Set();
    for (const l of list) {
      seen.add(l.id);
      if (!this.lootMeshes.has(l.id)) {
        const crate = buildCrate();
        crate.position.set(l.x, 2, l.z);
        this.scene.add(crate);
        this.lootMeshes.set(l.id, crate);
      }
      if (dist(this.pos.x, this.pos.z, l.x, l.z) < 34 && !this.claiming.has(l.id)) {
        this.claimLoot(l);
      }
    }
    for (const [id, mesh] of this.lootMeshes) {
      if (!seen.has(id)) { this.scene.remove(mesh); this.lootMeshes.delete(id); }
    }
  }

  claimLoot(l) {
    this.claiming.add(l.id);
    if (this.net.connected) {
      this.net.send({ t: 'claim', lootId: l.id });
      setTimeout(() => this.claiming.delete(l.id), 2500);
    } else if (this.sim) {
      const reward = this.sim.claimLoot(l.id, 'local');
      if (reward) {
        this.applyReward(reward);
        this.ui.toast(`Beute geborgen: +${reward.gold} Gold`, 'gold', '💰');
      }
      const mesh = this.lootMeshes.get(l.id);
      if (mesh) { this.scene.remove(mesh); this.lootMeshes.delete(l.id); }
      this.claiming.delete(l.id);
    }
  }

  onServerEvent(ev) {
    if (ev.type === 'shot') {
      if (ev.from) {
        this.spawnCannonball(
          new THREE.Vector3(ev.from.x, 4, ev.from.z),
          new THREE.Vector3(ev.to.x, 3, ev.to.z),
          0.45
        );
        this.effects.muzzle(ev.from.x, 4, ev.from.z);
      }
      if (ev.hostile && dist(this.pos.x, this.pos.z, ev.to.x, ev.to.z) < 40) this.flashDamage();
    } else if (ev.type === 'npcHit') {
      this.effects.ring(ev.x, ev.z, 0xffd28a, 8, 0.4);
    } else if (ev.type === 'sink') {
      const npc = ev.npc || {};
      if (ev.by && ev.by !== this.net.id) return;
      if (npc.defId) this.progressQuest('kill', npc.defId, 1);
      this.ui.toast(`${npc.name || 'Schiff'} versenkt!`, 'good', '☠️');
      this.state.bounty += Math.round((npc.gold || 30) * 0.25);
      this.audio.cannon();
      this.save();
    } else if (ev.type === 'respawn') {
      this.pos = { x: ev.x ?? 0, z: ev.z ?? 60 };
      this.state.hp = this.maxHp();
      this.dead = false;
      this.ui.toast('Die Crew hat dich zurück an Bord geholt.', 'gold', '⚓');
    } else if (ev.type === 'spawn') {
      if (ev.npc) this.ensureNpcMesh(ev.npc);
    } else if (ev.type === 'ability') {
      this.effects.ability(ev.x, ev.z, ev.color || 0x7fe7d4);
      this.effects.ring(ev.x, ev.z, ev.color || 0x7fe7d4, 20, 0.8);
    } else if (ev.type === 'lootClaimed') {
      const mesh = this.lootMeshes.get(ev.lootId);
      if (mesh) { this.scene.remove(mesh); this.lootMeshes.delete(ev.lootId); }
    }
  }

  /* ------------------------------ entities ---------------------------- */

  getNpcs() {
    if (this.net?.connected) return [...this.net.npcs.values()];
    if (this.sim) return [...this.sim.npcs.values()];
    return [];
  }

  getLoot() {
    if (this.net?.connected) return [...this.net.loot.values()];
    if (this.sim) return [...this.sim.loot.values()].map((l) => this.sim.publicLoot(l));
    return [];
  }

  /* ------------------------------ combat ------------------------------ */

  fire() {
    if (!this.state || this.panelOpen || this.dead || this.dockedIsland) return;
    const now = this.time;
    if (now < this.fireCooldown) return;
    this.fireCooldown = now + 0.55;
    const npcs = this.getNpcs().filter((n) => n.alive !== false && n.hp > 0);
    let target = null;
    let best = 340;
    for (const n of npcs) {
      const d = dist(this.pos.x, this.pos.z, n.x, n.z);
      if (d < best) { best = d; target = n; }
    }
    const muzzles = this.playerMesh.userData.muzzles;
    const side = target ? (this.localSide(target) >= 0 ? 1 : -1) : 1;
    const candidates = muzzles.filter((m) => m.side === side);
    const muzzle = candidates[Math.floor(Math.random() * candidates.length)] || muzzles[0];
    const worldMuzzle = this.playerMesh.localToWorld(muzzle.pos.clone());
    this.effects.muzzle(worldMuzzle.x, worldMuzzle.y, worldMuzzle.z);
    this.audio.cannon();
    this.cameraShake = 0.5;
    this.recoil = 0.5;

    if (!target) {
      const ahead = new THREE.Vector3(
        this.pos.x + Math.sin(this.rot) * 120,
        1.5,
        this.pos.z + Math.cos(this.rot) * 120
      );
      this.spawnCannonball(worldMuzzle, ahead, 0.7);
      setTimeout(() => this.effects.splash(ahead.x, ahead.z, 1.2), 700);
      return;
    }

    const targetPos = new THREE.Vector3(target.x, 4, target.z);
    this.spawnCannonball(worldMuzzle, targetPos, 0.32);
    setTimeout(() => {
      this.effects.explosion(target.x, target.z);
      this.audio.hit();
    }, 320);

    if (this.net.connected) {
      this.net.send({ t: 'fire', npcId: target.id });
    } else if (this.sim) {
      const def = this.shipDef();
      const dmg = cannonDamage(def.damage * 2.2, this.state.skills, this.state.fruitId === 'magma' ? 0.1 : 0);
      const res = this.sim.damageNpc(target.id, dmg, 'local');
      if (res.sank) {
        this.ui.toast(`${target.name} versenkt!`, 'good', '☠️');
        this.state.bounty += Math.round((target.gold || 30) * 0.25);
        this.progressQuest('kill', target.defId, 1);
        this.save();
      }
    }
  }

  localSide(target) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const rightX = Math.cos(this.rot);
    const rightZ = -Math.sin(this.rot);
    return dx * rightX + dz * rightZ;
  }

  spawnCannonball(from, to, duration) {
    const mesh = buildProjectile();
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.shots.push({ mesh, from: from.clone(), to: to.clone(), t: 0, duration });
  }

  useAbility(index) {
    if (!this.state || this.panelOpen || this.dead) return;
    const fruit = this.fruitDef();
    if (!fruit) return;
    const ability = fruit.abilities[index];
    if (!ability) return;
    const now = performance.now() / 1000;
    if ((this.abilityReady[index] || 0) > now) return;
    this.abilityReady[index] = now + ability.cooldown;
    this.effects.ability(this.pos.x, this.pos.z, new THREE.Color(fruit.color).getHex());
    this.audio.tone(520, 0.25, 'triangle', 0.12, 160);
    this.ui.toast(`${ability.name}`, 'good', '✦');
    if (this.net.connected) this.net.send({ t: 'ability', abilityId: ability.id });
    if (ability.id === 'aufwind') this.boostUntil = this.time + 6;
    if (ability.id === 'glutpanzer') this.shieldUntil = this.time + 8;
    if (ability.id === 'nebelhort') {
      this.state.hp = Math.min(this.maxHp(), this.state.hp + 35);
      this.hiddenUntil = this.time + 6;
    }
    if (ability.id === 'schattenritt') {
      const c = clampSea(this.pos.x + Math.sin(this.rot) * 150, this.pos.z + Math.cos(this.rot) * 150);
      this.effects.explosion(this.pos.x, this.pos.z, 0xb48cff);
      this.pos.x = c.x; this.pos.z = c.z;
      this.effects.explosion(c.x, c.z, 0xb48cff);
    }
    if (this.sim && ability.damage > 0) {
      let hits = 0;
      for (const npc of this.sim.npcs.values()) {
        if (!npc.alive) continue;
        if (dist(this.pos.x, this.pos.z, npc.x, npc.z) <= ability.range) {
          const res = this.sim.damageNpc(npc.id, ability.damage, 'local');
          hits++;
          if (res.sank) {
            this.progressQuest('kill', npc.defId, 1);
            this.state.bounty += Math.round((npc.gold || 30) * 0.25);
          }
          if (hits >= 6) break;
        }
      }
    }
  }

  flashDamage() {
    this.cameraShake = Math.max(this.cameraShake, 0.35);
    document.body.animate(
      [{ boxShadow: 'inset 0 0 120px rgba(217,96,77,0.65)' }, { boxShadow: 'inset 0 0 120px rgba(217,96,77,0)' }],
      { duration: 420, easing: 'ease-out' }
    );
  }

  handleDeath() {
    if (this.dead) return;
    this.dead = true;
    this.respawnAt = this.time + 5;
    this.throttle = 0;
    this.speed = 0;
    this.ui.toast('Über Bord gespült! Die See gibt dich zurück …', 'danger', '🌊');
    this.audio.tone(90, 1.4, 'sine', 0.2, -40);
  }

  respawn() {
    this.dead = false;
    this.state.hp = Math.round(this.maxHp() * 0.7);
    this.state.gold = Math.max(0, Math.round(this.state.gold * 0.9));
    this.pos = { x: 45, z: 170 };
    this.rot = Math.PI + 0.15;
    this.speed = 0;
    this.throttle = 0;
    if (this.sim) {
      const p = this.sim.players.get('local');
      if (p) { p.hp = this.state.hp; p.alive = true; p.x = this.pos.x; p.z = this.pos.z; }
    }
    this.ui.toast('Zurück in Havenhafen. Die Crew hat dich rausgefischt.', 'gold', '⚓');
    this.save();
  }

  /* ----------------------------- quests ------------------------------- */

  progressQuest(type, target, amount) {
    if (!this.state) return;
    for (const q of this.state.quests) {
      if (q.done) continue;
      const def = this.data.quests.find((d) => d.id === q.id);
      if (!def || def.type !== type || def.target !== target) continue;
      q.progress = Math.min(def.count, q.progress + amount);
      if (q.progress >= def.count) {
        q.done = true;
        this.state.xp += def.xp;
        this.state.gold += def.gold;
        for (const it of def.items) this.addItem(it.id, it.count);
        this.ui.toast(`Auftrag abgeschlossen: ${def.name} (+${def.xp} XP)`, 'gold', '📜');
        this.audio.levelup();
        this.checkLevel();
        this.save();
      } else {
        this.ui.toast(`${def.name}: ${q.progress} / ${def.count}`, '', '📜');
      }
    }
  }

  acceptQuest(id) {
    if (!this.state) return;
    if (this.state.quests.filter((q) => !q.done).length >= 3) {
      this.ui.toast('Maximal 3 aktive Aufträge.', 'danger', '📜');
      return;
    }
    if (this.state.quests.some((q) => q.id === id)) return;
    this.state.quests.push({ id, progress: 0, done: false });
    const def = this.data.quests.find((q) => q.id === id);
    this.ui.toast(`Auftrag angenommen: ${def?.name || id}`, 'good', '📜');
    this.save();
  }

  abandonQuest(id) {
    this.state.quests = this.state.quests.filter((q) => q.id !== id || q.done);
    this.save();
  }

  /* ----------------------------- economy ------------------------------ */

  itemDef(id) { return this.data.items.find((i) => i.id === id); }
  shipDef() { return this.data.ships.playerShips.find((s) => s.id === this.state.shipId) || this.data.ships.playerShips[0]; }
  fruitDef() { return this.data.fruits.find((f) => f.id === this.state.fruitId) || null; }

  maxHp() {
    if (!this.state) return 100;
    const ship = this.data.ships.playerShips.find((s) => s.id === this.state.shipId) || this.data.ships.playerShips[0];
    let hp = ship.hp + 40 * (this.state.upgrades?.hull || 0) + 25 * (this.state.skills?.seemannsblut || 0);
    if (this.state.faction === 'marine') hp = Math.round(hp * 1.15);
    return Math.round(hp);
  }

  buyPrice(item, service) {
    const base = service === 'blackmarket' ? 3.2 : 2.2;
    return Math.round(item.value * base);
  }

  sellPrice(item) {
    let p = item.value;
    if (this.state.faction === 'merchant') p *= 1.2;
    if (this.state.faction === 'pirate') p *= 1.1;
    if (this.state.fruitId === 'yami') p *= 1.15;
    return Math.max(1, Math.round(p));
  }

  addItem(id, count = 1) {
    this.state.inventory[id] = (this.state.inventory[id] || 0) + count;
  }

  buyItem(item, price) {
    if (this.state.gold < price) { this.ui.toast('Nicht genug Gold.', 'danger', '🪙'); this.audio.error(); return false; }
    this.state.gold -= price;
    this.addItem(item.id, 1);
    this.ui.toast(`${item.name} gekauft.`, 'good', item.icon);
    this.audio.pickup();
    this.save();
    return true;
  }

  sellItem(item, count = 1) {
    const have = this.state.inventory[item.id] || 0;
    const n = Math.min(have, count);
    if (n <= 0) return;
    const price = this.sellPrice(item) * n;
    this.state.inventory[item.id] -= n;
    if (this.state.inventory[item.id] <= 0) delete this.state.inventory[item.id];
    this.state.gold += price;
    this.ui.toast(`${n}× ${item.name} für ${price} Gold verkauft.`, 'gold', '🪙');
    this.audio.pickup();
    this.save();
  }

  repairCost() {
    const missing = Math.max(0, this.maxHp() - this.state.hp);
    return Math.round(missing * 0.8);
  }

  repairShip() {
    const cost = this.repairCost();
    if (cost <= 0) return;
    if (this.state.gold < cost) { this.ui.toast('Nicht genug Gold für die Reparatur.', 'danger', '🪙'); return; }
    this.state.gold -= cost;
    this.state.hp = this.maxHp();
    this.ui.toast('Hülle repariert. Die Werft grüßt.', 'good', '🔧');
    this.save();
  }

  upgradeCost(type) {
    const lvl = this.state.upgrades?.[type] || 0;
    return Math.round((240 * Math.pow(lvl + 1, 1.35)) / 10) * 10;
  }

  upgradeShip(type) {
    const lvl = this.state.upgrades?.[type] || 0;
    if (lvl >= 5) return;
    const cost = this.upgradeCost(type);
    if (this.state.gold < cost) { this.ui.toast('Nicht genug Gold.', 'danger', '🪙'); return; }
    this.state.gold -= cost;
    this.state.upgrades[type] = lvl + 1;
    if (type === 'hull') this.state.hp = Math.min(this.maxHp(), this.state.hp + 40);
    this.ui.toast('Schiff aufgerüstet.', 'good', '🔨');
    this.save();
  }

  buyShip(id) {
    const ship = this.data.ships.playerShips.find((s) => s.id === id);
    if (!ship) return;
    if (this.state.gold < ship.price) { this.ui.toast('Nicht genug Gold.', 'danger', '🪙'); return; }
    this.state.gold -= ship.price;
    if (!this.state.ownedShips.includes(id)) this.state.ownedShips.push(id);
    this.equipShip(id);
    this.ui.toast(`${ship.name} gekauft!`, 'gold', '⛵');
    this.save();
  }

  equipShip(id) {
    if (!this.state.ownedShips.includes(id)) return;
    this.state.shipId = id;
    this.createPlayerShip();
    this.state.hp = Math.min(this.state.hp, this.maxHp());
    this.save();
  }

  healAtTavern() {
    const missing = this.maxHp() - this.state.hp;
    const cost = Math.round(missing * 0.6);
    if (missing <= 0) return;
    if (this.state.gold < cost) { this.ui.toast('Nicht genug Gold.', 'danger', '🪙'); return; }
    this.state.gold -= cost;
    this.state.hp = this.maxHp();
    this.ui.toast('Die Crew ist wieder bei Kräften.', 'good', '🍺');
    this.save();
  }

  eatFruit(id) {
    const fruit = this.data.fruits.find((f) => f.id === id);
    if (!fruit) return;
    if (this.state.fruitId === id) return;
    if (this.state.gold < 900) { this.ui.toast('Der Schrein verlangt 900 Gold.', 'danger', '🪙'); return; }
    this.state.gold -= 900;
    this.state.fruitId = id;
    this.abilityReady = [0, 0, 0];
    this.ui.renderAbilities();
    this.ui.toast(`${fruit.name} gegessen. Die Urkraft antwortet.`, 'gold', '✦');
    this.audio.levelup();
    this.save();
  }

  eatFruitItem(itemId) {
    if ((this.state.inventory[itemId] || 0) <= 0) return;
    const options = this.data.fruits.filter((f) => f.id !== this.state.fruitId);
    const fruit = options[Math.floor(Math.random() * options.length)];
    if (!fruit) return;
    this.state.inventory[itemId] -= 1;
    if (this.state.inventory[itemId] <= 0) delete this.state.inventory[itemId];
    this.state.fruitId = fruit.id;
    this.abilityReady = [0, 0, 0];
    this.ui.renderAbilities();
    this.ui.toast(`Urlaubsfrucht gegessen: ${fruit.name}.`, 'gold', '🍍');
    this.audio.levelup();
    this.save();
  }

  useItem(id) {
    if ((this.state.inventory[id] || 0) <= 0) return;
    if (id === 'rum') {
      this.state.inventory[id] -= 1;
      if (this.state.inventory[id] <= 0) delete this.state.inventory[id];
      this.state.hp = Math.min(this.maxHp(), this.state.hp + 25);
      this.ui.toast('Rum getrunken. +25 HP, -1 Würde.', 'good', '🍾');
      this.audio.pickup();
      this.save();
    }
  }

  dropItem(id) {
    if ((this.state.inventory[id] || 0) <= 0) return;
    this.state.inventory[id] -= 1;
    if (this.state.inventory[id] <= 0) delete this.state.inventory[id];
    this.ui.toast('Item über Bord geworfen.', '', '🌊');
    this.save();
  }

  addSkill(nodeId) {
    if (this.state.skillPoints <= 0) return;
    let node = null;
    for (const tree of this.data.skills) {
      const found = tree.nodes.find((n) => n.id === nodeId);
      if (found) { node = found; break; }
    }
    if (!node) return;
    const rank = this.state.skills[nodeId] || 0;
    if (rank >= node.max) return;
    this.state.skills[nodeId] = rank + 1;
    this.state.skillPoints -= 1;
    if (nodeId === 'seemannsblut') this.state.hp = Math.min(this.maxHp(), this.state.hp + 25);
    this.ui.toast(`${node.name} verbessert.`, 'good', '✦');
    this.audio.pickup();
    this.save();
  }

  /* ------------------------------ rewards ----------------------------- */

  applyReward(reward) {
    if (!this.state) return;
    if (typeof reward.xpTotal === 'number') this.state.xp = reward.xpTotal;
    else this.state.xp += Math.round(reward.xp || 0);
    if (typeof reward.goldTotal === 'number') this.state.gold = reward.goldTotal;
    else {
      let gold = reward.gold || 0;
      if (this.state.faction === 'pirate') gold = Math.round(gold * 1.1);
      if (this.state.fruitId === 'yami') gold = Math.round(gold * 1.15);
      this.state.gold += gold;
    }
    for (const d of reward.drops || []) {
      this.addItem(d.id, d.count);
      this.progressQuest('collect', d.id, d.count);
    }
    this.checkLevel();
    this.audio.pickup();
    this.save();
  }

  checkLevel() {
    const info = levelFromXp(this.state.xp);
    if (info.level > this.levelCheck) {
      const gained = info.level - this.levelCheck;
      this.state.skillPoints += gained;
      this.levelCheck = info.level;
      this.state.hp = this.maxHp();
      this.ui.toast(`Level ${info.level} erreicht! +${gained} Skillpunkt${gained > 1 ? 'e' : ''}`, 'gold', '✦');
      this.audio.levelup();
    }
  }

  /* ----------------------------- docking ------------------------------ */

  interact() {
    if (!this.state || this.panelOpen) return;
    if (this.dockedIsland) { this.ui.openPanel('harbor', this.dockedIsland); return; }
    if (this.nearIsland) { this.dock(this.nearIsland); return; }
    this.ui.toast('Kein Hafen in Reichweite.', '', '🧭');
  }

  dock(island) {
    this.dockedIsland = island;
    this.throttle = 0;
    this.speed = 0;
    this.rudder = 0;
    const dock = island.dock || { x: island.x, z: island.z + island.radius + 30, angle: 0 };
    this.pos = { x: dock.x, z: dock.z };
    this.rot = dock.angle;
    this.ui.promptDock(island);
    this.ui.openPanel('harbor', island);
    this.progressQuest('visit', island.id, 1);
    this.audio.tone(330, 0.4, 'triangle', 0.1, 120);
    this.save();
  }

  undock() {
    if (!this.dockedIsland) return;
    const island = this.dockedIsland;
    this.dockedIsland = null;
    const dock = island.dock || { x: island.x, z: island.z + island.radius + 30, angle: 0 };
    this.pos = { x: dock.x + Math.sin(dock.angle) * 30, z: dock.z + Math.cos(dock.angle) * 30 };
    this.rot = dock.angle;
    this.speed = 3;
    this.throttle = 0.3;
    this.ui.promptDock(null);
    this.ui.closePanel();
    this.ui.toast('Leinen los!', 'good', '⚓');
  }

  /* ----------------------------- waypoint ----------------------------- */

  setWaypoint(x, z) {
    this.waypoint = { x, z };
    if (this.waypointMesh) this.scene.remove(this.waypointMesh);
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 90, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe8c87a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 45;
    group.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(7, 9, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1.5;
    group.add(ring);
    group.position.set(x, 0, z);
    group.userData.ring = ring;
    this.scene.add(group);
    this.waypointMesh = group;
  }

  /* ------------------------------- chat ------------------------------- */

  sendChat(text) {
    if (!text) return;
    if (this.net.connected) this.net.send({ t: 'chat', text });
    else this.ui.chat('Du', text, this.state?.faction || 'neutral');
  }

  /* ------------------------------ account ----------------------------- */

  async accountAction(kind, name, password) {
    if (!this.net) return;
    try {
      this.ui.setAccountStatus('Verbinde …');
      const res = kind === 'login' ? await this.net.login(name, password) : await this.net.register(name, password);
      this.ui.setAccountStatus(`Angemeldet als ${res.name}.`, 'ok');
      this.ui.toast(`Konto ${res.name} bereit.`, 'good', '☁️');
      this.ui.refresh();
    } catch (err) {
      this.ui.setAccountStatus(err.message, 'err');
    }
  }

  async cloudSave() {
    if (!this.net.token) { this.ui.setAccountStatus('Bitte zuerst anmelden.', 'err'); return; }
    try {
      await this.net.saveCloud(this.serialize());
      this.ui.setAccountStatus('Spielstand in der Cloud gespeichert.', 'ok');
      this.ui.toast('Cloud-Save abgeschlossen.', 'good', '☁️');
    } catch (err) {
      this.ui.setAccountStatus(err.message, 'err');
    }
  }

  async cloudLoad() {
    if (!this.net.token) { this.ui.setAccountStatus('Bitte zuerst anmelden.', 'err'); return; }
    try {
      const profile = await this.net.loadCloud();
      if (!profile) { this.ui.setAccountStatus('Kein Cloud-Save vorhanden.', 'err'); return; }
      this.applyProfile(profile);
      this.createPlayerShip();
      this.ui.renderAbilities();
      this.save();
      this.ui.closePanel();
      this.ui.toast('Cloud-Save geladen.', 'good', '☁️');
    } catch (err) {
      this.ui.setAccountStatus(err.message, 'err');
    }
  }

  serialize() {
    return {
      version: 1,
      name: this.state.name,
      faction: this.state.faction,
      shipId: this.state.shipId,
      fruitId: this.state.fruitId,
      xp: this.state.xp,
      gold: this.state.gold,
      bounty: this.state.bounty,
      hp: Math.round(this.state.hp),
      skillPoints: this.state.skillPoints,
      skills: this.state.skills,
      inventory: this.state.inventory,
      quests: this.state.quests,
      ownedShips: this.state.ownedShips,
      upgrades: this.state.upgrades,
      pos: { x: this.pos.x, z: this.pos.z },
      rot: this.rot,
      playtime: this.state.playtime
    };
  }

  /* ------------------------------- frame ------------------------------ */

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    if (!this.state) {
      this.updateMenuCamera(dt);
    } else {
      this.update(dt);
    }
    this.world.update(dt, this.camera, this.time);
    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateMenuCamera(dt) {
    const a = this.time * 0.035;
    const target = new THREE.Vector3(Math.sin(a) * 430, 120, Math.cos(a) * 430);
    this.camera.position.lerp(target, 1 - Math.exp(-dt * 0.8));
    this.camera.lookAt(0, 22, 0);
    this.world.labels.forEach((l) => { l.visible = false; });
    this.ui.updateHUD(dt);
  }

  update(dt) {
    const s = this.state;
    s.playtime += dt;
    if (this.time - this.lastSave > 20) { this.lastSave = this.time; this.save(); }

    if (this.dead && this.time >= this.respawnAt) this.respawn();

    const controlsLocked = this.panelOpen || this.dead;
    let throttleInput = 0;
    let rudderInput = 0;
    if (!controlsLocked) {
      if (this.keys.has('w') || this.keys.has('arrowup')) throttleInput += 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) throttleInput -= 0.55;
      if (this.keys.has('a') || this.keys.has('arrowleft')) rudderInput -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) rudderInput += 1;
      if (this.touch.active) {
        throttleInput += -this.touch.y;
        rudderInput += this.touch.x;
      }
    }
    throttleInput = Math.max(-1, Math.min(1, throttleInput));
    rudderInput = Math.max(-1, Math.min(1, rudderInput));

    const ship = this.shipDef();
    const sailBonus = 1 + 0.04 * (s.upgrades?.sails || 0) + 0.03 * (s.skills?.sternkunde || 0);
    const maxSpeed = ship.speed * sailBonus;
    const windBoost = this.time < this.boostUntil ? 1.45 : 1;
    const fruitTurn = s.fruitId === 'kaze' ? 1.15 : 1;
    const turnRate = ship.turn * (1 + 0.04 * (s.skills?.windlesen || 0)) * fruitTurn;

    if (this.dockedIsland) {
      this.speed = approach(this.speed, 0, 20 * dt);
      this.throttle = approach(this.throttle, 0, 2 * dt);
    } else {
      if (Math.abs(throttleInput) > 0.02) {
        this.throttle = approach(this.throttle, throttleInput, 0.85 * dt);
      }
      this.rudder = approach(this.rudder, rudderInput, 3.2 * dt);
      const targetSpeed = this.throttle * maxSpeed * windBoost;
      this.speed = approach(this.speed, targetSpeed, (5 + Math.abs(targetSpeed) * 0.4) * dt);
      if (this.recoil > 0) { this.speed -= this.recoil * 0.8; this.recoil = Math.max(0, this.recoil - dt * 2); }
      const speedFactor = Math.min(1, Math.abs(this.speed) / Math.max(4, maxSpeed * 0.5));
      this.rot += this.rudder * turnRate * dt * (0.28 + 0.72 * speedFactor) * Math.sign(this.speed || 1);
      this.rot = (this.rot + TAU) % TAU;
      let nx = this.pos.x + Math.sin(this.rot) * this.speed * dt;
      let nz = this.pos.z + Math.cos(this.rot) * this.speed * dt;
      const clamped = clampSea(nx, nz);
      if (clamped.x !== nx || clamped.z !== nz) this.speed *= 0.3;
      nx = clamped.x; nz = clamped.z;
      // island collision
      for (const isl of this.data.islands) {
        const d = dist(nx, nz, isl.x, isl.z);
        const minD = isl.radius + 6;
        if (d < minD) {
          const a = Math.atan2(nx - isl.x, nz - isl.z);
          nx = isl.x + Math.sin(a) * minD;
          nz = isl.z + Math.cos(a) * minD;
          this.speed *= 0.2;
          this.flashDamage();
        }
      }
      this.pos.x = nx; this.pos.z = nz;
      this.boosting = (this.keys.has('shift') || this.boostUntil > this.time) && this.boostEnergy > 0;
      if (this.boosting) {
        this.boostEnergy = Math.max(0, this.boostEnergy - 18 * dt);
        this.speed += 14 * dt;
      } else {
        this.boostEnergy = Math.min(100, this.boostEnergy + 9 * dt);
      }
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    // near island detection
    let near = null;
    let bestD = Infinity;
    for (const isl of this.data.islands) {
      const d = dist(this.pos.x, this.pos.z, isl.x, isl.z);
      if (d < isl.radius + 85 && d < bestD) { bestD = d; near = isl; }
    }
    this.nearIsland = near;
    if (this.dockedIsland) {
      this.ui.promptDock(this.dockedIsland);
      this.ui.el['dock-label'].textContent = `${this.dockedIsland.name} · Hafen öffnen`;
    } else if (near && !this.panelOpen) {
      this.ui.promptDock(near);
    } else {
      this.ui.promptDock(null);
    }

    if (this.net.connected) {
      if (!this.hudTick || this.time - this.hudTick > 0.1) {
        this.hudTick = this.time;
        this.net.send({
          t: 'state',
          x: this.pos.x, z: this.pos.z, rot: this.rot,
          hp: s.hp, xp: s.xp, gold: s.gold, bounty: s.bounty
        });
      }
      this.syncRemotePlayers();
      this.syncNpcs();
      this.syncLoot();
    } else if (this.sim) {
      this.sim.setPlayerPos('local', this.pos.x, this.pos.z, this.rot, s.hp);
      const events = this.sim.tick(dt);
      for (const ev of events) this.handleSimEvent(ev);
      s.hp = this.sim.players.get('local')?.hp ?? s.hp;
      this.syncNpcs();
      this.syncLoot();
    }

    // visuals
    this.updatePlayerVisual(dt);
    this.updateNpcVisuals(dt);
    this.updateLootVisuals(dt);
    this.updateShots(dt);
    this.updateWaypoint();
    this.updateCamera(dt);

    if (s.hp <= 0 && !this.dead) this.handleDeath();
    if (this.time < this.shieldUntil) s.hp = Math.min(this.maxHp(), s.hp + 1.5 * dt);

    this.ui.updateHUD(dt);
    this.ui.updateNameplates(dt);
  }

  handleSimEvent(ev) {
    if (ev.type === 'shot') {
      this.spawnCannonball(
        new THREE.Vector3(ev.from.x, 4, ev.from.z),
        new THREE.Vector3(ev.to.x, 3, ev.to.z),
        0.5
      );
      this.effects.muzzle(ev.from.x, 4, ev.from.z);
      if (ev.hostile && dist(this.pos.x, this.pos.z, ev.to.x, ev.to.z) < 45) this.flashDamage();
    } else if (ev.type === 'npcHit') {
      this.effects.ring(ev.x, ev.z, 0xffd28a, 8, 0.4);
    } else if (ev.type === 'sink') {
      this.ui.toast(`${ev.npc.name} versenkt!`, 'good', '☠️');
      this.state.bounty += Math.round((ev.npc.gold || 30) * 0.25);
      this.progressQuest('kill', ev.npc.defId, 1);
      this.audio.cannon();
      this.save();
    } else if (ev.type === 'playerHit') {
      this.state.hp = ev.hp;
      this.flashDamage();
      this.audio.hit();
    } else if (ev.type === 'respawn') {
      this.pos.x = ev.x; this.pos.z = ev.z;
      this.state.hp = this.maxHp();
      this.ui.toast('Die Crew hat dich zurück an Bord geholt.', 'gold', '⚓');
    }
  }

  updatePlayerVisual(dt) {
    const mesh = this.playerMesh;
    if (!mesh) return;
    const t = this.time;
    const x = this.pos.x;
    const z = this.pos.z;
    const h = waveHeight(x, z, t);
    const fwdX = Math.sin(this.rot);
    const fwdZ = Math.cos(this.rot);
    const hFront = waveHeight(x + fwdX * 8, z + fwdZ * 8, t);
    const hBack = waveHeight(x - fwdX * 8, z - fwdZ * 8, t);
    const hRight = waveHeight(x + Math.cos(this.rot) * 4, z - Math.sin(this.rot) * 4, t);
    const hLeft = waveHeight(x - Math.cos(this.rot) * 4, z + Math.sin(this.rot) * 4, t);
    const pitch = -(hFront - hBack) / 16 * 0.9 - this.speed * 0.0015;
    const roll = (hRight - hLeft) / 8 * 0.7 - this.rudder * 0.16 * Math.min(1, Math.abs(this.speed) / 15);
    mesh.position.set(x, h + 0.3, z);
    mesh.rotation.y = this.rot;
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, pitch, 1 - Math.exp(-dt * 4));
    mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, roll, 1 - Math.exp(-dt * 4));

    const sails = mesh.userData.sails || [];
    const sailScale = 0.82 + Math.min(1, Math.abs(this.speed) / 26) * 0.18;
    for (const sail of sails) {
      sail.scale.x = THREE.MathUtils.lerp(sail.scale.x, sailScale, 1 - Math.exp(-dt * 3));
      sail.rotation.y = Math.sin(t * 1.4 + sail.position.z) * 0.035 * sailScale;
    }
    const flag = mesh.userData.flag;
    if (flag) flag.rotation.y = Math.sin(t * 3.2) * 0.16 + this.speed * 0.004;
    const captain = mesh.userData.captain;
    if (captain) {
      captain.rotation.y = Math.PI + Math.sin(t * 0.7) * 0.1;
      captain.userData.arms[0].rotation.x = Math.sin(t * 0.8) * 0.08;
    }
  }

  updateNpcVisuals(dt) {
    for (const [id, entry] of this.npcMeshes) {
      const g = entry.group;
      if (entry.sinking) {
        entry.sinkT += dt;
        g.position.y -= dt * 2.2;
        g.rotation.z += dt * 0.45;
        g.rotation.x += dt * 0.12;
        continue;
      }
      const n = entry.target;
      if (!n) continue;
      const blend = 1 - Math.exp(-dt * 8);
      entry.x = THREE.MathUtils.lerp(entry.x, n.x, blend);
      entry.z = THREE.MathUtils.lerp(entry.z, n.z, blend);
      entry.rot = moveTowardAngle(entry.rot, n.rot, dt * 4);
      const h = waveHeight(entry.x, entry.z, this.time);
      g.position.set(entry.x, h + 0.2, entry.z);
      g.rotation.y = entry.rot;
      g.rotation.x = Math.sin(this.time * 0.9 + entry.x) * 0.02;
      g.rotation.z = Math.sin(this.time * 0.7 + entry.z) * 0.03;
      const flag = g.userData.flag;
      if (flag) flag.rotation.y = Math.sin(this.time * 3 + entry.z) * 0.15;
    }
  }

  updateLootVisuals(dt) {
    for (const [, mesh] of this.lootMeshes) {
      mesh.position.y = 2.4 + Math.sin(this.time * 2 + mesh.position.x) * 0.7;
      mesh.rotation.y += dt * 0.8;
      if (mesh.userData.glow) {
        const k = 0.14 + Math.sin(this.time * 3 + mesh.position.z) * 0.05;
        mesh.userData.glow.material.opacity = k;
      }
    }
  }

  updateShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.duration);
      s.mesh.position.lerpVectors(s.from, s.to, k);
      s.mesh.position.y += Math.sin(k * Math.PI) * 8;
      if (k >= 1) {
        this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }
  }

  updateWaypoint() {
    if (!this.waypoint) return;
    if (this.waypointMesh) {
      this.waypointMesh.userData.ring.rotation.z = this.time * 0.6;
      this.waypointMesh.userData.ring.scale.setScalar(1 + Math.sin(this.time * 2) * 0.08);
    }
    if (dist(this.pos.x, this.pos.z, this.waypoint.x, this.waypoint.z) < 40) {
      this.ui.toast('Kurs erreicht.', 'gold', '🧭');
      this.waypoint = null;
      if (this.waypointMesh) { this.scene.remove(this.waypointMesh); this.waypointMesh = null; }
    }
  }

  updateCamera(dt, immediate = false) {
    const distBehind = 60 + this.zoom;
    const height = 33 + this.zoom * 0.45;
    const fwdX = Math.sin(this.rot);
    const fwdZ = Math.cos(this.rot);
    const rightX = Math.cos(this.rot);
    const rightZ = -Math.sin(this.rot);
    const desired = new THREE.Vector3(
      this.pos.x - fwdX * distBehind + rightX * 13,
      height + waveHeight(this.pos.x, this.pos.z, this.time) * 0.4,
      this.pos.z - fwdZ * distBehind + rightZ * 13
    );
    const look = new THREE.Vector3(
      this.pos.x + fwdX * 20 + rightX * 2,
      3,
      this.pos.z + fwdZ * 20 + rightZ * 2
    );
    if (immediate) {
      this.camera.position.copy(desired);
      this.lookAt.copy(look);
      this.smoothCam.copy(desired);
    } else {
      const k = 1 - Math.exp(-dt * 2.6);
      this.smoothCam.lerp(desired, k);
      this.lookAt.lerp(look, 1 - Math.exp(-dt * 4));
      this.camera.position.copy(this.smoothCam);
    }
    if (this.cameraShake > 0) {
      const shake = this.cameraShake;
      this.camera.position.x += (Math.random() - 0.5) * shake * 1.4;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.9;
      this.cameraShake = Math.max(0, this.cameraShake - dt * 2.2);
    }
    this.camera.lookAt(this.lookAt);
  }
}
