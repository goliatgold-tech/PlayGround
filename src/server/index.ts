/**
 * Authoritative game server.
 *
 * - Fixed 20 Hz simulation tick.
 * - 10 Hz snapshot broadcast.
 * - Plain JSON over WebSocket (path /ws) behind the Vite dev proxy.
 *
 * Run: npm run start   (or npm run dev for server + client)
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import * as C from '../shared/constants';
import type { ClientMessage, FactionId, ServerMessage } from '../shared/types';
import { World, type PlayerSave } from './world';
import { flush, getSave, putSave } from './persistence';

const PORT = Number(process.env.PORT ?? 3001);

interface Session {
  id: string;
  token: string;
  joined: boolean;
}

const sessions = new Map<WebSocket, Session>();
const world = new World();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const ws of sessions.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

world.setEmitter((msg) => {
  if (msg.type === 'snapshot') return;
  broadcast(msg);
});

function savePlayer(session: Session): void {
  const player = world.players.get(session.id);
  if (!player || !session.token) return;
  const save: PlayerSave = {
    name: player.name,
    faction: player.faction,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    bounty: player.bounty,
    fruit: player.fruit,
    inventory: player.inventory,
    ship: player.ship,
  };
  putSave(session.token, save);
}

// ------------------------------------------------------------------ transport

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: world.players.size, tick: C.TICK_HZ }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ server: http, path: '/ws' });

wss.on('connection', (ws) => {
  const session: Session = { id: `p_${randomUUID().slice(0, 8)}`, token: '', joined: false };
  sessions.set(ws, session);

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }

    if (!session.joined) {
      if (msg.type !== 'join') return;
      const name = String(msg.name ?? '').trim().slice(0, 16) || 'Kapitän';
      const faction: FactionId = msg.faction === 'marine' ? 'marine' : 'pirate';
      const token = String(msg.token ?? '') || randomUUID();

      if (world.players.size >= C.MAX_PLAYERS) {
        send(ws, { type: 'error', text: 'Server voll.' });
        ws.close();
        return;
      }

      session.token = token;
      session.joined = true;
      const save = getSave(token);
      world.addPlayer(session.id, name, faction, save);

      send(ws, {
        type: 'welcome',
        playerId: session.id,
        token,
        snapshot: world.snapshot(),
      });
      broadcast({ type: 'event', kind: 'info', text: `${name} sticht in See.` });
      return;
    }

    world.handleMessage(session.id, msg);
  });

  ws.on('close', () => {
    if (session.joined) {
      savePlayer(session);
      const player = world.players.get(session.id);
      world.removePlayer(session.id);
      if (player) broadcast({ type: 'event', kind: 'info', text: `${player.name} hat das Meer verlassen.` });
    }
    sessions.delete(ws);
  });

  ws.on('error', () => sessions.delete(ws));
});

// ------------------------------------------------------------------ game loop

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(now - last, 100);
  last = now;
  world.update(dt, now);
}, C.TICK_MS);

setInterval(() => {
  const snap = world.snapshot();
  broadcast({ type: 'snapshot', snapshot: snap });
}, C.SNAPSHOT_MS);

setInterval(() => {
  for (const session of sessions.values()) savePlayer(session);
  flush();
}, 10_000);

function shutdown(): void {
  for (const session of sessions.values()) savePlayer(session);
  flush();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

http.listen(PORT, () => {
  console.log(`[server] pirate slice listening on http://localhost:${PORT} (ws: /ws, tick ${C.TICK_HZ}Hz)`);
});
