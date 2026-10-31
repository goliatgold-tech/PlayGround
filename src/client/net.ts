/** Thin WebSocket client with reconnect and typed message dispatch. */

import type { ClientMessage, FactionId, InputState, ServerMessage } from '../shared/types';

const TOKEN_KEY = 'pirate-slice-token';

export class Net {
  ws: WebSocket | null = null;
  playerId = '';
  token = localStorage.getItem(TOKEN_KEY) ?? '';
  connected = false;

  private name = '';
  private faction: FactionId = 'pirate';
  private retry = 0;
  private closing = false;

  onSnapshot: (msg: Extract<ServerMessage, { type: 'snapshot' }>) => void = () => {};
  onWelcome: (msg: Extract<ServerMessage, { type: 'welcome' }>) => void = () => {};
  onEvent: (msg: Extract<ServerMessage, { type: 'event' }>) => void = () => {};
  onChat: (msg: Extract<ServerMessage, { type: 'chat' }>) => void = () => {};
  onLevelup: (level: number) => void = () => {};
  onError: (text: string) => void = () => {};
  onStatus: (text: string) => void = () => {};

  connect(name: string, faction: FactionId): void {
    this.name = name;
    this.faction = faction;
    this.closing = false;
    this.open();
  }

  private open(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      this.onStatus('verbunden');
      this.send({ type: 'join', name: this.name, faction: this.faction, token: this.token });
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'welcome':
          this.playerId = msg.playerId;
          this.token = msg.token;
          localStorage.setItem(TOKEN_KEY, msg.token);
          this.onWelcome(msg);
          break;
        case 'snapshot':
          this.onSnapshot(msg);
          break;
        case 'event':
          this.onEvent(msg);
          break;
        case 'chat':
          this.onChat(msg);
          break;
        case 'levelup':
          this.onLevelup(msg.level);
          break;
        case 'error':
          this.onError(msg.text);
          break;
      }
    };

    ws.onclose = () => {
      this.connected = false;
      if (this.closing) return;
      this.onStatus('Verbindung verloren – versuche erneut…');
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => this.open(), 800 * this.retry);
    };

    ws.onerror = () => {
      /* onclose handles the retry */
    };
  }

  disconnect(): void {
    this.closing = true;
    this.ws?.close();
    this.ws = null;
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendInput(input: InputState): void {
    this.send({ type: 'input', input });
  }

  attack(): void {
    this.send({ type: 'attack' });
  }

  skill(): void {
    this.send({ type: 'skill' });
  }

  dock(stat: 'hull' | 'cannons' | 'crew'): void {
    this.send({ type: 'dock', stat });
  }

  chat(text: string): void {
    this.send({ type: 'chat', text });
  }

  respawn(): void {
    this.send({ type: 'respawn' });
  }
}
