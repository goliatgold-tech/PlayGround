import * as THREE from 'three';

export const SEA = 1500;

export function waveHeight(x, z, t) {
  return Math.sin(x * 0.055 + t * 0.9) * 0.62 +
    Math.sin(z * 0.073 + t * 1.25) * 0.5 +
    Math.sin((x + z) * 0.031 + t * 0.6) * 0.8 +
    Math.sin(x * 0.31 + z * 0.17 + t * 1.9) * 0.12 +
    Math.sin(z * 0.27 - x * 0.11 - t * 1.6) * 0.09;
}

const FACTION_COLORS = {
  pirate: 0x1c1c22,
  marine: 0xe8eef4,
  merchant: 0xc9a227,
  temple: 0x8a5cd6,
  blackmarket: 0x3d2b4f,
  neutral: 0x2f8f83
};

export function factionColor(f) {
  return FACTION_COLORS[f] || FACTION_COLORS.neutral;
}

export const BIOME = {
  temperate: { sand: 0xd9c79a, grass: 0x4e7f4a, rock: 0x6f6a5f, tree: 0x2f5c37 },
  tropical: { sand: 0xefdcae, grass: 0x3f8f52, rock: 0x7a7361, tree: 0x2a7a3d },
  storm: { sand: 0x9a917e, grass: 0x3d5a45, rock: 0x4d4a48, tree: 0x28402f },
  mystic: { sand: 0xe6d3b0, grass: 0x5b6f9a, rock: 0x6b5d86, tree: 0x8a5cd6 },
  swamp: { sand: 0x8f8a6a, grass: 0x4a5f3a, rock: 0x5a5445, tree: 0x3d4a2c },
  rocky: { sand: 0xbdb49b, grass: 0x5c6b4f, rock: 0x7d7669, tree: 0x33502f },
  fog: { sand: 0xa9a99c, grass: 0x4a5a4f, rock: 0x5c5c5c, tree: 0x2f3a33 },
  arctic: { sand: 0xdfe6e8, grass: 0x7d948c, rock: 0x8f9aa0, tree: 0x3e5a52 },
  volcanic: { sand: 0x3a3230, grass: 0x4a3a35, rock: 0x2b2523, tree: 0x3d2f2a }
};

const OCEAN_VERT = /* glsl */`
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;

  float wave(vec2 p, float t) {
    return sin(p.x * 0.055 + t * 0.9) * 0.62
         + sin(p.y * 0.073 + t * 1.25) * 0.5
         + sin((p.x + p.y) * 0.031 + t * 0.6) * 0.8
         + sin(p.x * 0.31 + p.y * 0.17 + t * 1.9) * 0.12
         + sin(p.y * 0.27 - p.x * 0.11 - t * 1.6) * 0.09;
  }

  void main() {
    vec3 p = position;
    float h = wave(p.xz, uTime);
    p.y = h;
    float e = 1.4;
    float hx = wave(p.xz + vec2(e, 0.0), uTime);
    float hz = wave(p.xz + vec2(0.0, e), uTime);
    vNormal = normalize(vec3(h - hx, e, h - hz));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const OCEAN_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec3 uCamPos;
  uniform vec3 uIslands[12];
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(uCamPos - vWorld);
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6);

    float d = 1e9;
    for (int i = 0; i < 12; i++) {
      d = min(d, distance(vWorld.xz, uIslands[i].xy) - uIslands[i].z);
    }
    float shallow = smoothstep(70.0, 0.0, d);
    vec3 base = mix(uDeep, uShallow, shallow * 0.75 + fres * 0.35);

    vec3 halfDir = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, halfDir), 0.0), 90.0) * 1.5;
    float sparkle = pow(max(dot(n, halfDir), 0.0), 420.0) * 2.5;
    float glint = pow(max(dot(n, halfDir), 0.0), 24.0) * 0.06;
    float bands = smoothstep(0.62, 1.0, sin(vWorld.x * 0.11 + vWorld.z * 0.07 + uTime * 0.7) * 0.5 + 0.5) * 0.02;

    float foam = smoothstep(7.0, -1.0, d) * (0.5 + 0.5 * sin(uTime * 1.8 + vWorld.x * 0.25 + vWorld.z * 0.2));
    base = mix(base, vec3(0.88, 0.96, 0.97), clamp(foam, 0.0, 0.85));

    vec3 col = base + vec3(1.0, 0.94, 0.78) * (spec + sparkle + glint) + bands;
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * distance(uCamPos, vWorld) * distance(uCamPos, vWorld));
    col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform float uNight;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    float h = clamp(vDir.y * 1.6 + 0.15, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.75));
    float sun = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
    col += vec3(1.0, 0.82, 0.55) * pow(sun, 220.0) * 2.2;
    col += vec3(1.0, 0.7, 0.4) * pow(sun, 12.0) * 0.28;
    if (uNight > 0.01) {
      vec3 sp = floor(vDir * 380.0);
      float star = step(0.9975, hash(sp)) * uNight * smoothstep(0.45, 0.85, uNight);
      col += vec3(0.9, 0.95, 1.0) * star * 1.2;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export class World {
  constructor(scene, islands) {
    this.scene = scene;
    this.islands = islands;
    this.time = 120;
    this.sunDir = new THREE.Vector3(0.5, 0.75, 0.35).normalize();
    this.night = 0;
    this.clouds = [];
    this.labels = [];
    this.sunLight = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.hemi = new THREE.HemisphereLight(0xbfe9ff, 0x2c4a52, 1.15);
    this.scene.add(this.sunLight, this.hemi);
    this.scene.add(new THREE.AmbientLight(0x9fd6dd, 0.25));
    this.buildSky();
    this.buildOcean();
    this.buildIslands();
    this.buildClouds();
    this.buildHorizon();
  }

  buildSky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color(0x2e7fb8) },
      uHorizon: { value: new THREE.Color(0xbfe7ea) },
      uSunDir: { value: this.sunDir },
      uNight: { value: 0 }
    };
    const geo = new THREE.SphereGeometry(3800, 32, 20);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  buildOcean() {
    const geo = new THREE.PlaneGeometry(3600, 3600, 300, 300);
    geo.rotateX(-Math.PI / 2);
    this.oceanUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: this.sunDir },
      uDeep: { value: new THREE.Color(0x0b3550) },
      uShallow: { value: new THREE.Color(0x1c8f8f) },
      uFogColor: { value: new THREE.Color(0xbfe7ea) },
      uFogDensity: { value: 0.00072 },
      uCamPos: { value: new THREE.Vector3() },
      uIslands: { value: Array.from({ length: 12 }, (_, i) => {
        const isl = this.islands[i];
        return isl ? new THREE.Vector3(isl.x, isl.z, isl.radius * 0.9) : new THREE.Vector3(9999, 9999, 0);
      }) }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.oceanUniforms,
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      fog: false
    });
    this.ocean = new THREE.Mesh(geo, mat);
    this.ocean.frustumCulled = false;
    this.scene.add(this.ocean);
  }

  buildHorizon() {
    // A soft ring of distant silhouettes keeps the sea from looking endless-flat.
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x7fb0b8, transparent: true, opacity: 0.55, fog: true });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.sin(i * 3.1) * 0.05;
      const r = 2350 + Math.sin(i * 7.7) * 120;
      const h = 30 + Math.abs(Math.sin(i * 2.3)) * 90;
      const m = new THREE.Mesh(new THREE.ConeGeometry(90 + Math.sin(i) * 30, h, 5), mat);
      m.position.set(Math.sin(a) * r, h / 2 - 20, Math.cos(a) * r);
      m.rotation.y = a;
      group.add(m);
    }
    this.scene.add(group);
  }

  buildClouds() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: true });
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group();
      const n = 3 + (i % 3);
      for (let j = 0; j < n; j++) {
        const s = 16 + Math.random() * 22;
        const m = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat);
        m.scale.y = 0.45;
        m.position.set((j - n / 2) * s * 0.9, Math.random() * 5, Math.random() * 18);
        g.add(m);
      }
      const a = Math.random() * Math.PI * 2;
      const r = 300 + Math.random() * 1600;
      g.position.set(Math.sin(a) * r, 120 + Math.random() * 90, Math.cos(a) * r);
      g.userData.speed = 1.5 + Math.random() * 2;
      this.clouds.push(g);
      this.scene.add(g);
    }
  }

  buildIslands() {
    for (const isl of this.islands) {
      const palette = BIOME[isl.biome] || BIOME.temperate;
      const group = new THREE.Group();
      group.position.set(isl.x, 0, isl.z);
      const r = isl.radius;

      // shallow shelf
      const shelf = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 1.22, r * 1.3, 2.4, 40),
        new THREE.MeshLambertMaterial({ color: 0x2aa3a0, transparent: true, opacity: 0.55 })
      );
      shelf.position.y = -1.6;
      group.add(shelf);

      // beach
      const beach = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 1.06, 5, 40),
        new THREE.MeshLambertMaterial({ color: palette.sand })
      );
      beach.position.y = -0.3;
      group.add(beach);

      // flat land plateau with a soft green top
      const land = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.88, r * 0.93, 6, 40),
        new THREE.MeshLambertMaterial({ color: palette.grass })
      );
      land.position.y = 2.4;
      group.add(land);

      // slope from beach up to the plateau
      const slope = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.88, r * 1.02, 3.6, 40),
        new THREE.MeshLambertMaterial({ color: palette.sand })
      );
      slope.position.y = 3.5;
      group.add(slope);

      // low hill in the middle of wild islands
      if (!['town', 'market', 'pirate', 'smuggler', 'fortress', 'temple', 'volcano'].includes(isl.type)) {
        const hill = new THREE.Mesh(
          new THREE.SphereGeometry(r * 0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshLambertMaterial({ color: palette.grass })
        );
        hill.scale.y = 0.1;
        hill.position.y = 5.3;
        group.add(hill);
      }

      // rocks / peak
      if (isl.type === 'volcano') {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(r * 0.34, r * 0.75, 9),
          new THREE.MeshLambertMaterial({ color: palette.rock })
        );
        cone.position.y = r * 0.3;
        group.add(cone);
        const lava = new THREE.Mesh(
          new THREE.ConeGeometry(r * 0.13, r * 0.2, 9),
          new THREE.MeshBasicMaterial({ color: 0xff5a1f })
        );
        lava.position.y = r * 0.62;
        group.add(lava);
        const glow = new THREE.PointLight(0xff6a2a, 2.5, 260, 2);
        glow.position.y = r * 0.6;
        group.add(glow);
      } else if (isl.type === 'fortress') {
        this.addFortress(group, r, isl, palette);
      } else if (isl.type === 'temple') {
        this.addTemple(group, r, palette);
      } else if (isl.type === 'town' || isl.type === 'market' || isl.type === 'pirate' || isl.type === 'smuggler') {
        this.addTown(group, r, isl, palette);
      } else {
        this.addRuins(group, r, palette);
      }

      // palms
      const palmCount = Math.round(5 + r / 16);
      for (let i = 0; i < palmCount; i++) {
        const a = (i / palmCount) * Math.PI * 2 + Math.sin(i * 5.3) * 0.4;
        const rr = r * (0.45 + (i % 5) * 0.085);
        const palm = makePalm(palette.tree, 0.8 + (i % 4) * 0.12);
        palm.position.set(Math.sin(a) * rr, 5.4, Math.cos(a) * rr);
        palm.rotation.z = Math.sin(i * 2.1) * 0.08;
        group.add(palm);
      }

      // dock pointing toward the world centre
      const dockAngle = Math.atan2(-isl.x, -isl.z);
      const dock = this.makeDock(r, isl, palette);
      dock.position.set(Math.sin(dockAngle) * (r + 8), 2.0, Math.cos(dockAngle) * (r + 8));
      dock.rotation.y = dockAngle;
      group.add(dock);
      isl.dock = {
        x: isl.x + Math.sin(dockAngle) * (r + 30),
        z: isl.z + Math.cos(dockAngle) * (r + 30),
        angle: dockAngle
      };

      // flag
      const flagPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, 30, 6),
        new THREE.MeshLambertMaterial({ color: 0x3a2a1c })
      );
      flagPole.position.set(0, 16, 0);
      group.add(flagPole);
      const flagMat = new THREE.MeshLambertMaterial({ color: factionColor(isl.faction), side: THREE.DoubleSide });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(9, 5, 6, 1), flagMat);
      flag.position.set(4.6, 27, 0);
      group.add(flag);

      // name label
      const label = makeLabel(isl.name, isl.faction);
      label.position.set(0, 34, 0);
      group.add(label);
      this.labels.push(label);

      this.scene.add(group);
      isl.group = group;
      isl.waveFlag = flag;
    }
  }

  addTown(group, r, isl, palette) {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe4d6b8 });
    const roofMat = new THREE.MeshLambertMaterial({ color: isl.faction === 'pirate' ? 0x5a2f2a : 0x8c4a35 });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const count = isl.type === 'town' ? 9 : 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.4;
      const rr = r * (0.24 + (i % 3) * 0.14);
      const w = 8 + (i % 3) * 3;
      const h = 7 + (i % 4) * 2.5;
      const house = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), wallMat);
      body.position.y = h / 2;
      house.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 4.5, 4), roofMat);
      roof.position.y = h + 2.2;
      roof.rotation.y = Math.PI / 4;
      house.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3, 0.4), woodMat);
      door.position.set(0, 1.5, w * 0.4 + 0.1);
      house.add(door);
      house.position.set(Math.sin(a) * rr, 5.3, Math.cos(a) * rr);
      house.rotation.y = a + Math.PI;
      group.add(house);
    }
    if (isl.type === 'town') {
      // tavern with a big lantern
      const tavern = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(18, 11, 12), wallMat);
      body.position.y = 5.5;
      tavern.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(14, 6, 4), roofMat);
      roof.position.y = 14;
      roof.rotation.y = Math.PI / 4;
      tavern.add(roof);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc86b }));
      lantern.position.set(0, 8, 6.4);
      tavern.add(lantern);
      tavern.position.set(0, 5.5, -r * 0.3);
      group.add(tavern);
    }
  }

  addFortress(group, r, isl, palette) {
    const stone = new THREE.MeshLambertMaterial({ color: 0xcfd6d6 });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.55, 16, 6), stone);
    wall.position.y = 10;
    group.add(wall);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 24, 8), stone);
      tower.position.set(Math.sin(a) * r * 0.5, 14, Math.cos(a) * r * 0.5);
      group.add(tower);
      const top = new THREE.Mesh(new THREE.ConeGeometry(7.4, 7, 8), new THREE.MeshLambertMaterial({ color: 0x2b4f6e }));
      top.position.set(Math.sin(a) * r * 0.5, 29, Math.cos(a) * r * 0.5);
      group.add(top);
    }
    const keep = new THREE.Mesh(new THREE.BoxGeometry(26, 34, 26), stone);
    keep.position.y = 20;
    group.add(keep);
  }

  addTemple(group, r, palette) {
    const stone = new THREE.MeshLambertMaterial({ color: 0xcfc3dd });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.42, 5, 8), stone);
    base.position.y = 6.5;
    group.add(base);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(24, 13, 18), stone);
    hall.position.y = 14.5;
    group.add(hall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(24, 9, 4), new THREE.MeshLambertMaterial({ color: 0x6d4fa0 }));
    roof.position.y = 24.5;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 20, 8), stone);
      pillar.position.set(Math.sin(a) * 22, 14.5, Math.cos(a) * 22);
      group.add(pillar);
    }
    const orb = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xc9a8ff }));
    orb.position.y = 34;
    group.add(orb);
    const glow = new THREE.PointLight(0xb48cff, 2.2, 180, 2);
    glow.position.y = 34;
    group.add(glow);
  }

  addRuins(group, r, palette) {
    const stone = new THREE.MeshLambertMaterial({ color: 0x9a9584 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const h = 4 + (i % 3) * 5;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, h, 7), stone);
      pillar.position.set(Math.sin(a) * r * 0.3, h / 2 + 5.5, Math.cos(a) * r * 0.3);
      pillar.rotation.z = (i % 2 ? 0.15 : -0.1);
      group.add(pillar);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(4 + i, 0), stone);
      rock.position.set(Math.sin(a) * r * 0.6, 7, Math.cos(a) * r * 0.6);
      group.add(rock);
    }
  }

  makeDock(r, isl, palette) {
    const dock = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 40), wood);
    deck.position.y = 0;
    dock.add(deck);
    for (let i = 0; i < 6; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 12, 5), wood);
      post.position.set(-3, -5, -16 + i * 6.5);
      dock.add(post);
      const post2 = post.clone();
      post2.position.x = 3;
      dock.add(post2);
    }
    const crane = new THREE.Mesh(new THREE.BoxGeometry(1, 14, 1), wood);
    crane.position.set(0, 7, 14);
    dock.add(crane);
    return dock;
  }

  update(dt, camera, elapsed) {
    this.time += dt;
    this.oceanUniforms.uTime.value = this.time;
    this.oceanUniforms.uCamPos.value.copy(camera.position);

    const cycle = (Math.sin(this.time * 0.012) + 1) / 2; // slow day/night
    const day = 0.25 + cycle * 0.75;
    this.sunDir.set(Math.cos(this.time * 0.012) * 0.8, 0.25 + day * 0.7, 0.35).normalize();
    this.sunLight.position.copy(this.sunDir).multiplyScalar(600);
    this.sunLight.intensity = 0.5 + day * 2.0;
    this.hemi.intensity = 0.35 + day * 0.9;
    this.night = 1 - day;

    const top = new THREE.Color(0x0a1830).lerp(new THREE.Color(0x2e7fb8), day);
    const horizon = new THREE.Color(0x1c2740).lerp(new THREE.Color(0xbfe7ea), day);
    this.skyUniforms.uTop.value.copy(top);
    this.skyUniforms.uHorizon.value.copy(horizon);
    this.skyUniforms.uNight.value = this.night;
    this.oceanUniforms.uFogColor.value.copy(horizon);
    this.oceanUniforms.uDeep.value.setRGB(0.02 + day * 0.03, 0.1 + day * 0.11, 0.18 + day * 0.15);
    this.oceanUniforms.uShallow.value.setRGB(0.03 + day * 0.08, 0.32 + day * 0.24, 0.32 + day * 0.24);
    this.sky.position.copy(camera.position);

    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 2200) c.position.x = -2200;
    }
    for (const isl of this.islands) {
      if (isl.waveFlag) isl.waveFlag.rotation.y = Math.sin(this.time * 2 + isl.x) * 0.18;
    }
  }
}

export function makePalm(color, scale = 1) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const segments = 4;
  for (let i = 0; i < segments; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.55 - i * 0.06, 0.7 - i * 0.06, 4.2, 5), trunkMat);
    seg.position.y = 2 + i * 3.7;
    seg.position.x = Math.sin(i * 0.5) * 0.9;
    seg.rotation.z = Math.sin(i * 0.5) * 0.08;
    group.add(seg);
  }
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(2.4, 8, 4), leafMat);
    leaf.position.y = 16;
    leaf.rotation.z = Math.PI / 2.4;
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    leaf.position.x = Math.sin((i / 6) * Math.PI * 2) * 3.2;
    leaf.position.z = Math.cos((i / 6) * Math.PI * 2) * 3.2;
    leaf.scale.y = 0.7;
    group.add(leaf);
  }
  group.scale.setScalar(scale);
  return group;
}

export function makeLabel(text, faction) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '600 54px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(4, 16, 22, 0.55)';
  const w = ctx.measureText(text).width + 48;
  ctx.beginPath();
  ctx.roundRect(256 - w / 2, 26, w, 76, 18);
  ctx.fill();
  ctx.strokeStyle = '#' + factionColor(faction).toString(16).padStart(6, '0');
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#f4ecd9';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(34, 8.5, 1);
  return sprite;
}
