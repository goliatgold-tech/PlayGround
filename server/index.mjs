import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { SeaSim } from '../public/src/shared/sim.js';
import { levelFromXp, dist, cannonDamage, xpForLevel } from '../public/src/shared/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3002);
const TICK = 1 / 12;

const islands = JSON.parse(await fs.readFile(path.join(PUBLIC, 'data/islands.json'), 'utf8'));
const shipData = JSON.parse(await fs.readFile(path.join(PUBLIC, 'data/ships.json'), 'utf8'));
const fruitData = JSON.parse(await fs.readFile(path.join(PUBLIC, 'data/fruits.json'), 'utf8'));

await fs.mkdir(DATA, { recursive: true });

/* ---------------------------------- static --------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = path.join(PUBLIC, pathname);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const buf = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff'
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

/* --------------------------------- accounts -------------------------------- */

const accountsFile = path.join(DATA, 'accounts.json');
let accounts = {};
try { accounts = JSON.parse(await fs.readFile(accountsFile, 'utf8')); } catch { accounts = {}; }
let writeQueue = Promise.resolve();
function persistAccounts() {
  writeQueue = writeQueue.then(async () => {
    const tmp = accountsFile + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(accounts, null, 2));
    await fs.rename(tmp, accountsFile);
  }).catch((e) => console.error('account write failed', e));
  return writeQueue;
}

const tokens = new Map();

function scrypt(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function readBody(req, limit = 96 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function publicAccount(name, acc) {
  return {
    name,
    createdAt: acc.createdAt,
    profile: acc.profile || null
  };
}

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && url.pathname === '/api/register') {
      const { name, password } = await readBody(req);
      const clean = String(name || '').trim();
      if (!/^[A-Za-z0-9_ÄÖÜäöüß-]{3,16}$/.test(clean)) return json(res, 400, { error: 'Name: 3-16 Zeichen, Buchstaben/Zahlen/_/-' });
      if (typeof password !== 'string' || password.length < 4) return json(res, 400, { error: 'Passwort: mindestens 4 Zeichen' });
      const key = clean.toLowerCase();
      if (accounts[key]) return json(res, 409, { error: 'Name bereits vergeben' });
      const salt = crypto.randomBytes(16).toString('hex');
      accounts[key] = { name: clean, salt, hash: scrypt(password, salt), createdAt: Date.now(), profile: null };
      await persistAccounts();
      const token = crypto.randomBytes(24).toString('hex');
      tokens.set(token, key);
      return json(res, 200, { token, ...publicAccount(clean, accounts[key]) });
    }
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const { name, password } = await readBody(req);
      const key = String(name || '').trim().toLowerCase();
      const acc = accounts[key];
      if (!acc || scrypt(String(password || ''), acc.salt) !== acc.hash) return json(res, 401, { error: 'Name oder Passwort falsch' });
      const token = crypto.randomBytes(24).toString('hex');
      tokens.set(token, key);
      return json(res, 200, { token, ...publicAccount(acc.name, acc) });
    }
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const key = tokens.get(auth);
    if (url.pathname === '/api/save') {
      if (!key || !accounts[key]) return json(res, 401, { error: 'Nicht angemeldet' });
      if (req.method === 'GET') return json(res, 200, { profile: accounts[key].profile });
      if (req.method === 'PUT') {
        const { profile } = await readBody(req);
        if (!profile || typeof profile !== 'object') return json(res, 400, { error: 'Profil fehlt' });
        accounts[key].profile = { ...profile, savedAt: Date.now() };
        await persistAccounts();
        return json(res, 200, { ok: true, savedAt: accounts[key].profile.savedAt });
      }
    }
    return json(res, 404, { error: 'unbekannt' });
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
}

/* ---------------------------------- server --------------------------------- */

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') return json(res, 200, { ok: true, players: wss.clients.size, uptime: process.uptime() });
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  return serveStatic(req, res);
});

const sim = new SeaSim({ islands, enemies: shipData.enemies });

const wss = new WebSocketServer({ server, path: '/ws' });

const sockets = new Map();
let nextPlayer = 1;

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(msg, except) {
  const raw = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === 1) client.send(raw);
  }
}

function flushCombatEvents() {
  for (const ev of sim.events) {
    if (ev.type === 'npcHit' || ev.type === 'sink' || ev.type === 'lootSpawn') {
      broadcast({ t: 'event', ...ev });
    }
  }
  sim.events.length = 0;
}

function playerPublic(p) {
  return {
    id: p.id, name: p.name, faction: p.faction, ship: p.ship, fruit: p.fruit,
    x: p.x, z: p.z, rot: p.rot, hp: p.hp, maxHp: p.maxHp,
    level: p.level, xp: p.xp, gold: p.gold, bounty: p.bounty, title: p.title
  };
}

function shipOf(id) {
  return shipData.playerShips.find((s) => s.id === id) || shipData.playerShips[0];
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.msgCount = 0;
  ws.windowStart = Date.now();
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (raw.length > 8192) return;
    if (Date.now() - ws.windowStart > 1000) { ws.windowStart = Date.now(); ws.msgCount = 0; }
    if (++ws.msgCount > 60) return;

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'join') {
      if (ws.player) return;
      const id = 'p' + (nextPlayer++);
      const name = String(msg.name || 'Kapitän').slice(0, 16).replace(/[<>]/g, '');
      const faction = ['pirate', 'marine', 'merchant', 'temple', 'blackmarket'].includes(msg.faction) ? msg.faction : 'pirate';
      const ship = shipOf(msg.ship).id;
      const fruit = fruitData.some((f) => f.id === msg.fruit) ? msg.fruit : null;
      const lvl = levelFromXp(Math.max(0, Number(msg.xp) || 0));
      const shipDef = shipOf(ship);
      const maxHp = shipDef.hp + 25 * Math.min(3, Number(msg.skills?.seemannsblut) || 0);
      const player = sim.addPlayer(id, {
        name, faction, x: Number(msg.x) || 0, z: Number(msg.z) || 60,
        rot: Number(msg.rot) || 0, hp: maxHp, maxHp
      });
      player.ship = ship;
      player.fruit = fruit;
      player.level = lvl.level;
      player.xp = Math.max(0, Number(msg.xp) || 0);
      player.gold = Math.max(0, Number(msg.gold) || 0);
      player.bounty = Math.max(0, Number(msg.bounty) || 0);
      player.skills = msg.skills && typeof msg.skills === 'object' ? msg.skills : {};
      player.title = String(msg.title || '').slice(0, 32);
      player.lastFire = 0;
      player.lastAbility = {};
      player.passive = fruitData.find((f) => f.id === fruit)?.passive || '';
      ws.player = player;
      sockets.set(id, ws);
      send(ws, {
        t: 'welcome',
        id,
        self: playerPublic(player),
        players: [...sim.players.values()].filter((p) => p.id !== id).map(playerPublic),
        snapshot: sim.snapshot(),
        online: wss.clients.size
      });
      broadcast({ t: 'joined', player: playerPublic(player) }, ws);
      broadcast({ t: 'online', count: wss.clients.size });
      return;
    }

    const p = ws.player;
    if (!p) return;

    if (msg.t === 'state') {
      sim.setPlayerPos(p.id, Number(msg.x) || 0, Number(msg.z) || 0, Number(msg.rot) || 0, Number(msg.hp));
      p.level = levelFromXp(Math.max(0, Number(msg.xp) || p.xp)).level;
      if (typeof msg.xp === 'number') p.xp = Math.max(0, msg.xp);
      if (typeof msg.gold === 'number') p.gold = Math.max(0, msg.gold);
      if (typeof msg.bounty === 'number') p.bounty = Math.max(0, msg.bounty);
    } else if (msg.t === 'fire') {
      const now = Date.now();
      const cooldown = 520 - 40 * Math.min(3, Number(p.skills?.breitseite) || 0);
      if (now - p.lastFire < cooldown) return;
      p.lastFire = now;
      const npc = sim.npcs.get(String(msg.npcId));
      if (!npc || !npc.alive) return;
      if (dist(p.x, p.z, npc.x, npc.z) > 340) return;
      const def = shipOf(p.ship);
      const dmg = cannonDamage(def.damage * 2.2, p.skills, p.fruit === 'magma' ? 0.1 : 0);
      const res = sim.damageNpc(npc.id, dmg, p.id);
      if (res.ok) flushCombatEvents();
    } else if (msg.t === 'ability') {
      const fruit = fruitData.find((f) => f.id === p.fruit);
      if (!fruit) return;
      const ability = fruit.abilities.find((a) => a.id === msg.abilityId);
      if (!ability) return;
      const now = Date.now();
      const last = p.lastAbility[ability.id] || 0;
      if (now - last < ability.cooldown * 1000) return;
      p.lastAbility[ability.id] = now;
      let hits = 0;
      if (ability.damage > 0) {
        for (const npc of sim.npcs.values()) {
          if (!npc.alive) continue;
          if (dist(p.x, p.z, npc.x, npc.z) <= ability.range) {
            sim.damageNpc(npc.id, ability.damage, p.id);
            hits++;
            if (hits >= 6) break;
          }
        }
      }
      if (ability.id === 'nebelhort') p.hp = Math.min(p.maxHp, p.hp + 35);
      broadcast({
        t: 'event', type: 'ability', ability: ability.id, fruit: fruit.id,
        x: p.x, z: p.z, by: p.id, hits, color: fruit.color
      });
      if (hits > 0) flushCombatEvents();
    } else if (msg.t === 'claim') {
      const l = sim.loot.get(String(msg.lootId));
      if (!l) return;
      if (dist(p.x, p.z, l.x, l.z) > 60) return;
      const reward = sim.claimLoot(l.id, p.id);
      if (!reward) return;
      p.xp += reward.xp;
      p.gold += reward.gold;
      const lvl = levelFromXp(p.xp);
      if (lvl.level > p.level) {
        p.level = lvl.level;
        send(ws, { t: 'levelup', level: p.level, need: xpForLevel(p.level) });
      }
      send(ws, { t: 'reward', ...reward, xpTotal: p.xp, goldTotal: p.gold, level: p.level, need: lvl.need, rest: lvl.rest });
      broadcast({ t: 'event', type: 'lootClaimed', x: l.x, z: l.z, by: p.id });
    } else if (msg.t === 'chat') {
      const text = String(msg.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 160);
      if (!text) return;
      broadcast({ t: 'chat', from: p.name, faction: p.faction, text, at: Date.now() });
    } else if (msg.t === 'ping') {
      send(ws, { t: 'pong', at: Date.now() });
    }
  });

  ws.on('close', () => {
    const p = ws.player;
    if (p) {
      sim.removePlayer(p.id);
      sockets.delete(p.id);
      broadcast({ t: 'left', id: p.id });
      broadcast({ t: 'online', count: wss.clients.size });
    }
  });
});

setInterval(() => {
  const events = sim.tick(TICK);
  for (const ev of events) {
    if (ev.type === 'playerHit') {
      const target = sockets.get(ev.playerId);
      if (target) send(target, { t: 'hit', dmg: ev.dmg, hp: ev.hp, x: ev.x, z: ev.z });
    }
    if (ev.type === 'respawn') {
      const target = sockets.get(ev.playerId);
      if (target) send(target, { t: 'event', type: 'respawn', x: ev.x, z: ev.z });
    }
  }
  const snap = sim.snapshot();
  broadcast({
    t: 'snapshot',
    players: [...sim.players.values()].map(playerPublic),
    npcs: snap.npcs,
    loot: snap.loot,
    online: wss.clients.size
  });
  // fire/sink events are visual for everyone
  for (const ev of events) {
    if (ev.type === 'shot' || ev.type === 'sink' || ev.type === 'spawn') {
      broadcast({ t: 'event', ...ev });
    }
  }
  sim.events.length = 0;
}, 1000 / 12);

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`⚓ Kaperfahrt läuft auf http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\\nAnker lichten. Tschüss.');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
