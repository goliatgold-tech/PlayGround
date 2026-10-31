import { Game } from './game.js';
import { Net } from './net.js';

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function boot() {
  const fill = document.getElementById('loading-fill');
  const text = document.getElementById('loading-text');
  const loading = document.getElementById('loading');
  try {
    text.textContent = 'Seekarten werden gezeichnet …';
    const [islands, items, ships, fruits, skills, quests, npcs] = await Promise.all([
      loadJSON('/data/islands.json'),
      loadJSON('/data/items.json'),
      loadJSON('/data/ships.json'),
      loadJSON('/data/fruits.json'),
      loadJSON('/data/skills.json'),
      loadJSON('/data/quests.json'),
      loadJSON('/data/npcs.json')
    ]);
    fill.style.width = '65%';
    text.textContent = 'Rumpf, Segel und Urkraft …';
    const data = { islands, items, ships, fruits, skills, quests, npcs };
    const net = new Net();
    const game = new Game(data, net);
    window.game = game;
    window.KAPERFAHRT = { version: '0.1.0', data };
    game.init();
    fill.style.width = '100%';
    text.textContent = 'Bereit zum Auslaufen.';
    setTimeout(() => loading.classList.add('done'), 420);
  } catch (err) {
    console.error(err);
    text.textContent = `Fehler beim Laden: ${err.message}`;
    text.style.color = '#ff9d8f';
  }
}

boot();
