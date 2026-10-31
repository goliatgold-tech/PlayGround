/** Keyboard, mouse and touch input. Produces intent flags only. */

export interface InputHandlers {
  attack(): void;
  skill(): void;
  dock(): void;
  respawn(): void;
  chat(text: string): void;
}

type AimResolver = (clientX: number, clientY: number) => { x: number; z: number };

export class Input {
  up = false;
  down = false;
  left = false;
  right = false;
  aimX = 0;
  aimZ = 1;
  seq = 0;
  chatMode = false;

  private mouseX = window.innerWidth / 2;
  private mouseY = window.innerHeight / 2;
  private chatEl: HTMLInputElement;
  private stick = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private resolveAim: AimResolver,
    private handlers: InputHandlers,
  ) {
    this.chatEl = document.createElement('input');
    this.chatEl.id = 'chat-input';
    this.chatEl.className = 'hidden';
    this.chatEl.maxLength = 140;
    this.chatEl.placeholder = 'Nachricht… (Enter zum Senden, Esc zum Abbrechen)';
    this.chatEl.autocomplete = 'off';
    Object.assign(this.chatEl.style, {
      position: 'fixed',
      left: '50%',
      bottom: '24px',
      transform: 'translateX(-50%)',
      width: 'min(520px, 80vw)',
      padding: '10px 14px',
      borderRadius: '10px',
      border: '1px solid rgba(232,195,122,0.5)',
      background: 'rgba(8,14,20,0.94)',
      color: '#fff',
      fontSize: '14px',
      outline: 'none',
      zIndex: '40',
      pointerEvents: 'auto',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.chatEl);

    this.bindKeyboard();
    this.bindMouse();
    this.bindTouch();
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (this.chatMode) {
        if (e.key === 'Escape') this.closeChat();
        return;
      }
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.up = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.down = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.right = true;
          break;
        case 'KeyQ':
          this.handlers.skill();
          break;
        case 'KeyE':
          this.handlers.dock();
          break;
        case 'Enter':
          e.preventDefault();
          this.openChat();
          break;
        case 'Space':
          e.preventDefault();
          this.handlers.respawn();
          break;
        default:
          break;
      }
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.up = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.down = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.right = false;
          break;
        default:
          break;
      }
    });

    window.addEventListener('blur', () => {
      this.up = this.down = this.left = this.right = false;
    });
  }

  private bindMouse(): void {
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.handlers.attack();
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private bindTouch(): void {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return;

    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.clientX < window.innerWidth / 2 && !this.stick.active) {
            this.stick = { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
          } else if (t.clientX >= window.innerWidth / 2) {
            this.mouseX = t.clientX;
            this.mouseY = t.clientY;
            this.handlers.attack();
          }
        }
      },
      { passive: false },
    );

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (!this.stick.active || t.identifier !== this.stick.id) continue;
          this.stick.dx = t.clientX - this.stick.ox;
          this.stick.dy = t.clientY - this.stick.oy;
          const max = 55;
          this.stick.dx = Math.max(-max, Math.min(max, this.stick.dx));
          this.stick.dy = Math.max(-max, Math.min(max, this.stick.dy));
        }
      },
      { passive: false },
    );

    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.stick.active && t.identifier === this.stick.id) {
          this.stick = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
          this.up = this.down = this.left = this.right = false;
        }
      }
    };
    this.canvas.addEventListener('touchend', end);
    this.canvas.addEventListener('touchcancel', end);

    this.makeTouchButton('Q', () => this.handlers.skill(), 'right', '110px');
    this.makeTouchButton('E', () => this.handlers.dock(), 'right', '56px');
  }

  private makeTouchButton(label: string, fn: () => void, side: 'left' | 'right', bottom: string): void {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      position: 'fixed',
      [side]: '20px',
      bottom,
      width: '52px',
      height: '52px',
      borderRadius: '50%',
      border: '1px solid rgba(232,195,122,0.5)',
      background: 'rgba(10,18,26,0.8)',
      color: '#e8c37a',
      fontSize: '16px',
      fontWeight: '700',
      zIndex: '25',
      pointerEvents: 'auto',
    } as unknown as CSSStyleDeclaration);
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      fn();
    });
    document.body.appendChild(btn);
  }

  private openChat(): void {
    this.chatMode = true;
    this.chatEl.classList.remove('hidden');
    this.chatEl.value = '';
    this.chatEl.focus();
  }

  private closeChat(): void {
    this.chatMode = false;
    this.chatEl.classList.add('hidden');
    this.chatEl.value = '';
    this.chatEl.blur();
  }

  /** Called once per network tick. */
  sample(): { up: boolean; down: boolean; left: boolean; right: boolean; aimX: number; aimZ: number; seq: number } {
    const aim = this.resolveAim(this.mouseX, this.mouseY);
    this.aimX = aim.x;
    this.aimZ = aim.z;
    this.seq += 1;

    if (this.stick.active) {
      const dead = 12;
      const dx = this.stick.dx;
      const dy = this.stick.dy;
      this.left = dx < -dead;
      this.right = dx > dead;
      this.up = dy < -dead;
      this.down = dy > dead;
    }

    return { up: this.up, down: this.down, left: this.left, right: this.right, aimX: this.aimX, aimZ: this.aimZ, seq: this.seq };
  }

  bindChatSubmit(fn: (text: string) => void): void {
    this.chatEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.chatEl.value.trim();
        if (text) fn(text);
        this.closeChat();
      } else if (e.key === 'Escape') {
        this.closeChat();
      }
      e.stopPropagation();
    });
  }
}
