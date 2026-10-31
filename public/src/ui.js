import * as THREE from 'three';
import { RARITY, levelFromXp, xpForLevel } from './shared/rules.js';

export const FACTIONS = {
  pirate: { label: 'Piraten', icon: '☠', color: '#d9604d', bonus: '+10% Gold aus Beute', desc: 'Freiheit, Beute, schlechter Ruf.' },
  marine: { label: 'Marine', icon: '⚓', color: '#8fd0ff', bonus: '+15% Hüllen-HP', desc: 'Disziplin, Orden, zu viele Vorschriften.' },
  merchant: { label: 'Händler', icon: '⚖', color: '#e8c87a', bonus: '+20% Verkaufspreis', desc: 'Frieden ist gut fürs Geschäft.' },
  temple: { label: 'Tempelorden', icon: '☯', color: '#b48cff', bonus: '+1 Start-Skillpunkt', desc: 'Die Urkraft ist kein Werkzeug.' },
  blackmarket: { label: 'Schwarzer Markt', icon: '🕯', color: '#c08cff', bonus: '+150 Startgold', desc: 'Keine Fragen. Nur Preise.' },
  neutral: { label: 'Neutral', icon: '🏝', color: '#2f8f83', bonus: 'Keine Bindung', desc: 'Jeder Hafen, keine Flagge.' }
};

const SERVICE_LABEL = {
  market: { icon: '🏪', label: 'Hafenmarkt', desc: 'Vorräte kaufen und Beute verkaufen.' },
  blackmarket: { icon: '🕯', label: 'Schwarzer Markt', desc: 'Seltene Ware, keine Quittungen.' },
  shipwright: { icon: '🔨', label: 'Werft', desc: 'Reparieren, aufrüsten, neue Schiffe.' },
  tavern: { icon: '🍺', label: 'Taverne', desc: 'Heilen, Gerüchte, ein Glas Rum.' },
  quests: { icon: '📜', label: 'Auftragsbrett', desc: 'Aufträge annehmen und Belohnungen kassieren.' },
  shrine: { icon: '🏮', label: 'Urkraft-Schrein', desc: 'Eine neue Frucht wählen.' }
};

const ABILITY_ICONS = {
  windschnitt: '🌪️', sturmfaust: '💨', aufwind: '⛵',
  lavakugel: '🔥', vulkanausbruch: '🌋', glutpanzer: '🛡️',
  schattenritt: '🌑', seelenfeuer: '🔮', nebelhort: '🌫️'
};

const TITLES = [
  [1, 'Neuling der See'], [3, 'Küstenläufer'], [6, 'Freibeuter'], [10, 'Kapitän'],
  [15, 'Sturmsegler'], [20, 'Legende'], [30, 'Herr der Gezeiten']
];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(n) {
  return Math.round(n).toLocaleString('de-DE');
}

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of [
      'hud', 'hud-name', 'hud-level', 'hud-faction', 'hud-title', 'hud-hp-fill', 'hud-hp-text',
      'hud-xp-fill', 'hud-xp-text', 'hud-gold', 'hud-bounty', 'hud-speed', 'hud-heading',
      'hud-throttle', 'hud-crest', 'online-count', 'minimap', 'quest-name', 'quest-text',
      'quest-progress', 'abilities', 'chat-log', 'chat-input', 'chat-form', 'toasts',
      'dock-prompt', 'dock-label', 'dock-btn', 'nameplates', 'start-screen', 'panel-layer',
      'panel', 'panel-title', 'panel-kicker', 'panel-body', 'panel-close', 'loading',
      'loading-fill', 'loading-text', 'edit-name', 'faction-picker', 'fruit-picker',
      'ship-picker', 'start-btn', 'continue-btn', 'account-btn', 'btn-map', 'btn-inventory',
      'btn-skills', 'btn-menu', 'joystick', 'joystick-knob', 'touch-fire', 'touch-interact',
      'touch-map', 'mobile-controls'
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.panel = null;
    this.panelStack = [];
    this.toastTimer = 0;
    this.hudTimer = 0;
    this.minimapTimer = 0;
    this.plateTimer = 0;
    this.draft = { faction: 'pirate', fruitId: 'kaze', shipId: 'sloop' };
    this.chatLines = [];
    this.plates = new Map();
    this.mmCtx = this.el.minimap.getContext('2d');
    this.abilityButtons = [];
    this.wire();
  }

  wire() {
    this.el['panel-close'].addEventListener('click', () => this.closePanel());
    this.el['panel-layer'].addEventListener('mousedown', (e) => {
      if (e.target === this.el['panel-layer']) this.closePanel();
    });
    this.el['panel-body'].addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      this.game.audio.click();
      this.handleAction(btn.dataset.act, btn.dataset);
    });
    this.el['chat-form'].addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.el['chat-input'].value.trim();
      if (text) this.game.sendChat(text);
      this.el['chat-input'].value = '';
      this.el['chat-input'].blur();
    });
    this.el['chat-input'].addEventListener('keydown', (e) => e.stopPropagation());
    this.el['dock-btn'].addEventListener('click', () => this.game.interact());
    this.el['btn-map'].addEventListener('click', () => this.openMap());
    this.el['btn-inventory'].addEventListener('click', () => this.openInventory());
    this.el['btn-skills'].addEventListener('click', () => this.openSkills());
    this.el['btn-menu'].addEventListener('click', () => this.openMenu());
    this.el['touch-map'].addEventListener('click', () => this.openMap());
    this.el['touch-interact'].addEventListener('click', () => this.game.interact());
    this.el['touch-fire'].addEventListener('pointerdown', (e) => { e.preventDefault(); this.game.fire(); });
    document.querySelectorAll('.ability-touch').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.game.useAbility(Number(btn.dataset.slot));
      });
    });
    this.el['start-btn'].addEventListener('click', () => this.game.startNew(this.draft, this.el['edit-name'].value));
    this.el['continue-btn'].addEventListener('click', () => this.game.loadSave());
    this.el['account-btn'].addEventListener('click', () => this.openAccount());
    this.el['edit-name'].addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.el['start-btn'].click();
    });
  }

  /* ------------------------------- start ------------------------------- */

  showStart(hasSave) {
    this.el['start-screen'].classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el['continue-btn'].classList.toggle('hidden', !hasSave);
    const saved = this.game.loadedProfile;
    this.el['edit-name'].value = saved?.name || this.el['edit-name'].value || '';
    this.draft.faction = saved?.faction || this.draft.faction;
    this.draft.fruitId = saved?.fruitId || this.draft.fruitId;
    this.renderEditor();
  }

  hideStart() {
    this.el['start-screen'].classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  renderEditor() {
    const { factions, fruits, ships } = this.game.data;
    this.el['faction-picker'].innerHTML = Object.entries(FACTIONS).map(([id, f]) => `
      <button class="card ${this.draft.faction === id ? 'selected' : ''}" data-faction="${id}">
        <span class="c-icon">${f.icon}</span>
        <span class="c-name">${f.label}</span>
        <span class="c-sub">${f.bonus}</span>
      </button>`).join('');
    this.el['fruit-picker'].innerHTML = fruits.map((f) => `
      <button class="card ${this.draft.fruitId === f.id ? 'selected' : ''}" data-fruit="${f.id}">
        <span class="c-icon" style="color:${f.color}">✦</span>
        <span class="c-name">${f.name}</span>
        <span class="c-sub">${f.element}</span>
        <span class="c-desc">${f.passive}</span>
      </button>`).join('');
    this.el['ship-picker'].innerHTML = ships.playerShips.map((s) => `
      <button class="card ${this.draft.shipId === s.id ? 'selected' : ''}" data-ship="${s.id}">
        <span class="c-icon">⛵</span>
        <span class="c-name">${s.name}</span>
        <span class="c-sub">${s.class} · ${s.hp} HP</span>
        <span class="c-desc">${s.price ? `ab ${fmt(s.price)} Gold` : 'Startschiff'}</span>
      </button>`).join('');

    this.el['faction-picker'].querySelectorAll('[data-faction]').forEach((b) => {
      b.onclick = () => { this.draft.faction = b.dataset.faction; this.renderEditor(); };
    });
    this.el['fruit-picker'].querySelectorAll('[data-fruit]').forEach((b) => {
      b.onclick = () => { this.draft.fruitId = b.dataset.fruit; this.renderEditor(); };
    });
    this.el['ship-picker'].querySelectorAll('[data-ship]').forEach((b) => {
      b.onclick = () => {
        const ship = this.game.data.ships.playerShips.find((s) => s.id === b.dataset.ship);
        if (ship.price > 250) { this.toast(`${ship.name} kostet ${fmt(ship.price)} Gold – später in der Werft.`, 'danger', '🔒'); return; }
        this.draft.shipId = b.dataset.ship;
        this.renderEditor();
      };
    });
  }

  /* -------------------------------- HUD -------------------------------- */

  setOnline(n) {
    this.el['online-count'].textContent = n ?? 1;
  }

  updateHUD(dt) {
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.12;
    const g = this.game;
    const s = g.state;
    if (!s) return;
    const info = levelFromXp(s.xp);
    this.el['hud-name'].textContent = s.name;
    this.el['hud-level'].textContent = `Lv ${info.level}`;
    this.el['hud-faction'].textContent = FACTIONS[s.faction]?.label || 'Piraten';
    this.el['hud-crest'].textContent = FACTIONS[s.faction]?.icon || '☠';
    let title = 'Neuling der See';
    for (const [lv, t] of TITLES) if (info.level >= lv) title = t;
    this.el['hud-title'].textContent = title;
    const maxHp = g.maxHp();
    const hp = Math.max(0, Math.round(s.hp));
    this.el['hud-hp-fill'].style.width = `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%`;
    this.el['hud-hp-text'].textContent = `${hp} / ${maxHp}`;
    this.el['hud-xp-fill'].style.width = `${Math.min(100, (info.rest / info.need) * 100)}%`;
    this.el['hud-xp-text'].textContent = `${fmt(info.rest)} / ${fmt(info.need)} XP`;
    this.el['hud-gold'].textContent = fmt(s.gold);
    this.el['hud-bounty'].textContent = fmt(s.bounty);
    this.el['hud-speed'].textContent = `${Math.round(Math.abs(g.speed) * 0.55)} kn`;
    const deg = ((g.rot * 180 / Math.PI) % 360 + 360) % 360;
    const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    this.el['hud-heading'].textContent = `${dirs[Math.round(deg / 45) % 8]} ${String(Math.round(deg)).padStart(3, '0')}°`;
    this.el['hud-throttle'].style.width = `${Math.abs(g.throttle) * 100}%`;
    this.setOnline(g.net?.connected ? g.net.online : 1);

    // quest tracker
    const active = s.quests.find((q) => !q.done);
    if (active) {
      const def = this.game.data.quests.find((q) => q.id === active.id);
      if (def) {
        this.el['quest-name'].textContent = def.name;
        this.el['quest-text'].textContent = def.text;
        this.el['quest-progress'].classList.remove('hidden');
        this.el['quest-progress'].querySelector('b').textContent = `${Math.min(active.progress, def.count)} / ${def.count}`;
        this.el['quest-progress'].querySelector('i').style.setProperty('--p', `${Math.min(100, (active.progress / def.count) * 100)}%`);
      }
    } else {
      this.el['quest-name'].textContent = 'Kein Auftrag';
      this.el['quest-text'].textContent = 'Sprich am Auftragsbrett in einem Hafen vor.';
      this.el['quest-progress'].classList.add('hidden');
    }

    this.updateAbilities();
    this.drawMinimap();
  }

  renderAbilities() {
    const fruit = this.game.fruitDef();
    if (!fruit) return;
    this.el.abilities.innerHTML = fruit.abilities.map((a, i) => `
      <button class="ability" data-slot="${i}" title="${esc(a.name)} – ${esc(a.desc)}">
        <span class="key">${i + 1}</span>
        <span class="ico">${ABILITY_ICONS[a.id] || '✦'}</span>
        <span class="cd" style="--p:0"></span>
        <span class="cdtext"></span>
      </button>`).join('');
    this.abilityButtons = [...this.el.abilities.querySelectorAll('.ability')];
    this.abilityButtons.forEach((btn, i) => btn.addEventListener('click', () => this.game.useAbility(i)));
    document.querySelectorAll('.ability-touch').forEach((btn, i) => {
      btn.textContent = ABILITY_ICONS[fruit.abilities[i]?.id] || (i + 1);
    });
  }

  updateAbilities() {
    const fruit = this.game.fruitDef();
    if (!fruit) return;
    const now = performance.now() / 1000;
    fruit.abilities.forEach((a, i) => {
      const btn = this.abilityButtons[i];
      if (!btn) return;
      const readyAt = this.game.abilityReady[i] || 0;
      const left = Math.max(0, readyAt - now);
      const pct = left > 0 ? (left / a.cooldown) * 100 : 0;
      btn.querySelector('.cd').style.setProperty('--p', pct);
      const cdtext = btn.querySelector('.cdtext');
      cdtext.textContent = left > 0 ? Math.ceil(left) : '';
      btn.classList.toggle('ready', left <= 0);
      const touch = document.querySelectorAll('.ability-touch')[i];
      if (touch) touch.classList.toggle('cooling', left > 0);
    });
  }

  promptDock(island) {
    if (island) {
      this.el['dock-prompt'].classList.remove('hidden');
      this.el['dock-label'].textContent = `In ${island.name} anlegen`;
    } else {
      this.el['dock-prompt'].classList.add('hidden');
    }
  }

  toast(text, kind = '', icon = '') {
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    div.innerHTML = `${icon ? `<span>${icon}</span>` : ''}<span>${esc(text)}</span>`;
    this.el.toasts.appendChild(div);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => {
      div.classList.add('out');
      setTimeout(() => div.remove(), 420);
    }, 3000);
  }

  chat(from, text, faction = 'neutral', sys = false) {
    const div = document.createElement('div');
    if (sys) {
      div.className = 'sys';
      div.textContent = text;
    } else {
      div.innerHTML = `<b style="color:${FACTIONS[faction]?.color || '#54c7b5'}">${esc(from)}</b> ${esc(text)}`;
    }
    this.el['chat-log'].appendChild(div);
    while (this.el['chat-log'].children.length > 40) this.el['chat-log'].firstChild.remove();
    this.el['chat-log'].scrollTop = this.el['chat-log'].scrollHeight;
  }

  /* ---------------------------- nameplates ---------------------------- */

  updateNameplates(dt) {
    this.plateTimer -= dt;
    if (this.plateTimer > 0) return;
    this.plateTimer = 0.06;
    const g = this.game;
    const camera = g.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const seen = new Set();
    const entities = [];
    for (const n of g.getNpcs()) {
      if (!n.alive) continue;
      const d = Math.hypot(n.x - g.pos.x, n.z - g.pos.z);
      if (d < 620) entities.push({ ...n, kind: n.boss ? 'boss' : 'hostile', y: 12 });
    }
    if (g.net?.connected) {
      for (const p of g.net.players.values()) {
        if (p.id === g.net.id) continue;
        const d = Math.hypot(p.x - g.pos.x, p.z - g.pos.z);
        if (d < 620) entities.push({ ...p, kind: 'player', y: 12 });
      }
    }
    for (const e of entities) {
      const v = new THREE.Vector3(e.x, e.y, e.z).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      if (sx < -80 || sx > w + 80 || sy < 0 || sy > h) continue;
      seen.add(e.id);
      let div = this.plates.get(e.id);
      if (!div) {
        div = document.createElement('div');
        div.className = `nameplate ${e.kind}`;
        div.innerHTML = `<span class="np-name"></span><span class="np-bar"><i></i></span>`;
        this.el.nameplates.appendChild(div);
        this.plates.set(e.id, div);
      }
      div.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
      div.querySelector('.np-name').textContent = e.kind === 'player' ? e.name : `${e.name}${e.level ? ` · Lv ${e.level}` : ''}`;
      const bar = div.querySelector('.np-bar i');
      if (e.kind === 'player') bar.style.display = 'none';
      else {
        bar.style.display = 'block';
        bar.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
      }
    }
    for (const [id, div] of this.plates) {
      if (!seen.has(id)) { div.remove(); this.plates.delete(id); }
    }
  }

  /* ------------------------------ minimap ------------------------------ */

  drawMinimap() {
    const g = this.game;
    const ctx = this.mmCtx;
    const size = 440;
    const cx = size / 2;
    const cy = size / 2;
    const scale = size / 1900;
    ctx.clearRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, cx);
    grad.addColorStop(0, 'rgba(12, 58, 70, 0.96)');
    grad.addColorStop(1, 'rgba(4, 22, 29, 0.98)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    const toMap = (x, z) => [cx + (x - g.pos.x) * scale, cy + (z - g.pos.z) * scale];

    for (const isl of g.data.islands) {
      const [x, y] = toMap(isl.x, isl.z);
      if (x < -80 || x > size + 80 || y < -80 || y > size + 80) continue;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, isl.radius * scale), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232, 200, 122, 0.28)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(232, 200, 122, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (isl.radius * scale > 7) {
        ctx.fillStyle = 'rgba(244, 236, 217, 0.8)';
        ctx.font = '16px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(isl.name.split(' ')[0], x, y + 5);
      }
    }

    for (const l of g.getLoot()) {
      const [x, y] = toMap(l.x, l.z);
      ctx.fillStyle = '#ffd479';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    for (const n of g.getNpcs()) {
      if (!n.alive) continue;
      const [x, y] = toMap(n.x, n.z);
      if (x < 0 || x > size || y < 0 || y > size) continue;
      ctx.beginPath();
      ctx.arc(x, y, n.boss ? 8 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = n.boss ? '#c08cff' : n.faction === 'marine' ? '#8fd0ff' : '#ff8f7a';
      ctx.fill();
    }
    if (g.net?.connected) {
      for (const p of g.net.players.values()) {
        if (p.id === g.net.id) continue;
        const [x, y] = toMap(p.x, p.z);
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#54c7b5';
        ctx.fill();
      }
    }
    if (g.waypoint) {
      const [x, y] = toMap(g.waypoint.x, g.waypoint.z);
      ctx.strokeStyle = '#e8c87a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8); ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8); ctx.lineTo(x - 8, y + 8);
      ctx.stroke();
    }

    // player arrow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-g.rot + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = '#f4ecd9';
    ctx.fill();
    ctx.strokeStyle = '#0a2530';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  /* ------------------------------- panels ------------------------------ */

  openPanel(kind, island = null, extra = {}) {
    this.panel = { kind, island, ...extra };
    this.el['panel-layer'].classList.remove('hidden');
    this.renderPanel();
  }

  closePanel() {
    this.panel = null;
    this.el['panel-layer'].classList.add('hidden');
    this.el['panel-body'].innerHTML = '';
    this.game.panelOpen = false;
    if (this.el['chat-input'] !== document.activeElement) this.game.audio.resume();
  }

  renderPanel() {
    if (!this.panel) return;
    const { kind, island } = this.panel;
    const map = {
      harbor: () => this.panelHarbor(island),
      market: () => this.panelMarket(island, 'market'),
      blackmarket: () => this.panelMarket(island, 'blackmarket'),
      shipyard: () => this.panelShipyard(island),
      tavern: () => this.panelTavern(island),
      shrine: () => this.panelShrine(island),
      quests: () => this.panelQuests(island),
      inventory: () => this.panelInventory(),
      skills: () => this.panelSkills(),
      map: () => this.panelMap(),
      menu: () => this.panelMenu(),
      account: () => this.panelAccount(),
      controls: () => this.panelControls(),
      settings: () => this.panelMenu()
    };
    const result = (map[kind] || (() => ({ title: 'Unbekannt', kicker: '', body: '<p>Nichts hier.</p>' })))();
    this.el['panel-title'].textContent = result.title;
    this.el['panel-kicker'].textContent = result.kicker || '';
    this.el['panel-body'].innerHTML = result.body;
    this.game.panelOpen = true;
    if (result.after) result.after();
  }

  refresh() {
    if (this.panel) this.renderPanel();
  }

  metaRow(island) {
    const f = FACTIONS[island.faction] || FACTIONS.neutral;
    return `<div class="map-legend" style="margin:0 0 14px">
      <span><i style="background:${f.color}"></i>${f.label}</span>
      <span>🏝️ ${esc(island.type)}</span>
      <span>⚔️ Empfohlen Lv ${island.level}</span>
      <span>📦 ${island.resources.join(', ')}</span>
    </div>`;
  }

  panelHarbor(island) {
    if (!island) return { title: 'Hafen', kicker: 'Anlegen', body: '<p>Kein Hafen in Reichweite.</p>' };
    const services = island.services.map((s) => {
      const meta = SERVICE_LABEL[s];
      if (!meta) return '';
      return `<button class="service-btn" data-act="service" data-service="${s}">
        <b>${meta.icon} ${meta.label}</b><span>${meta.desc}</span></button>`;
    }).join('');
    return {
      title: island.name,
      kicker: 'Hafen · Angedockt',
      body: `
        <p class="lead">„${esc(island.description)}“</p>
        ${this.metaRow(island)}
        <div class="service-grid">${services}
          <button class="service-btn" data-act="set-waypoint" data-island="${island.id}">
            <b>🧭 Kurs setzen</b><span>Markiert die Insel auf Karte und Minimap.</span></button>
          <button class="service-btn" data-act="undock">
            <b>⚓ Ablegen</b><span>Zurück auf die offene See.</span></button>
        </div>`
    };
  }

  panelMarket(island, service) {
    const s = this.game.state;
    const npc = this.game.data.npcs[service] || this.game.data.npcs.market;
    const stock = npc.stock || [];
    const buyRows = stock.map((id) => {
      const item = this.game.itemDef(id);
      if (!item) return '';
      const price = this.game.buyPrice(item, service);
      return `<div class="item-row rarity-${item.rarity}">
        <span class="i-ico">${item.icon}</span>
        <div class="i-main"><div class="i-name">${esc(item.name)}</div>
        <div class="i-sub">${RARITY[item.rarity]?.label || ''} · ${esc(item.desc)}</div></div>
        <span class="i-price">${fmt(price)} 🪙</span>
        <button data-act="buy" data-item="${id}" data-service="${service}" ${s.gold < price ? 'disabled' : ''}>Kaufen</button>
      </div>`;
    }).join('');
    const inv = Object.entries(s.inventory).filter(([, c]) => c > 0);
    const sellRows = inv.map(([id, count]) => {
      const item = this.game.itemDef(id);
      if (!item || item.type === 'fruit') return '';
      const price = this.game.sellPrice(item);
      return `<div class="item-row rarity-${item.rarity}">
        <span class="i-ico">${item.icon}</span>
        <div class="i-main"><div class="i-name">${esc(item.name)} <span class="i-sub">×${count}</span></div>
        <div class="i-sub">Verkaufswert ${fmt(price)} 🪙</div></div>
        <button data-act="sell" data-item="${id}" data-service="${service}" data-count="1">1 verkaufen</button>
        <button data-act="sell" data-item="${id}" data-service="${service}" data-count="${count}">Alle</button>
      </div>`;
    }).join('');
    return {
      title: npc.name || 'Markt',
      kicker: island ? `${island.name} · Handel` : 'Handel',
      body: `
        <p class="lead">„${esc(npc.greeting)}“</p>
        <h3>Ware</h3>
        <div class="shop-grid">${buyRows || '<div class="empty-note">Ausverkauft.</div>'}</div>
        <h3>Deine Beute</h3>
        <div class="shop-grid">${sellRows || '<div class="empty-note">Nichts zu verkaufen. Plündere ein paar Schiffe.</div>'}</div>
        <div class="map-legend"><span>🪙 Gold: <b style="color:var(--gold-bright)">${fmt(s.gold)}</b></span></div>`
    };
  }

  panelShipyard(island) {
    const g = this.game;
    const s = g.state;
    const repairCost = g.repairCost();
    const upgrades = [
      { id: 'cannons', name: 'Kanonen', desc: '+8% Schaden pro Stufe', max: 5 },
      { id: 'hull', name: 'Rumpf', desc: '+40 max. HP pro Stufe', max: 5 },
      { id: 'sails', name: 'Segel', desc: '+4% Tempo pro Stufe', max: 5 }
    ].map((u) => {
      const lvl = s.upgrades[u.id] || 0;
      const cost = g.upgradeCost(u.id);
      return `<div class="skill-node ${lvl >= u.max ? 'maxed' : ''}">
        <div class="sn-head"><span class="sn-name">${u.name}</span><span class="sn-rank">${lvl} / ${u.max}</span></div>
        <div class="sn-desc">${u.desc}</div>
        <button data-act="upgrade" data-upgrade="${u.id}" ${lvl >= u.max || s.gold < cost ? 'disabled' : ''}>
          ${lvl >= u.max ? 'Maximal' : `Aufrüsten · ${fmt(cost)} 🪙`}
        </button></div>`;
    }).join('');
    const ships = g.data.ships.playerShips.map((ship) => {
      const current = s.shipId === ship.id;
      const owned = s.ownedShips.includes(ship.id);
      return `<div class="ship-card ${current ? 'current' : owned ? 'owned' : ''}">
        <h4>${esc(ship.name)}</h4>
        <div class="sc-class">${ship.class}${current ? ' · aktiv' : owned ? ' · im Besitz' : ''}</div>
        <div class="ship-stats">
          <span>Hülle <b>${ship.hp}</b></span><span>Tempo <b>${ship.speed}</b></span>
          <span>Kanonen <b>${ship.cannons}</b></span><span>Crew <b>${ship.crew}</b></span>
        </div>
        <button data-act="${owned ? 'equip-ship' : 'buy-ship'}" data-ship="${ship.id}"
          ${current || (!owned && s.gold < ship.price) ? 'disabled' : ''}>
          ${current ? 'Aktives Schiff' : owned ? 'Übernehmen' : `${fmt(ship.price)} 🪙 kaufen`}
        </button>
      </div>`;
    }).join('');
    return {
      title: 'Werft',
      kicker: island ? island.name : 'Hafen',
      body: `
        <p class="lead">„Rumpf hält. Segel halten. Der Rest ist Glaube.“</p>
        <h3>Instandsetzung</h3>
        <div class="item-row">
          <span class="i-ico">🔧</span>
          <div class="i-main"><div class="i-name">Hülle reparieren</div>
            <div class="i-sub">${Math.round(s.hp)} / ${g.maxHp()} HP · Kosten ${fmt(repairCost)} 🪙</div></div>
          <button data-act="repair" ${repairCost <= 0 || s.gold < repairCost ? 'disabled' : ''}>Reparieren</button>
        </div>
        <h3>Aufrüstung</h3>
        <div class="shop-grid">${upgrades}</div>
        <h3>Schiffe</h3>
        <div class="ship-grid">${ships}</div>`
    };
  }

  panelTavern(island) {
    const g = this.game;
    const s = g.state;
    const missing = g.maxHp() - s.hp;
    const cost = Math.max(0, Math.round(missing * 0.6));
    const rumors = [
      'Im Wrackgrab liegt mehr Gold als in jeder Bank. Und mehr Flüche.',
      'Die Marine zahlt Kopfgeld auf dich. Die Höhe ist ein Kompliment.',
      'Der Leviathan schläft nie. Er wartet nur.',
      'Eine Frucht im Tempel soll den Wind selbst beugen.',
      'Rabenfels kauft alles. Wirklich alles.'
    ];
    const rumor = rumors[Math.floor(Math.random() * rumors.length)];
    return {
      title: 'Taverne',
      kicker: island ? island.name : 'Hafen',
      body: `
        <p class="lead">„Setz dich. Die See draußen wartet lange genug.“</p>
        <div class="item-row">
          <span class="i-ico">🍺</span>
          <div class="i-main"><div class="i-name">Runde für die Crew</div>
            <div class="i-sub">Heilt vollständig · ${fmt(cost)} 🪙</div></div>
          <button data-act="heal" ${cost <= 0 || s.gold < cost ? 'disabled' : ''}>Bezahlen</button>
        </div>
        <div class="item-row" style="margin-top:8px">
          <span class="i-ico">🍾</span>
          <div class="i-main"><div class="i-name">Rum kaufen</div>
            <div class="i-sub">Heilt 25 HP auf See · ${fmt(g.buyPrice({ value: 14 }, 'tavern'))} 🪙</div></div>
          <button data-act="buy" data-item="rum" data-service="tavern" ${s.gold < g.buyPrice({ value: 14 }, 'tavern') ? 'disabled' : ''}>Kaufen</button>
        </div>
        <h3>Gerücht des Abends</h3>
        <p class="lead">„${esc(rumor)}“</p>`
    };
  }

  panelShrine(island) {
    const g = this.game;
    const s = g.state;
    const fruit = g.fruitDef();
    const cards = g.data.fruits.map((f) => {
      const active = s.fruitId === f.id;
      return `<div class="quest-card ${active ? 'active' : ''}">
        <div class="qc-head"><span class="qc-name" style="color:${f.color}">${esc(f.name)}</span>
          <span class="qc-tag">${f.element}</span></div>
        <div class="qc-text">${esc(f.desc)}<br><b style="color:var(--gold-bright)">Passiv:</b> ${esc(f.passive)}</div>
        <div class="qc-reward">${f.abilities.map((a) => `${ABILITY_ICONS[a.id] || '✦'} ${a.name}`).join(' · ')}</div>
        <button data-act="eat-fruit" data-fruit="${f.id}" ${active || s.gold < 900 ? 'disabled' : ''}>
          ${active ? 'Aktive Frucht' : 'Frucht essen · 900 🪙'}</button>
      </div>`;
    }).join('');
    return {
      title: 'Urkraft-Schrein',
      kicker: island ? island.name : 'Tempel',
      body: `
        <p class="lead">„Die Frucht wählt dich. Nicht umgekehrt.“</p>
        <p>Aktive Frucht: <b style="color:${fruit?.color || '#fff'}">${esc(fruit?.name || 'keine')}</b> · Gold: <b>${fmt(s.gold)}</b></p>
        <div class="quest-grid">${cards}</div>`
    };
  }

  panelQuests(island) {
    const g = this.game;
    const s = g.state;
    const available = g.data.quests.filter((q) => (!island || q.giver === island.id) && !s.quests.some((a) => a.id === q.id));
    const active = s.quests.filter((q) => !q.done);
    const done = s.quests.filter((q) => q.done);
    const qCard = (def, state, kind) => {
      const prog = state ? Math.min(state.progress, def.count) : 0;
      return `<div class="quest-card ${state?.done ? 'done' : state ? 'active' : ''}">
        <div class="qc-head"><span class="qc-name">${esc(def.name)}</span><span class="qc-tag">${def.type === 'kill' ? 'Kampf' : def.type === 'collect' ? 'Sammeln' : 'Reise'}</span></div>
        <div class="qc-text">${esc(def.text)}</div>
        <div class="qc-reward">+${fmt(def.xp)} XP · +${fmt(def.gold)} 🪙${def.items.map((i) => ` · ${i.count}× ${g.itemDef(i.id)?.name || i.id}`).join('')}</div>
        ${state ? `<div class="q-progress" style="margin-bottom:8px"><i style="--p:${(prog / def.count) * 100}%"></i><b>${prog} / ${def.count}</b></div>` : ''}
        ${kind === 'available' ? `<button data-act="accept-quest" data-quest="${def.id}">Annehmen</button>` : ''}
        ${kind === 'active' ? `<button data-act="abandon-quest" data-quest="${def.id}">Abbrechen</button>` : ''}
        ${kind === 'done' ? `<button disabled>Abgeschlossen</button>` : ''}
      </div>`;
    };
    return {
      title: 'Auftragsbrett',
      kicker: island ? island.name : 'Hafen',
      body: `
        <p class="lead">„Papier, Nägel, Hoffnung. Nimm dir was.“</p>
        <h3>Verfügbar</h3>
        <div class="quest-grid">${available.length ? available.map((q) => qCard(q, null, 'available')).join('') : '<div class="empty-note">Hier gibt es gerade nichts Neues.</div>'}</div>
        <h3>Aktiv</h3>
        <div class="quest-grid">${active.length ? active.map((a) => qCard(g.data.quests.find((q) => q.id === a.id), a, 'active')).join('') : '<div class="empty-note">Kein Auftrag aktiv. Die See ist geduldig.</div>'}</div>
        ${done.length ? `<h3>Abgeschlossen</h3><div class="quest-grid">${done.map((a) => qCard(g.data.quests.find((q) => q.id === a.id), a, 'done')).join('')}</div>` : ''}`
    };
  }

  panelInventory() {
    const g = this.game;
    const s = g.state;
    const entries = Object.entries(s.inventory).filter(([, c]) => c > 0);
    const cells = entries.map(([id, count]) => {
      const item = g.itemDef(id);
      if (!item) return '';
      return `<div class="inv-cell rarity-${item.rarity}" style="border-color:${RARITY[item.rarity]?.color}44">
        <div class="ic-top"><span>${RARITY[item.rarity]?.label || ''}</span><span>×${count}</span></div>
        <div class="ic-icon">${item.icon}</div>
        <div class="ic-name">${esc(item.name)}</div>
        <div class="ic-desc">${esc(item.desc)}</div>
        <div class="ic-actions">
          ${item.type === 'consumable' ? `<button data-act="use-item" data-item="${id}">Benutzen</button>` : ''}
          ${item.type === 'fruit' ? `<button data-act="eat-item" data-item="${id}">Essen</button>` : ''}
          ${item.type !== 'fruit' ? `<button data-act="drop-item" data-item="${id}">Ablegen</button>` : ''}
        </div>
      </div>`;
    }).join('');
    return {
      title: 'Inventar',
      kicker: 'Laderaum',
      body: `<div class="inv-grid">${cells || '<div class="empty-note">Der Laderaum ist leer. Das Meer ist voll.</div>'}</div>
      <h3>Schiff</h3>
      <div class="ship-stats" style="max-width:340px">
        <span>Hülle <b>${Math.round(s.hp)} / ${g.maxHp()}</b></span><span>Tempo <b>${g.shipDef().speed}</b></span>
        <span>Kanonen <b>${g.shipDef().cannons}</b></span><span>Crew <b>${g.shipDef().crew}</b></span>
      </div>`
    };
  }

  panelSkills() {
    const g = this.game;
    const s = g.state;
    const info = levelFromXp(s.xp);
    const cols = g.data.skills.map((tree) => `
      <div class="skill-col">
        <h4 style="color:${tree.color}">${tree.name}</h4>
        ${tree.nodes.map((node) => {
          const rank = s.skills[node.id] || 0;
          return `<div class="skill-node ${rank >= node.max ? 'maxed' : ''}">
            <div class="sn-head"><span class="sn-name">${node.name}</span><span class="sn-rank">${rank} / ${node.max}</span></div>
            <div class="sn-desc">${node.desc}</div>
            <button data-act="add-skill" data-node="${node.id}" ${rank >= node.max || s.skillPoints <= 0 ? 'disabled' : ''}>
              ${rank >= node.max ? 'Maximal' : 'Punkt investieren'}
            </button></div>`;
        }).join('')}
      </div>`).join('');
    return {
      title: 'Fähigkeiten',
      kicker: `Level ${info.level} · ${s.skillPoints} Punkte`,
      body: `<div class="skill-points">Verfügbare Skillpunkte: <b>${s.skillPoints}</b> · Nächster Punkt bei Level ${info.level + 1}</div>
        <div class="skill-cols">${cols}</div>
        <h3>Urkraft</h3>
        <p>${esc(g.fruitDef()?.name || 'Keine')} – ${esc(g.fruitDef()?.passive || '')}</p>`
    };
  }

  panelMap() {
    return {
      title: 'Seekarte',
      kicker: 'Die Weite',
      body: `<div class="map-holder"><canvas id="big-map" width="1000" height="1000"></canvas></div>
        <div class="map-legend">
          <span><i style="background:#e8c87a"></i>Insel</span>
          <span><i style="background:#ff8f7a"></i>Feind</span>
          <span><i style="background:#c08cff"></i>Boss</span>
          <span><i style="background:#54c7b5"></i>Spieler</span>
          <span>Klick auf die Karte setzt einen Kurs.</span>
        </div>`,
      after: () => this.wireBigMap()
    };
  }

  wireBigMap() {
    const canvas = document.getElementById('big-map');
    if (!canvas) return;
    this.drawBigMap(canvas);
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 * 1500 - 1500;
      const z = ((e.clientY - rect.top) / rect.height) * 2 * 1500 - 1500;
      this.game.setWaypoint(x, z);
      this.drawBigMap(canvas);
    });
  }

  drawBigMap(canvas) {
    const g = this.game;
    const ctx = canvas.getContext('2d');
    const S = canvas.width;
    const toMap = (x, z) => [((x + 1500) / 3000) * S, ((z + 1500) / 3000) * S];
    const grd = ctx.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, '#0a2c38');
    grd.addColorStop(1, '#051820');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, S, S);
    // grid
    ctx.strokeStyle = 'rgba(232, 200, 122, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo((S / 10) * i, 0); ctx.lineTo((S / 10) * i, S);
      ctx.moveTo(0, (S / 10) * i); ctx.lineTo(S, (S / 10) * i);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232, 200, 122, 0.18)';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, (1500 / 3000) * S, 0, Math.PI * 2);
    ctx.stroke();

    for (const isl of g.data.islands) {
      const [x, y] = toMap(isl.x, isl.z);
      ctx.beginPath();
      ctx.arc(x, y, (isl.radius / 3000) * S + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232, 200, 122, 0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(232, 200, 122, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#f4ecd9';
      ctx.font = '17px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(isl.name, x, y - 16);
      ctx.fillStyle = 'rgba(147, 174, 180, 0.9)';
      ctx.font = '12px sans-serif';
      ctx.fillText(`Lv ${isl.level}`, x, y + 18);
    }
    for (const n of g.getNpcs()) {
      if (!n.alive) continue;
      const [x, y] = toMap(n.x, n.z);
      ctx.beginPath();
      ctx.arc(x, y, n.boss ? 9 : 5, 0, Math.PI * 2);
      ctx.fillStyle = n.boss ? '#c08cff' : '#ff8f7a';
      ctx.fill();
    }
    if (g.net?.connected) {
      for (const p of g.net.players.values()) {
        if (p.id === g.net.id) continue;
        const [x, y] = toMap(p.x, p.z);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#54c7b5';
        ctx.fill();
      }
    }
    const [px, py] = toMap(g.pos.x, g.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-g.rot + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
    if (g.waypoint) {
      const [x, y] = toMap(g.waypoint.x, g.waypoint.z);
      ctx.strokeStyle = '#e8c87a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y);
      ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14);
      ctx.stroke();
    }
  }

  panelMenu() {
    const g = this.game;
    const s = g.state;
    const info = levelFromXp(s.xp);
    return {
      title: 'Logbuch',
      kicker: 'Pause · Einstellungen',
      body: `
        <p class="lead">Kapitän ${esc(s.name)} · ${FACTIONS[s.faction]?.label} · Level ${info.level}</p>
        <div class="service-grid">
          <button class="service-btn" data-act="open" data-panel="controls"><b>🎮 Steuerung</b><span>Tastatur, Maus und Touch.</span></button>
          <button class="service-btn" data-act="open" data-panel="inventory"><b>🎒 Inventar</b><span>Laderaum und Ausrüstung.</span></button>
          <button class="service-btn" data-act="open" data-panel="skills"><b>✦ Fähigkeiten</b><span>Skillpunkte verteilen.</span></button>
          <button class="service-btn" data-act="open" data-panel="account"><b>☁️ Konto</b><span>Cloud-Save und Anmeldung.</span></button>
          <button class="service-btn" data-act="toggle-audio"><b>${g.audio.enabled ? '🔊' : '🔇'} Ton</b><span>Prozedurale Sounds an/aus.</span></button>
          <button class="service-btn" data-act="save"><b>💾 Speichern</b><span>Spielstand lokal sichern.</span></button>
          <button class="service-btn" data-act="reset"><b>🗑️ Neuer Spielstand</b><span>Löscht den lokalen Fortschritt.</span></button>
          <button class="service-btn" data-act="reload"><b>⏏️ Zur Startseite</b><span>Zurück zur Charakterwahl.</span></button>
        </div>
        <h3>See-Status</h3>
        <p>${g.net?.connected ? `Online · ${g.net.online} Kapitäne auf See · Server verbunden` : 'Offline-Modus · Einzelspieler'}<br>
        Gold ${fmt(s.gold)} · Kopfgeld ${fmt(s.bounty)} · Aufträge ${s.quests.filter((q) => !q.done).length} aktiv</p>`
    };
  }

  panelControls() {
    return {
      title: 'Steuerung',
      kicker: 'Handbuch',
      body: `
        <div class="skill-cols">
          <div class="skill-col"><h4>Am Ruder</h4>
            <p><kbd>W</kbd>/<kbd>S</kbd> Segel setzen &amp; bremsen<br>
            <kbd>A</kbd>/<kbd>D</kbd> Ruder<br>
            <kbd>Shift</kbd> Boost<br>
            <kbd>Leertaste</kbd> Breitseite<br>
            <kbd>F</kbd> Anlegen / Interagieren<br>
            <kbd>1</kbd>–<kbd>3</kbd> Urkraft-Fähigkeiten</p></div>
          <div class="skill-col"><h4>An Bord</h4>
            <p><kbd>M</kbd> Seekarte<br>
            <kbd>Tab</kbd> Inventar<br>
            <kbd>K</kbd> Fähigkeiten<br>
            <kbd>Esc</kbd> Logbuch / schließen<br>
            <kbd>Enter</kbd> Chat<br>
            Mausrad: Kamera-Zoom</p></div>
          <div class="skill-col"><h4>Touch</h4>
            <p>Linker Joystick: Segel &amp; Ruder<br>
            Rechte Buttons: Feuer, Anlegen, Fähigkeiten<br>
            Karte &amp; Inventar oben<br>
            Gerät quer halten für die volle See.</p></div>
        </div>`
    };
  }

  panelAccount() {
    const net = this.game.net;
    const logged = Boolean(net?.token && net?.accountName);
    const body = logged ? `
      <p class="lead">Angemeldet als <b>${esc(net.accountName)}</b>.</p>
      <p class="status-line ok">Cloud-Save aktiv. Lokaler Fortschritt bleibt erhalten.</p>
      <div class="service-grid" style="margin-top:12px">
        <button class="service-btn" data-act="cloud-save"><b>☁️ In Cloud speichern</b><span>Überträgt den aktuellen Spielstand.</span></button>
        <button class="service-btn" data-act="cloud-load"><b>⬇️ Aus Cloud laden</b><span>Ersetzt den lokalen Spielstand.</span></button>
        <button class="service-btn" data-act="logout"><b>🚪 Abmelden</b><span>Token wird entfernt.</span></button>
      </div>
      <p class="status-line" id="account-status"></p>` : `
      <p class="lead">Ein Konto ist optional. Es ermöglicht Cloud-Saves zwischen Geräten.</p>
      <div class="account-form">
        <input id="acc-name" placeholder="Kapitänsname" maxlength="16" autocomplete="username" />
        <input id="acc-pass" type="password" placeholder="Passwort (min. 4 Zeichen)" autocomplete="current-password" />
        <div class="row">
          <button data-act="account-login">Anmelden</button>
          <button data-act="account-register">Konto erstellen</button>
        </div>
      </div>
      <p class="status-line" id="account-status">Ohne Konto wird der Fortschritt nur lokal im Browser gespeichert.</p>`;
    return { title: 'Konto & Cloud', kicker: 'Optional', body };
  }

  setAccountStatus(text, kind = '') {
    const el = document.getElementById('account-status');
    if (el) { el.textContent = text; el.className = `status-line ${kind}`; }
  }

  /* ------------------------------ actions ------------------------------ */

  handleAction(act, data) {
    const g = this.game;
    switch (act) {
      case 'service': this.openPanel(data.service, this.panel?.island); break;
      case 'undock': g.undock(); this.closePanel(); break;
      case 'set-waypoint': {
        const isl = g.data.islands.find((i) => i.id === data.island);
        if (isl) { g.setWaypoint(isl.x, isl.z); this.toast(`Kurs gesetzt: ${isl.name}`, 'gold', '🧭'); }
        this.closePanel();
        break;
      }
      case 'buy': {
        const item = g.itemDef(data.item);
        if (!item) break;
        const price = g.buyPrice(item, data.service);
        if (g.buyItem(item, price)) this.refresh();
        break;
      }
      case 'sell': {
        const item = g.itemDef(data.item);
        if (item) g.sellItem(item, Number(data.count) || 1);
        this.refresh();
        break;
      }
      case 'repair':
        g.repairShip();
        this.refresh();
        break;
      case 'upgrade':
        g.upgradeShip(data.upgrade);
        this.refresh();
        break;
      case 'buy-ship':
        g.buyShip(data.ship);
        this.refresh();
        break;
      case 'equip-ship':
        g.equipShip(data.ship);
        this.refresh();
        break;
      case 'heal':
        g.healAtTavern();
        this.refresh();
        break;
      case 'eat-fruit':
        g.eatFruit(data.fruit);
        this.refresh();
        break;
      case 'accept-quest':
        g.acceptQuest(data.quest);
        this.refresh();
        break;
      case 'abandon-quest':
        g.abandonQuest(data.quest);
        this.refresh();
        break;
      case 'use-item':
        g.useItem(data.item);
        this.refresh();
        break;
      case 'eat-item':
        g.eatFruitItem(data.item);
        this.refresh();
        break;
      case 'drop-item':
        g.dropItem(data.item);
        this.refresh();
        break;
      case 'add-skill':
        g.addSkill(data.node);
        this.refresh();
        break;
      case 'open':
        this.openPanel(data.panel, this.panel?.island);
        break;
      case 'toggle-audio':
        g.audio.setEnabled(!g.audio.enabled);
        this.refresh();
        break;
      case 'save':
        g.save();
        this.toast('Spielstand gespeichert.', 'good', '💾');
        break;
      case 'reset':
        g.resetSave();
        break;
      case 'reload':
        location.reload();
        break;
      case 'account-login':
      case 'account-register': {
        const name = document.getElementById('acc-name')?.value || '';
        const pass = document.getElementById('acc-pass')?.value || '';
        g.accountAction(act === 'account-login' ? 'login' : 'register', name, pass);
        break;
      }
      case 'cloud-save':
        g.cloudSave();
        break;
      case 'cloud-load':
        g.cloudLoad();
        break;
      case 'logout':
        g.net.logout();
        this.refresh();
        break;
    }
  }
}
