/**
 * Client entry point.
 *
 * Responsibilities:
 *  - menu / connection lifecycle
 *  - client-side prediction for the local ship (instant response)
 *  - reconciliation against the authoritative snapshot
 *  - 20 Hz input uplink
 */

import * as C from '../shared/constants';
import { FACTIONS } from '../shared/content';
import { clampToPlayable, dist2, normalize } from '../shared/math';
import type { FactionId, PlayerState, Snapshot } from '../shared/types';
import { GameView } from './scene';
import { Hud } from './hud';
import { Input } from './input';
import { Net } from './net';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const menu = $('menu');
const loading = $('loading');
const nameInput = $<HTMLInputElement>('input-name');
const playBtn = $<HTMLButtonElement>('btn-play');

let faction: FactionId = 'pirate';

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.faction-btn'))) {
  btn.addEventListener('click', () => {
    faction = (btn.dataset.faction as FactionId) ?? 'pirate';
    for (const other of Array.from(document.querySelectorAll('.faction-btn'))) other.classList.remove('selected');
    btn.classList.add('selected');
  });
}

nameInput.value = localStorage.getItem('pirate-slice-name') ?? '';
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') playBtn.click();
});

let started = false;

playBtn.addEventListener('click', () => {
  if (started) return;
  started = true;

  const name = (nameInput.value.trim() || `Kapitän${Math.floor(Math.random() * 900 + 100)}`).slice(0, 16);
  localStorage.setItem('pirate-slice-name', name);

  menu.classList.add('hidden');
  loading.classList.remove('hidden');
  start(name, faction);
});

function start(name: string, chosenFaction: FactionId): void {
  const canvas = $<HTMLCanvasElement>('game');
  const view = new GameView(canvas);
  const hud = new Hud();
  const net = new Net();

  const local = { x: 0, z: 0, rot: 0, alive: true };
  let latest: Snapshot | null = null;
  let playerId = '';

  const input = new Input(canvas, (x, y) => view.aimPoint(x, y), {
    attack: () => {
      // Push the freshest aim vector before the server resolves the shot.
      net.sendInput(input.sample());
      net.attack();
    },
    skill: () => {
      net.sendInput(input.sample());
      net.skill();
    },
    dock: () => net.dock('cannons'),
    respawn: () => net.respawn(),
    chat: (text) => net.chat(text),
  });
  input.bindChatSubmit((text) => net.chat(text));

  net.onWelcome = (msg) => {
    playerId = msg.playerId;
    view.setLocalId(playerId);
    latest = msg.snapshot;

    const me = msg.snapshot.players.find((p) => p.id === playerId);
    if (me) {
      local.x = me.x;
      local.z = me.z;
      local.rot = me.rot;
      local.alive = me.alive;
    }

    loading.classList.add('hidden');
    hud.show();
    hud.pushChat(`Willkommen, ${name}. Fraktion: ${FACTIONS[chosenFaction].name}.`, 'sys');
    hud.pushChat('Segle zu den Marine-Patrouillen östlich der Insel oder zum Tiefenwächter in der Höhle.', 'sys');
    hud.toast(`Willkommen an Bord, ${name}!`);
  };

  net.onSnapshot = (msg) => {
    latest = msg.snapshot;
    const me = msg.snapshot.players.find((p) => p.id === playerId);
    if (!me) return;

    local.alive = me.alive;
    if (!me.alive) {
      local.x = me.x;
      local.z = me.z;
    } else {
      // Reconciliation: snap on big divergence, otherwise ease toward authority.
      const d = dist2(local.x, local.z, me.x, me.z);
      if (d > 70) {
        local.x = me.x;
        local.z = me.z;
        local.rot = me.rot;
      } else {
        local.x += (me.x - local.x) * 0.12;
        local.z += (me.z - local.z) * 0.12;
      }
    }

    view.sync(msg.snapshot, playerId);
    hud.update(me, Date.now());
    hud.drawMinimap(msg.snapshot, playerId);

    const nearDock = me.alive && dist2(me.x, me.z, C.DOCK.x, C.DOCK.z) < C.DOCK_RADIUS;
    hud.setDockHint(nearDock);
  };

  net.onEvent = (msg) => {
    hud.pushChat(msg.text, msg.kind === 'loot' ? 'loot' : msg.kind === 'levelup' ? 'lvl' : 'sys');
    if (msg.kind === 'levelup' || msg.kind === 'death') hud.toast(msg.text);
  };

  net.onChat = (msg) => {
    hud.pushChat(`[${msg.from}] ${msg.text}`, 'chat');
  };

  net.onLevelup = (level) => {
    hud.toast(`Level ${level} erreicht!`);
  };

  net.onError = (text) => hud.toast(text);

  net.onStatus = (text) => {
    if (!latest) {
      const p = loading.querySelector('p');
      if (p) p.textContent = text;
    } else {
      hud.pushChat(text, 'sys');
    }
  };

  net.connect(name, chosenFaction);

  // Debug handle (used by the browser smoke test and handy in the console).
  (window as unknown as { __pirate: unknown }).__pirate = {
    net,
    view,
    local,
    get snapshot(): Snapshot | null {
      return latest;
    },
  };

  // ---- local prediction + render loop -------------------------------------
  let last = performance.now();
  let hudAccum = 0;

  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (local.alive) {
      const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const dz = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (dx !== 0 || dz !== 0) {
        const dir = normalize(dx, dz);
        local.x += dir.x * C.PLAYER_SPEED * dt;
        local.z += dir.z * C.PLAYER_SPEED * dt;
        local.rot = Math.atan2(dir.x, dir.z);
      }
      const fixed = clampToPlayable(local.x, local.z, C.WORLD_RADIUS, C.ISLAND_EXCLUSION);
      local.x = fixed.x;
      local.z = fixed.z;
    }

    if (playerId) view.setLocalPosition(playerId, local.x, local.z, local.rot, local.alive);
    view.render(local);

    hudAccum += dt;
    if (hudAccum > 0.25 && latest) {
      hudAccum = 0;
      hud.drawMinimap(latest, playerId);
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // ---- input uplink -------------------------------------------------------
  setInterval(() => {
    if (!net.connected) return;
    net.sendInput(input.sample());
  }, C.TICK_MS);
}

// Small helper for debugging from the console.
(window as unknown as { __pirateVersion?: string }).__pirateVersion = '0.1.0';
