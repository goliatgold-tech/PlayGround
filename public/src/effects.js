import * as THREE from 'three';

const RING_GEO = new THREE.RingGeometry(0.82, 1, 36);
RING_GEO.rotateX(-Math.PI / 2);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  add(obj, ttl, update) {
    this.scene.add(obj);
    this.items.push({ obj, ttl, life: ttl, update });
    return obj;
  }

  ring(x, z, color = 0xbfe7ea, maxScale = 18, ttl = 0.9, y = 0.6) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(RING_GEO, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(1.5);
    this.add(mesh, ttl, (o, k) => {
      o.scale.setScalar(1.5 + (1 - k) * maxScale);
      o.material.opacity = 0.75 * k;
    });
  }

  splash(x, z, scale = 1) {
    this.ring(x, z, 0xd8f4f5, 16 * scale, 0.85);
    const count = 14;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      const a = Math.random() * Math.PI * 2;
      const s = (2 + Math.random() * 5) * scale;
      vel.push(new THREE.Vector3(Math.sin(a) * s, 4 + Math.random() * 7, Math.cos(a) * s));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xe8fbfb, size: 1.1 * scale, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.set(x, 0.6, z);
    const arr = geo.attributes.position.array;
    this.add(pts, 1.1, (o, k, dt) => {
      for (let i = 0; i < count; i++) {
        vel[i].y -= 14 * dt;
        arr[i * 3] += vel[i].x * dt;
        arr[i * 3 + 1] += vel[i].y * dt;
        arr[i * 3 + 2] += vel[i].z * dt;
      }
      o.geometry.attributes.position.needsUpdate = true;
      o.material.opacity = 0.9 * k;
    });
  }

  muzzle(x, y, z) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd28a, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), mat);
    flash.position.set(x, y, z);
    this.add(flash, 0.18, (o, k) => {
      o.scale.setScalar(1 + (1 - k) * 1.6);
      o.material.opacity = k;
    });
    this.ring(x, z, 0xffd28a, 5, 0.3, y);
  }

  explosion(x, z, color = 0xff8a3d) {
    this.ring(x, z, color, 26, 1.1);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), mat);
    ball.position.set(x, 3, z);
    this.add(ball, 0.55, (o, k) => {
      o.scale.setScalar(1 + (1 - k) * 2.4);
      o.material.opacity = k * 0.9;
    });
    this.splash(x, z, 1.4);
  }

  ability(x, z, color) {
    this.ring(x, z, color, 44, 1.4);
    this.ring(x, z, color, 26, 1.0);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= dt;
      const k = Math.max(0, item.life / item.ttl);
      if (item.update) item.update(item.obj, k, dt);
      if (item.life <= 0) {
        this.scene.remove(item.obj);
        if (item.obj.geometry) item.obj.geometry.dispose?.();
        if (item.obj.material) {
          if (Array.isArray(item.obj.material)) item.obj.material.forEach((m) => m.dispose?.());
          else item.obj.material.dispose?.();
        }
        this.items.splice(i, 1);
      }
    }
  }
}
