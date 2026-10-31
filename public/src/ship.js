import * as THREE from 'three';

const sailCache = new Map();

function sailTexture(faction) {
  if (sailCache.has(faction)) return sailCache.get(faction);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 384);
  grad.addColorStop(0, '#f6eeda');
  grad.addColorStop(1, '#d9c9a8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 384);
  ctx.strokeStyle = 'rgba(120, 96, 66, 0.22)';
  ctx.lineWidth = 6;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 64);
    ctx.lineTo(512, i * 64);
    ctx.stroke();
  }
  const colors = {
    pirate: '#1d1d24', marine: '#22496e', merchant: '#a2761f',
    temple: '#6b4a9e', blackmarket: '#3d2b4f', neutral: '#2f8f83'
  };
  ctx.fillStyle = colors[faction] || colors.neutral;
  ctx.beginPath();
  ctx.arc(256, 160, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2e7cf';
  ctx.font = 'bold 74px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(faction === 'marine' ? '⚓' : faction === 'temple' ? '☯' : '☠', 256, 166);
  ctx.strokeStyle = colors[faction] || colors.neutral;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 368);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  sailCache.set(faction, tex);
  return tex;
}

function makeSail(width, height, faction) {
  const geo = new THREE.PlaneGeometry(width, height, 10, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const bulge = Math.cos((x / width) * Math.PI) * (0.9 + 0.2 * Math.cos((y / height) * Math.PI));
    pos.setZ(i, bulge);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    map: sailTexture(faction),
    side: THREE.DoubleSide,
    color: 0xffffff
  });
  return new THREE.Mesh(geo, mat);
}

export function buildShip({ shipId = 'sloop', faction = 'pirate', accent = 0x2f8f83 } = {}) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x5c3d24 });
  const deckMat = new THREE.MeshLambertMaterial({ color: 0xa87c4f });
  const trimMat = new THREE.MeshLambertMaterial({ color: accent });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1b1b20 });
  const goldMat = new THREE.MeshLambertMaterial({ color: 0xd8b25e, emissive: 0x4a3000, emissiveIntensity: 0.4 });
  const plankMat = new THREE.MeshLambertMaterial({ color: 0x8a6440 });

  // hull outline (top view), extruded and laid flat
  const shape = new THREE.Shape();
  shape.moveTo(0, 10);
  shape.quadraticCurveTo(3.5, 6.2, 3.3, -3.5);
  shape.lineTo(2.4, -7.5);
  shape.lineTo(-2.4, -7.5);
  shape.lineTo(-3.3, -3.5);
  shape.quadraticCurveTo(-3.5, 6.2, 0, 10);
  const hullGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 3.2, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3,
    bevelSegments: 2, curveSegments: 10
  });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 3.4;
  group.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 14.2), deckMat);
  deck.position.set(0, 3.6, -0.6);
  group.add(deck);

  for (let i = 0; i < 7; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.06, 0.12), plankMat);
    plank.position.set(0, 3.87, -7 + i * 2.1);
    group.add(plank);
  }

  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 6, 14), darkMat);
  wheel.position.set(0, 4.9, -5.2);
  group.add(wheel);
  const wheelPost = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 5), darkMat);
  wheelPost.position.set(0, 4.35, -5.2);
  group.add(wheelPost);

  for (const [bx, bz] of [[-2, 5.6], [2.1, 4.4], [-1.9, -6.4]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 8), plankMat);
    barrel.position.set(bx, 4.2, bz);
    group.add(barrel);
  }

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.7, 12.6), trimMat);
  stripe.position.y = 1.5;
  group.add(stripe);

  // stern cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.6, 4.4), deckMat);
  cabin.position.set(0, 4.9, -4.6);
  group.add(cabin);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 5), trimMat);
  cabinRoof.position.set(0, 6.3, -4.6);
  group.add(cabinRoof);
  const window1 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
  window1.position.set(0, 5.3, -2.38);
  group.add(window1);

  // stern gallery with lit windows so the ship reads from behind
  const gallery = new THREE.Mesh(new THREE.BoxGeometry(4.7, 1.7, 0.9), deckMat);
  gallery.position.set(0, 4.5, -7.1);
  group.add(gallery);
  for (const gx of [-1.45, 0, 1.45]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.65), new THREE.MeshBasicMaterial({ color: 0xffcf7a }));
    win.position.set(gx, 4.65, -7.57);
    win.rotation.y = Math.PI;
    group.add(win);
  }
  const figurehead = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), goldMat);
  figurehead.position.set(0, 4.4, 9.4);
  group.add(figurehead);

  // bowsprit
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 8, 6), hullMat);
  bowsprit.rotation.x = Math.PI / 2.55;
  bowsprit.position.set(0, 4.3, 9.6);
  group.add(bowsprit);

  const mastCount = shipId === 'galleon' ? 3 : shipId === 'brig' ? 2 : 2;
  const mastZ = mastCount === 3 ? [3.6, -0.2, -3.6] : mastCount === 2 ? [3.2, -2.2] : [1.8];
  const sails = [];
  const masts = [];
  mastZ.forEach((z, idx) => {
    const h = idx === 0 ? 17 : idx === 1 ? 15.5 : 13;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, h, 6), hullMat);
    mast.position.set(0, 3.6 + h / 2, z);
    group.add(mast);
    masts.push(mast);

    const sailW = idx === 0 ? 8.6 : 7.4;
    const sailH = idx === 0 ? 6.4 : 5.2;
    const sail = makeSail(sailW, sailH, faction);
    sail.position.set(0, 3.6 + h * 0.62, z + 0.25);
    group.add(sail);
    sails.push(sail);

    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, sailW + 1.2, 5), darkMat);
    yard.rotation.z = Math.PI / 2;
    yard.position.set(0, 3.6 + h * 0.62 + sailH / 2, z + 0.2);
    group.add(yard);
  });

  // crow's nest
  const nest = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.9, 0.8, 8), darkMat);
  nest.position.set(0, 19.6, mastZ[0]);
  group.add(nest);

  // flag
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2, 6, 1),
    new THREE.MeshLambertMaterial({ map: sailTexture(faction), side: THREE.DoubleSide })
  );
  flag.position.set(1.8, 19.9, mastZ[0]);
  group.add(flag);

  // cannons
  const muzzles = [];
  const cannonRows = shipId === 'galleon' ? 4 : shipId === 'brig' ? 3 : 2;
  for (let side of [-1, 1]) {
    for (let i = 0; i < cannonRows; i++) {
      const z = 5.4 - i * 4.2;
      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.5, 7), darkMat);
      cannon.rotation.z = Math.PI / 2;
      cannon.position.set(side * 3.5, 2.6, z);
      group.add(cannon);
      muzzles.push({ side, pos: new THREE.Vector3(side * 4.2, 2.7, z) });
    }
  }

  // railings + portholes give the hull a readable silhouette
  const railMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 4), railMat);
      post.position.set(side * 2.7, 4.15, -7 + i * 2.1);
      group.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 13.2), railMat);
    rail.position.set(side * 2.7, 4.7, -0.5);
    group.add(rail);
    for (let i = 0; i < 3; i++) {
      const port = new THREE.Mesh(new THREE.CircleGeometry(0.32, 8), new THREE.MeshBasicMaterial({ color: 0x14100d }));
      port.position.set(side * 3.34, 2.5, 3.2 - i * 3.4);
      port.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(port);
    }
  }

  // lantern
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
  lantern.position.set(0, 6.9, -7.1);
  group.add(lantern);

  // decorative gold trim for higher classes
  if (shipId !== 'sloop') {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.25, 14.5), goldMat);
    trim.position.y = 2.1;
    group.add(trim);
  }

  group.userData = { sails, flag, muzzles, length: 19, shipId, lantern, masts };
  return group;
}

export function buildCaptain({ coat = 0x263a5c, hat = 0x1c1c22, skin = 0xd9a87a } = {}) {
  const group = new THREE.Group();
  const coatMat = new THREE.MeshLambertMaterial({ color: coat });
  const hatMat = new THREE.MeshLambertMaterial({ color: hat });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.5, 4, 8), coatMat);
  body.position.y = 2.0;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), skinMat);
  head.position.y = 3.3;
  group.add(head);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.14, 12), hatMat);
  brim.position.y = 3.62;
  group.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.7, 10), hatMat);
  crown.position.y = 3.95;
  group.add(crown);

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.3, 0.4), legMat);
    leg.position.set(side * 0.28, 0.7, 0);
    group.add(leg);
    legs.push(leg);
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.1, 3, 6), coatMat);
    arm.position.set(side * 0.78, 2.2, 0);
    arm.rotation.z = side * 0.12;
    group.add(arm);
    arms.push(arm);
  }

  group.userData = { legs, arms };
  group.scale.setScalar(0.78);
  return group;
}

export function buildCrate() {
  const group = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5330 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xffd479, emissive: 0x8a5a00, emissiveIntensity: 0.8 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), wood);
  group.add(box);
  for (const y of [-1.21, 1.21]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 2.5), gold);
    band.position.y = y;
    group.add(band);
  }
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.16, depthWrite: false })
  );
  group.add(glow);
  group.userData.glow = glow;
  return group;
}

export function buildProjectile() {
  const geo = new THREE.SphereGeometry(0.42, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  return new THREE.Mesh(geo, mat);
}
