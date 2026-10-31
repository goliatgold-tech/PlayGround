// Multiplayer + account client. Everything degrades gracefully to offline play.
export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.connected = false;
    this.online = 1;
    this.players = new Map();
    this.npcs = new Map();
    this.loot = new Map();
    this.handlers = new Map();
    this.token = localStorage.getItem('kaperfahrt.token') || null;
    this.accountName = localStorage.getItem('kaperfahrt.account') || null;
    this.lastError = null;
    this.retry = 0;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, payload) {
    for (const fn of this.handlers.get(type) || []) {
      try { fn(payload); } catch (e) { console.error(e); }
    }
  }

  url(path) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}${path}`;
  }

  connect(profile) {
    return new Promise((resolve) => {
      if (this.ws) { try { this.ws.close(); } catch {} }
      let settled = false;
      const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      let ws;
      try {
        ws = new WebSocket(this.url('/ws'));
      } catch {
        done(false);
        return;
      }
      this.ws = ws;
      const timeout = setTimeout(() => { if (!this.connected) { try { ws.close(); } catch {} done(false); } }, 3500);

      ws.onopen = () => {
        this.connected = true;
        clearTimeout(timeout);
        this.retry = 0;
        this.send({ t: 'join', ...profile });
        done(true);
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        this.handle(msg);
      };
      ws.onclose = () => {
        this.connected = false;
        clearTimeout(timeout);
        this.emit('disconnect');
        done(false);
      };
      ws.onerror = () => {
        this.lastError = 'Verbindung fehlgeschlagen';
        done(false);
      };
    });
  }

  handle(msg) {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        this.players.clear();
        for (const p of msg.players) this.players.set(p.id, p);
        this.players.set(msg.self.id, msg.self);
        this.npcs.clear();
        for (const n of msg.snapshot.npcs) this.npcs.set(n.id, n);
        this.loot.clear();
        for (const l of msg.snapshot.loot) this.loot.set(l.id, l);
        this.online = msg.online;
        this.emit('welcome', msg);
        break;
      case 'snapshot': {
        this.online = msg.online;
        this.players.clear();
        for (const p of msg.players) this.players.set(p.id, p);
        this.npcs.clear();
        for (const n of msg.npcs) this.npcs.set(n.id, n);
        this.loot.clear();
        for (const l of msg.loot) this.loot.set(l.id, l);
        this.emit('snapshot', msg);
        break;
      }
      case 'joined':
        this.players.set(msg.player.id, msg.player);
        this.emit('joined', msg.player);
        break;
      case 'left':
        this.players.delete(msg.id);
        this.emit('left', msg.id);
        break;
      case 'event':
        this.emit('event', msg);
        break;
      case 'reward':
        this.emit('reward', msg);
        break;
      case 'hit':
        this.emit('hit', msg);
        break;
      case 'levelup':
        this.emit('levelup', msg);
        break;
      case 'chat':
        this.emit('chat', msg);
        break;
      case 'online':
        this.online = msg.count;
        this.emit('online', msg.count);
        break;
      case 'pong':
        this.emit('pong', msg);
        break;
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
    return this.ws && this.ws.readyState === 1;
  }

  disconnect() {
    if (this.ws) { try { this.ws.close(); } catch {} }
    this.ws = null;
    this.connected = false;
    this.id = null;
  }

  async api(path, options = {}) {
    const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const res = await fetch(path, { ...options, headers });
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  }

  async register(name, password) {
    const res = await this.api('/api/register', { method: 'POST', body: JSON.stringify({ name, password }) });
    this.token = res.token;
    this.accountName = res.name;
    localStorage.setItem('kaperfahrt.token', res.token);
    localStorage.setItem('kaperfahrt.account', res.name);
    return res;
  }

  async login(name, password) {
    const res = await this.api('/api/login', { method: 'POST', body: JSON.stringify({ name, password }) });
    this.token = res.token;
    this.accountName = res.name;
    localStorage.setItem('kaperfahrt.token', res.token);
    localStorage.setItem('kaperfahrt.account', res.name);
    return res;
  }

  async saveCloud(profile) {
    return this.api('/api/save', { method: 'PUT', body: JSON.stringify({ profile }) });
  }

  async loadCloud() {
    const res = await this.api('/api/save');
    return res.profile;
  }

  logout() {
    this.token = null;
    this.accountName = null;
    localStorage.removeItem('kaperfahrt.token');
    localStorage.removeItem('kaperfahrt.account');
  }
}
