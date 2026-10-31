/** DOM HUD: bars, ship panel, inventory, minimap, chat log, toasts. */

import * as C from '../shared/constants';
import { FACTIONS, ITEMS, RARITY_COLORS, FRUITS } from '../shared/content';
import type { PlayerState, Snapshot } from '../shared/types';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export class Hud {
  private hpFill = $<HTMLDivElement>('hp-fill');
  private hpText = $<HTMLSpanElement>('hp-text');
  private xpFill = $<HTMLDivElement>('xp-fill');
  private xpText = $<HTMLSpanElement>('xp-text');
  private nameTag = $<HTMLSpanElement>('name-tag');
  private factionTag = $<HTMLSpanElement>('faction-tag');
  private levelTag = $<HTMLSpanElement>('level-tag');
  private shipHull = $<HTMLElement>('ship-hull');
  private shipCannons = $<HTMLElement>('ship-cannons');
  private shipCrew = $<HTMLElement>('ship-crew');
  private gold = $<HTMLElement>('gold');
  private bounty = $<HTMLElement>('bounty');
  private inventory = $<HTMLUListElement>('inventory');
  private skillSlot = $<HTMLDivElement>('skill-slot');
  private skillName = $<HTMLSpanElement>('skill-name');
  private skillCd = $<HTMLDivElement>('skill-cd');
  private dockHint = $<HTMLDivElement>('dock-hint');
  private chatlog = $<HTMLDivElement>('chatlog');
  private toastEl = $<HTMLDivElement>('toast');
  private minimap = $<HTMLCanvasElement>('minimap');

  private toastTimer = 0;
  private lastInvKey = '__init__';

  show(): void {
    $('hud').classList.remove('hidden');
  }

  update(p: PlayerState, now: number): void {
    const hpRatio = Math.max(0, Math.min(1, p.hp / p.maxHp));
    this.hpFill.style.width = `${hpRatio * 100}%`;
    this.hpText.textContent = `${Math.ceil(p.hp)}/${Math.round(p.maxHp)}`;

    const xpRatio = Math.max(0, Math.min(1, p.xp / p.xpNext));
    this.xpFill.style.width = `${xpRatio * 100}%`;
    this.xpText.textContent = `${Math.floor(p.xp)}/${p.xpNext}`;

    this.nameTag.textContent = p.name;
    this.factionTag.textContent = FACTIONS[p.faction].name;
    this.factionTag.className = `tag ${p.faction}`;
    this.levelTag.textContent = `Lv ${p.level}`;

    this.shipHull.textContent = String(p.ship.hull);
    this.shipCannons.textContent = String(p.ship.cannons);
    this.shipCrew.textContent = String(p.ship.crew);
    this.gold.textContent = String(p.gold);
    this.bounty.textContent = String(p.bounty);

    const invKey = p.inventory.map((s) => `${s.itemId}:${s.count}`).join('|');
    if (invKey !== this.lastInvKey) {
      this.lastInvKey = invKey;
      this.inventory.innerHTML = '';
      if (p.inventory.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = '<span>Leer</span><span>—</span>';
        this.inventory.appendChild(li);
      }
      for (const stack of p.inventory) {
        const def = ITEMS[stack.itemId];
        if (!def) continue;
        const li = document.createElement('li');
        li.innerHTML = `<span style="color:${RARITY_COLORS[def.rarity]}">${def.name}</span><span>${stack.count}</span>`;
        this.inventory.appendChild(li);
      }
    }

    // Skill slot
    const fruit = p.fruit ? FRUITS[p.fruit] : null;
    const unlocked = !!fruit && p.level >= fruit.unlockLevel;
    this.skillSlot.classList.toggle('locked', !unlocked);
    this.skillName.textContent = fruit
      ? unlocked
        ? `Urkraft: ${fruit.skill.name}`
        : `Urkraft: ${fruit.name} (Lv ${fruit.unlockLevel})`
      : 'Urkraft: keine Frucht';

    const cd = fruit ? fruit.skill.cooldownMs : 0;
    const remaining = fruit ? Math.max(0, cd - (now - p.lastSkillAt)) : 0;
    this.skillCd.style.transform = `scaleX(${cd ? remaining / cd : 0})`;
  }

  setDockHint(show: boolean): void {
    this.dockHint.classList.toggle('hidden', !show);
  }

  pushChat(text: string, cls = 'sys'): void {
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = text;
    this.chatlog.appendChild(line);
    while (this.chatlog.childElementCount > 9) this.chatlog.firstElementChild?.remove();
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  drawMinimap(snapshot: Snapshot, localId: string): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const size = this.minimap.width;
    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 4;
    const scale = R / C.WORLD_RADIUS;

    ctx.clearRect(0, 0, size, size);

    // Ocean
    ctx.fillStyle = 'rgba(12, 52, 78, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Island
    ctx.fillStyle = '#3f6b34';
    ctx.beginPath();
    ctx.arc(cx, cy, C.ISLAND_RADIUS * scale, 0, Math.PI * 2);
    ctx.fill();

    // Cave
    ctx.fillStyle = '#12161a';
    ctx.beginPath();
    ctx.arc(cx + C.CAVE.x * scale, cy + C.CAVE.z * scale, 3, 0, Math.PI * 2);
    ctx.fill();

    // Dock
    ctx.fillStyle = '#e8c37a';
    ctx.fillRect(cx + C.DOCK.x * scale - 2, cy + C.DOCK.z * scale - 2, 4, 4);

    // NPCs
    for (const n of snapshot.npcs) {
      if (!n.alive) continue;
      ctx.fillStyle = n.type === 'boss_kraken' ? '#c07bff' : '#ff9c5a';
      ctx.beginPath();
      ctx.arc(cx + n.x * scale, cy + n.z * scale, n.type === 'boss_kraken' ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Players
    for (const p of snapshot.players) {
      if (!p.alive) continue;
      const self = p.id === localId;
      ctx.fillStyle = self ? '#7dffb0' : p.faction === 'pirate' ? '#ff6b5e' : '#7ec8ff';
      ctx.beginPath();
      ctx.arc(cx + p.x * scale, cy + p.z * scale, self ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = 'rgba(232, 195, 122, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
  }
}
