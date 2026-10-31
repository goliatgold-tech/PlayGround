/**
 * Three.js presentation layer.
 *
 * The scene is purely a *view*: it never simulates gameplay. It interpolates
 * towards the latest authoritative snapshot and renders whatever it is given.
 * The only exception is the local ship, which is drawn from the client-side
 * prediction in main.ts to keep input latency at zero.
 */

import * as THREE from 'three';
import * as C from '../shared/constants';
import { FACTIONS, NPCS } from '../shared/content';
import type { FactionId, NpcType, PlayerState, ProjectileState, Snapshot } from '../shared/types';

interface EntityView {
  group: THREE.Group;
  bar: THREE.Group;
  barFill: THREE.Mesh;
  label: THREE.Sprite;
  targetX: number;
  targetZ: number;
  targetRot: number;
  faction: FactionId;
  isLocal: boolean;
  alive: boolean;
  bob: number;
}

function material(color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, ...opts });
}

function makeLabel(text: string, color = '#e9eef5'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 30px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 14, 256, 40);
  ctx.fillStyle = color;
  ctx.fillText(text.slice(0, 16), 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(16, 4, 1);
  sprite.position.y = 17;
  return sprite;
}

function buildShip(hullColor: number, accent: number, scale: number): THREE.Group {
  const g = new THREE.Group();

  const hull = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.4, 11), material(hullColor));
  hull.position.y = 1.2;
  g.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(3.5, 5, 4), material(hullColor));
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 1.2, 7.8);
  g.add(bow);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.55, 11.1), material(accent));
  stripe.position.y = 2.35;
  g.add(stripe);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.35, 9.2), material(0x9a7b4f, { roughness: 0.9 }));
  deck.position.y = 2.75;
  g.add(deck);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 10, 6), material(0x6b4f2f));
  mast.position.set(0, 7.4, -0.4);
  g.add(mast);

  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 5.2),
    new THREE.MeshBasicMaterial({ color: 0xf7f1e3, side: THREE.DoubleSide }),
  );
  sail.position.set(0, 9.4, -2.2);
  g.add(sail);

  const sailStripe = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 1.3),
    new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide }),
  );
  sailStripe.position.set(0, 8.9, -2.19);
  g.add(sailStripe);

  const sailStripeBack = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 1.3),
    new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide }),
  );
  sailStripeBack.position.set(0, 8.9, -2.21);
  g.add(sailStripeBack);

  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6.4, 6), material(0x6b4f2f));
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, 12.1, -2.2);
  g.add(yard);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.4),
    material(accent, { side: THREE.DoubleSide }),
  );
  flag.position.set(1.3, 12.9, -2.2);
  g.add(flag);

  g.scale.setScalar(scale);
  return g;
}

function buildBar(): { bar: THREE.Group; fill: THREE.Mesh } {
  const bar = new THREE.Group();
  const bgGeo = new THREE.PlaneGeometry(6, 0.8);
  const bg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ color: 0x0a0f14, transparent: true, opacity: 0.75 }));
  bar.add(bg);

  const fillGeo = new THREE.PlaneGeometry(6, 0.8);
  fillGeo.translate(3, 0, 0);
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x4be07a }));
  fill.position.x = -3;
  fill.position.z = 0.01;
  bar.add(fill);

  return { bar, fill };
}

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private oceanMat!: THREE.ShaderMaterial;
  private clock = new THREE.Clock();
  private entities = new Map<string, EntityView>();
  private projectiles = new Map<string, THREE.Mesh>();
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2);
  private aim = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3(0, 62, 140);
  private localId = '';

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 1, 3000);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(0, 0, 0);

    this.scene.background = new THREE.Color(0x8ec6e6);
    this.scene.fog = new THREE.Fog(0x8ec6e6, 700, 1900);

    this.buildLights();
    this.buildOcean();
    this.buildIsland();
    this.buildDock();

    window.addEventListener('resize', () => this.onResize());
  }

  setLocalId(id: string): void {
    this.localId = id;
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x2b3b46, 1.15);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0cf, 1.9);
    sun.position.set(180, 320, 120);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x88b8ff, 0.45);
    fill.position.set(-200, 160, -180);
    this.scene.add(fill);
  }

  private buildOcean(): void {
    const geo = new THREE.PlaneGeometry(4200, 4200, 160, 160);
    this.oceanMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x11527a) },
        uShallow: { value: new THREE.Color(0x3fb2d6) },
        uFogColor: { value: new THREE.Color(0x8ec6e6) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vH;
        varying vec2 vUv;
        varying float vDepth;
        void main() {
          vUv = uv;
          vec3 p = position;
          float h = sin(p.x * 0.018 + uTime * 0.9) * 1.7
                  + cos(p.y * 0.013 - uTime * 0.7) * 1.3
                  + sin((p.x + p.y) * 0.006 + uTime * 1.3) * 1.0;
          p.z += h;
          vH = h;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFogColor;
        uniform float uTime;
        varying float vH;
        varying vec2 vUv;
        varying float vDepth;
        void main() {
          float t = smoothstep(-2.2, 2.8, vH);
          vec3 col = mix(uDeep, uShallow, t);
          float crest = smoothstep(1.7, 2.9, vH);
          col = mix(col, vec3(0.82, 0.93, 1.0), crest * 0.35);
          float fog = smoothstep(650.0, 1800.0, vDepth);
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const ocean = new THREE.Mesh(geo, this.oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -1.5;
    this.scene.add(ocean);
  }

  private buildIsland(): void {
    const island = new THREE.Group();

    const sand = new THREE.Mesh(new THREE.CylinderGeometry(C.ISLAND_RADIUS, C.ISLAND_RADIUS + 18, 12, 48), material(0xd9c08a));
    sand.position.y = 2;
    island.add(sand);

    const grass = new THREE.Mesh(new THREE.CylinderGeometry(112, 126, 16, 48), material(0x4f7f3a));
    grass.position.y = 12;
    island.add(grass);

    const peak = new THREE.Mesh(new THREE.ConeGeometry(64, 78, 7), material(0x6b6b5a));
    peak.position.set(-18, 55, -12);
    island.add(peak);

    const peakSnow = new THREE.Mesh(new THREE.ConeGeometry(22, 26, 7), material(0xdfe8ee));
    peakSnow.position.set(-18, 78, -12);
    island.add(peakSnow);

    // Palms
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const r = 88 + Math.random() * 30;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 11, 5), material(0x7a5a33));
      trunk.position.y = 5.5;
      palm.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(5.2, 3.4, 6), material(0x2f6b2c));
      leaves.position.y = 11.4;
      palm.add(leaves);
      palm.position.set(x, 16, z);
      island.add(palm);
    }

    // Cave / dungeon entrance
    const caveRock = new THREE.Mesh(new THREE.DodecahedronGeometry(C.CAVE.radius + 6, 0), material(0x4a4a48));
    caveRock.position.set(C.CAVE.x, 12, C.CAVE.z);
    caveRock.scale.y = 0.8;
    island.add(caveRock);

    const caveMouth = new THREE.Mesh(
      new THREE.CircleGeometry(9, 20),
      new THREE.MeshBasicMaterial({ color: 0x05080b }),
    );
    caveMouth.position.set(C.CAVE.x, 13, C.CAVE.z + C.CAVE.radius + 2);
    island.add(caveMouth);

    this.scene.add(island);
  }

  private buildDock(): void {
    const dock = new THREE.Group();
    const wood = material(0x8a6a44, { roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 10), wood);
      plank.position.set(C.DOCK.x + (i - 2.5) * 6.2, 3, C.DOCK.z);
      dock.add(plank);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 9, 6), wood);
    post.position.set(C.DOCK.x, 0, C.DOCK.z - 8);
    dock.add(post);

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    lamp.position.set(C.DOCK.x, 9.5, C.DOCK.z - 8);
    dock.add(lamp);

    this.scene.add(dock);
  }

  // ------------------------------------------------------------------ entities

  private entityFor(id: string, kind: 'player' | 'npc', faction: FactionId, label: string, scale: number, type?: NpcType): EntityView {
    const accent = FACTIONS[faction].accent;
    const hullColor = type ? NPCS[type].color : FACTIONS[faction].color;
    const group = buildShip(hullColor, accent, type ? scale : 1.25);

    const { bar, fill } = buildBar();
    bar.position.y = 15 * scale;
    group.add(bar);

    const nameColor = faction === 'pirate' ? '#ffb3aa' : '#a8d3ff';
    const labelSprite = makeLabel(label, nameColor);
    labelSprite.position.y = 19 * scale;
    labelSprite.scale.set(16 * Math.max(0.8, scale), 4 * Math.max(0.8, scale), 1);
    group.add(labelSprite);

    this.scene.add(group);
    const view: EntityView = {
      group,
      bar,
      barFill: fill,
      label: labelSprite,
      targetX: 0,
      targetZ: 0,
      targetRot: 0,
      faction,
      isLocal: id === this.localId,
      alive: true,
      bob: Math.random() * Math.PI * 2,
    };
    this.entities.set(id, view);
    return view;
  }

  private applyPlayer(view: EntityView, p: PlayerState): void {
    view.targetX = p.x;
    view.targetZ = p.z;
    view.targetRot = p.rot;
    view.alive = p.alive;
    view.group.visible = p.alive;
    const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));
    view.barFill.scale.x = ratio;
    (view.barFill.material as THREE.MeshBasicMaterial).color.setHex(ratio > 0.5 ? 0x4be07a : ratio > 0.25 ? 0xf0c04a : 0xe0524a);
  }

  sync(snapshot: Snapshot, localId: string): void {
    this.localId = localId;
    const seen = new Set<string>();

    for (const p of snapshot.players) {
      seen.add(p.id);
      let view = this.entities.get(p.id);
      if (!view) {
        view = this.entityFor(p.id, 'player', p.faction, p.name, 1);
        view.targetX = p.x;
        view.targetZ = p.z;
      }
      view.isLocal = p.id === localId;
      this.applyPlayer(view, p);
    }

    for (const n of snapshot.npcs) {
      seen.add(n.id);
      let view = this.entities.get(n.id);
      if (!view) {
        view = this.entityFor(n.id, 'npc', n.faction, NPCS[n.type].name, NPCS[n.type].scale, n.type);
        view.targetX = n.x;
        view.targetZ = n.z;
      }
      view.targetX = n.x;
      view.targetZ = n.z;
      view.targetRot = n.rot;
      view.alive = n.alive;
      view.group.visible = n.alive;
      const ratio = Math.max(0, Math.min(1, n.hp / n.maxHp));
      view.barFill.scale.x = ratio;
      (view.barFill.material as THREE.MeshBasicMaterial).color.setHex(ratio > 0.5 ? 0x4be07a : ratio > 0.25 ? 0xf0c04a : 0xe0524a);
    }

    for (const [id, view] of this.entities) {
      if (!seen.has(id)) {
        this.scene.remove(view.group);
        this.entities.delete(id);
      }
    }

    this.syncProjectiles(snapshot.projectiles);
  }

  private syncProjectiles(list: ProjectileState[]): void {
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.id);
      let mesh = this.projectiles.get(p.id);
      if (!mesh) {
        const geo = new THREE.SphereGeometry(p.kind === 'fireball' ? 1.6 : 0.85, 10, 10);
        const mat =
          p.kind === 'fireball'
            ? new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 2.4 })
            : new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.6 });
        mesh = new THREE.Mesh(geo, mat);
        this.scene.add(mesh);
        this.projectiles.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.kind === 'fireball' ? 5 : 3.2, p.z);
    }
    for (const [id, mesh] of this.projectiles) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.projectiles.delete(id);
      }
    }
  }

  /** Draw the locally predicted ship position (zero-latency feel). */
  setLocalPosition(id: string, x: number, z: number, rot: number, visible: boolean): void {
    const view = this.entities.get(id);
    if (!view) return;
    view.group.position.set(x, 0, z);
    view.group.rotation.y = rot;
    view.group.visible = visible;
  }

  /** Project a world position to CSS pixel coordinates (debug / targeting UI). */
  screenPoint(x: number, z: number, y = 2): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /** Convert a screen position into a world point on the aim plane. */
  aimPoint(clientX: number, clientY: number): { x: number; z: number } {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.aimPlane, this.aim)) {
      return { x: this.aim.x, z: this.aim.z };
    }
    return { x: 0, z: 0 };
  }

  render(local?: { x: number; z: number }): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.oceanMat.uniforms.uTime.value = t;

    for (const view of this.entities.values()) {
      if (view.isLocal) continue;
      view.group.position.x += (view.targetX - view.group.position.x) * Math.min(1, dt * 9);
      view.group.position.z += (view.targetZ - view.group.position.z) * Math.min(1, dt * 9);

      let d = view.targetRot - view.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      view.group.rotation.y += d * Math.min(1, dt * 7);
    }

    for (const view of this.entities.values()) {
      view.bob += dt;
      view.group.position.y = Math.sin(view.bob * 1.6) * 0.35;
      view.bar.quaternion.copy(this.camera.quaternion);
      view.label.quaternion.copy(this.camera.quaternion);
    }

    // Camera follow.
    const focus = local ?? { x: 0, z: 0 };
    this.camTarget.lerp(new THREE.Vector3(focus.x, 0, focus.z), Math.min(1, dt * 3.5));
    const desired = new THREE.Vector3(this.camTarget.x, 62, this.camTarget.z + 112);
    this.camPos.lerp(desired, Math.min(1, dt * 2.6));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget.x, 2, this.camTarget.z - 34);

    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
