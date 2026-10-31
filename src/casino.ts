import * as THREE from 'three'
import {
  carpetTexture,
  emblemTexture,
  goldMarbleTexture,
  rouletteTexture,
  signTexture,
  slotScreenTexture,
  sunburstTexture,
  wallMarbleTexture,
  woodTexture,
} from './textures'

export type InteractableKind = 'slot' | 'blackjack' | 'roulette' | 'bar'

export type Interactable = {
  id: string
  kind: InteractableKind
  label: string
  detail: string
  position: THREE.Vector3
  radius: number
  variant?: 'high'
}

export type BoxCollider = {
  shape: 'box'
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  enabled: boolean
}

export type CircleCollider = {
  shape: 'circle'
  x: number
  z: number
  radius: number
  enabled: boolean
}

export type Collider = BoxCollider | CircleCollider

export type CasinoWorld = {
  scene: THREE.Scene
  interactables: Interactable[]
  colliders: Collider[]
  update: (elapsed: number, delta: number, player: THREE.Vector3) => void
}

function box(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  shadows = true,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = shadows
  mesh.receiveShadow = shadows
  parent.add(mesh)
  return mesh
}

function cylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  shadows = true,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = shadows
  mesh.receiveShadow = shadows
  parent.add(mesh)
  return mesh
}

function plane(
  parent: THREE.Object3D,
  width: number,
  height: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  rotationY = 0,
  rotationX = 0,
) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  mesh.position.set(x, y, z)
  mesh.rotation.set(rotationX, rotationY, 0)
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function addPointLight(
  parent: THREE.Object3D,
  color: number,
  intensity: number,
  distance: number,
  x: number,
  y: number,
  z: number,
  decay = 2,
) {
  const light = new THREE.PointLight(color, intensity, distance, decay)
  light.position.set(x, y, z)
  parent.add(light)
  return light
}

function makeSign(
  parent: THREE.Object3D,
  text: string,
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
  rotationY = 0,
  color?: string,
  glow?: string,
) {
  const texture = signTexture(text, {
    width: 1024,
    height: Math.max(180, Math.round((1024 * height) / width)),
    color,
    glow,
    size: Math.round((Math.max(180, (1024 * height) / width)) * 0.52),
  })
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const mesh = plane(parent, width, height, material, x, y, z, rotationY)
  mesh.renderOrder = 3
  return mesh
}

function makeFrame(
  parent: THREE.Object3D,
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  goldMaterial: THREE.Material,
  wallMaterial: THREE.Material,
) {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  group.rotation.y = rotationY
  parent.add(group)
  box(group, width, height, 0.08, wallMaterial, 0, 0, 0)
  box(group, width + 0.18, 0.14, 0.14, goldMaterial, 0, height / 2 + 0.03, 0.03)
  box(group, width + 0.18, 0.14, 0.14, goldMaterial, 0, -height / 2 - 0.03, 0.03)
  box(group, 0.14, height + 0.18, 0.14, goldMaterial, -width / 2 - 0.03, 0, 0.03)
  box(group, 0.14, height + 0.18, 0.14, goldMaterial, width / 2 + 0.03, 0, 0.03)
  return group
}

export function createCasinoWorld(): CasinoWorld {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x080603)
  scene.fog = new THREE.FogExp2(0x0b0703, 0.016)

  const interactables: Interactable[] = []
  const colliders: Collider[] = []

  const goldTexture = goldMarbleTexture()
  const wallTexture = wallMarbleTexture()
  const wood = woodTexture()
  const carpet = carpetTexture()
  const sunburst = sunburstTexture()
  const emblem = emblemTexture()
  const slotFace = slotScreenTexture()
  const rouletteFace = rouletteTexture()

  const gold = new THREE.MeshStandardMaterial({
    color: 0xd8b04a,
    metalness: 0.92,
    roughness: 0.3,
    envMapIntensity: 1.45,
  })
  const paleGold = new THREE.MeshStandardMaterial({
    color: 0xf4d77c,
    metalness: 0.86,
    roughness: 0.29,
    emissive: 0x2d1b00,
    emissiveIntensity: 0.2,
    envMapIntensity: 1.5,
  })
  const agedGold = new THREE.MeshStandardMaterial({
    color: 0x8a641d,
    metalness: 0.85,
    roughness: 0.38,
    envMapIntensity: 1.1,
  })
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x17130d,
    metalness: 0.8,
    roughness: 0.34,
    envMapIntensity: 0.7,
  })
  const wall = new THREE.MeshStandardMaterial({
    map: wallTexture,
    color: 0xa98045,
    roughness: 0.54,
    metalness: 0.14,
    envMapIntensity: 0.82,
  })
  const darkWall = new THREE.MeshStandardMaterial({
    map: wallTexture,
    color: 0x5b411d,
    roughness: 0.66,
    metalness: 0.1,
    envMapIntensity: 0.62,
  })
  const floor = new THREE.MeshPhysicalMaterial({
    map: goldTexture,
    color: 0xffc247,
    metalness: 0.3,
    roughness: 0.28,
    clearcoat: 0.7,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.02,
  })
  const felt = new THREE.MeshStandardMaterial({
    color: 0x075332,
    roughness: 0.94,
    metalness: 0.02,
  })
  const velvet = new THREE.MeshStandardMaterial({
    color: 0x4e0711,
    roughness: 0.98,
    metalness: 0.02,
  })
  const woodMaterial = new THREE.MeshStandardMaterial({
    map: wood,
    color: 0xb07940,
    roughness: 0.46,
    metalness: 0.18,
    envMapIntensity: 0.8,
  })
  const ceiling = new THREE.MeshStandardMaterial({
    color: 0x0d0b08,
    roughness: 0.88,
    metalness: 0.14,
  })
  const warmLight = new THREE.MeshBasicMaterial({
    color: 0xffd98a,
    toneMapped: false,
  })
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x2b9fa2,
    metalness: 0.15,
    roughness: 0.06,
    transparent: true,
    opacity: 0.72,
    envMapIntensity: 2.1,
    clearcoat: 1,
  })

  // ── Architecture ────────────────────────────────────────────────────────
  const lobbyFloor = new THREE.Mesh(new THREE.PlaneGeometry(34, 30), floor)
  lobbyFloor.rotation.x = -Math.PI / 2
  lobbyFloor.receiveShadow = true
  scene.add(lobbyFloor)

  const rearFloor = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), floor)
  rearFloor.rotation.x = -Math.PI / 2
  rearFloor.position.set(0, 0, -21)
  rearFloor.receiveShadow = true
  scene.add(rearFloor)

  const medallion = new THREE.Mesh(
    new THREE.CircleGeometry(5.4, 96),
    new THREE.MeshBasicMaterial({
      map: sunburst,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0.4,
    }),
  )
  medallion.rotation.x = -Math.PI / 2
  medallion.position.set(0, 0.015, 2.3)
  scene.add(medallion)

  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 21),
    new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.96, metalness: 0.01 }),
  )
  runner.rotation.x = -Math.PI / 2
  runner.position.set(0, 0.02, 3.3)
  runner.receiveShadow = true
  scene.add(runner)

  const rearRunner = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 9.4),
    new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.96, metalness: 0.01 }),
  )
  rearRunner.rotation.x = -Math.PI / 2
  rearRunner.position.set(0, 0.02, -20.5)
  scene.add(rearRunner)

  // Lobby shell.
  box(scene, 0.7, 9, 30, wall, -17.2, 4.5, 0, false)
  box(scene, 0.7, 9, 30, wall, 17.2, 4.5, 0, false)
  box(scene, 34, 9, 0.7, wall, 0, 4.5, 15.2, false)
  box(scene, 15, 9, 0.7, wall, -9.5, 4.5, -15.2, false)
  box(scene, 15, 9, 0.7, wall, 9.5, 4.5, -15.2, false)
  box(scene, 4, 3.6, 0.7, wall, 0, 7.2, -15.2, false)

  // Rear high-stakes salon.
  box(scene, 0.7, 7.2, 12, darkWall, -7.2, 3.6, -21, false)
  box(scene, 0.7, 7.2, 12, darkWall, 7.2, 3.6, -21, false)
  box(scene, 14.7, 7.2, 0.7, darkWall, 0, 3.6, -27.2, false)
  box(scene, 14.7, 0.4, 12, ceiling, 0, 7.05, -21, false)

  // Ceilings and gold coffer beams.
  box(scene, 34.7, 0.35, 30.7, ceiling, 0, 9.05, 0, false)
  for (const z of [-12, -6, 0, 6, 12]) {
    box(scene, 34, 0.26, 0.3, agedGold, 0, 8.8, z, false)
  }
  for (const x of [-12, -6, 0, 6, 12]) {
    box(scene, 0.3, 0.26, 30, agedGold, x, 8.8, 0, false)
  }
  for (let z = -10; z <= 10; z += 5) {
    for (let x = -10; x <= 10; x += 5) {
      const panel = plane(
        scene,
        2.5,
        2.5,
        new THREE.MeshBasicMaterial({ color: 0x8f6823, transparent: true, opacity: 0.08, toneMapped: false }),
        x,
        8.77,
        z,
        0,
        Math.PI / 2,
      )
      panel.rotation.z = Math.PI / 4
    }
  }

  // Wainscoting and pilasters.
  for (const side of [-1, 1]) {
    box(scene, 0.22, 1.25, 29.4, woodMaterial, side * 16.83, 0.64, 0, false)
    box(scene, 0.3, 0.13, 29.5, gold, side * 16.67, 1.31, 0, false)
    box(scene, 0.3, 0.13, 29.5, gold, side * 16.67, 0.05, 0, false)
    for (const z of [-13, -8.6, -4.3, 0, 4.3, 8.6, 13]) {
      box(scene, 0.34, 8.7, 0.34, agedGold, side * 16.77, 4.4, z, false)
      box(scene, 0.56, 0.34, 0.56, gold, side * 16.7, 0.22, z, false)
      box(scene, 0.52, 0.24, 0.52, gold, side * 16.7, 8.45, z, false)
    }
  }
  box(scene, 33.8, 0.13, 0.3, gold, 0, 1.31, 14.8, false)
  // The rear wainscot rail stops at the central arch so it never cuts across
  // the open doorway when the salon doors slide apart.
  box(scene, 15.7, 0.13, 0.3, gold, -9.85, 1.31, -14.8, false)
  box(scene, 15.7, 0.13, 0.3, gold, 9.85, 1.31, -14.8, false)
  box(scene, 33.6, 1.2, 0.2, woodMaterial, 0, 0.63, 14.83, false)
  box(scene, 33.8, 0.12, 0.26, gold, 0, 1.3, 14.75, false)

  // Grand central arch to the high-stakes salon.
  const arch = new THREE.Group()
  scene.add(arch)
  for (const x of [-2.55, 2.55]) {
    box(arch, 0.65, 5.8, 0.9, agedGold, x, 2.9, -14.95)
    box(arch, 1.05, 0.35, 1.2, gold, x, 0.17, -14.95)
    box(arch, 0.92, 0.28, 1.08, gold, x, 5.72, -14.95)
    cylinder(arch, 0.42, 0.46, 4.4, 18, paleGold, x, 2.95, -14.6, false)
  }
  box(arch, 6.2, 0.42, 0.9, agedGold, 0, 5.95, -14.95)
  const archTop = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.16, 10, 48, Math.PI), paleGold)
  archTop.position.set(0, 5.9, -14.62)
  archTop.castShadow = true
  arch.add(archTop)
  makeSign(arch, 'HIGH STAKES', 4.8, 0.82, 0, 6.72, -14.52, 0, '#f7d77b', 'rgba(255,201,72,0.9)')

  // Door panels that slide into the walls as the player approaches.
  const leftDoor = new THREE.Group()
  const rightDoor = new THREE.Group()
  leftDoor.position.set(-0.98, 2.62, -14.76)
  rightDoor.position.set(0.98, 2.62, -14.76)
  scene.add(leftDoor, rightDoor)
  for (const [group, direction] of [
    [leftDoor, 1],
    [rightDoor, -1],
  ] as const) {
    box(group, 1.9, 5.18, 0.22, woodMaterial, 0, 0, 0)
    box(group, 1.52, 4.74, 0.07, new THREE.MeshStandardMaterial({ color: 0x1b0b04, roughness: 0.56, metalness: 0.2 }), 0, 0, 0.15)
    box(group, 1.72, 0.09, 0.1, gold, 0, 1.75, 0.2)
    box(group, 1.72, 0.09, 0.1, gold, 0, -1.75, 0.2)
    box(group, 0.09, 3.55, 0.1, gold, -0.76, 0, 0.2)
    box(group, 0.09, 3.55, 0.1, gold, 0.76, 0, 0.2)
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), paleGold)
    handle.position.set(direction * 0.66, 0, 0.26)
    group.add(handle)
  }

  const emblemMaterial = new THREE.MeshBasicMaterial({
    map: emblem,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  plane(scene, 1.9, 1.9, emblemMaterial, 0, 7.9, -14.3, 0)

  // Side doors / signs.
  for (const [x, rotation, label] of [
    [-16.72, Math.PI / 2, 'SALON'],
    [16.72, -Math.PI / 2, 'CASHIER'],
  ] as const) {
    const sideDoor = new THREE.Group()
    sideDoor.position.set(x, 2.5, -8.5)
    sideDoor.rotation.y = rotation
    scene.add(sideDoor)
    box(sideDoor, 2.2, 4.9, 0.16, woodMaterial, 0, 0, 0)
    box(sideDoor, 1.82, 4.48, 0.06, new THREE.MeshStandardMaterial({ color: 0x170904, roughness: 0.6 }), 0, 0, 0.12)
    box(sideDoor, 1.9, 0.09, 0.1, gold, 0, 1.5, 0.18)
    box(sideDoor, 1.9, 0.09, 0.1, gold, 0, -1.5, 0.18)
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), paleGold)
    knob.position.set(0.68, 0, 0.24)
    sideDoor.add(knob)
    makeSign(scene, label, 2.2, 0.46, x + (x < 0 ? 0.08 : -0.08), 5.3, -8.5, rotation, '#e9c66a')
  }

  // Wall artwork.
  const artMaterial = new THREE.MeshStandardMaterial({ color: 0x170c07, roughness: 0.7, metalness: 0.15 })
  makeFrame(scene, 3.6, 2.2, -16.6, 5.1, 7.8, Math.PI / 2, gold, artMaterial)
  makeFrame(scene, 3.6, 2.2, 16.6, 5.1, 7.8, -Math.PI / 2, gold, artMaterial)
  makeSign(scene, 'FORTUNA', 3.1, 0.62, -16.48, 5.15, 7.8, Math.PI / 2, '#d7b05b', 'rgba(255,210,100,0.4)')
  makeSign(scene, 'MMXXVI', 3.1, 0.62, 16.48, 5.15, 7.8, -Math.PI / 2, '#d7b05b', 'rgba(255,210,100,0.4)')

  // Velvet wall niches and a warm cove wash keep the flanks of the hall alive.
  for (const [side, zPositions] of [
    [-1, [10.7, 5.8, 1.1, -3.5, -11.2]],
    [1, [10.7, -1.2, -5.6, -11.2]],
  ] as const) {
    for (const z of zPositions) {
      makeFrame(scene, 3.1, 3.15, side * 16.55, 4.55, z, side * (Math.PI / 2), gold, velvet)
      const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), paleGold)
      diamond.position.set(side * 16.32, 4.55, z)
      diamond.rotation.z = Math.PI / 4
      diamond.castShadow = false
      scene.add(diamond)
      const wash = new THREE.PointLight(0xffb85b, 4.5, 3.8, 2)
      wash.position.set(side * 15.9, 3.1, z)
      scene.add(wash)
    }
  }
  for (const side of [-1, 1]) {
    const cove = box(
      scene,
      0.08,
      0.08,
      28.5,
      new THREE.MeshStandardMaterial({
        color: 0xffd47b,
        emissive: 0xffa92e,
        emissiveIntensity: 2.8,
        toneMapped: false,
      }),
      side * 16.38,
      8.42,
      0,
      false,
    )
    cove.castShadow = false
  }
  box(
    scene,
    30,
    0.055,
    0.055,
    new THREE.MeshStandardMaterial({
      color: 0xffd47b,
      emissive: 0xffa92e,
      emissiveIntensity: 2.4,
      toneMapped: false,
    }),
    0,
    8.42,
    -14.6,
    false,
  )

  // ── Columns ─────────────────────────────────────────────────────────────
  const columnPositions = [
    [-10.2, -9],
    [10.2, -9],
    [-10.2, 1.8],
    [10.2, 1.8],
    [-10.2, 11],
    [10.2, 11],
  ]
  for (const [x, z] of columnPositions) {
    const column = new THREE.Group()
    column.position.set(x, 0, z)
    scene.add(column)
    cylinder(column, 0.95, 1.1, 0.3, 24, gold, 0, 0.15, 0)
    cylinder(column, 0.74, 0.88, 0.5, 24, agedGold, 0, 0.55, 0)
    cylinder(column, 0.52, 0.6, 5.9, 24, paleGold, 0, 3.72, 0)
    cylinder(column, 0.82, 0.68, 0.46, 24, gold, 0, 6.9, 0)
    cylinder(column, 1.0, 0.86, 0.24, 24, gold, 0, 7.18, 0)
    for (let y = 1.1; y < 6.5; y += 1.1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 8, 32), agedGold)
      ring.rotation.x = Math.PI / 2
      ring.position.y = y
      column.add(ring)
    }
    colliders.push({ shape: 'circle', x, z, radius: 0.92, enabled: true })
  }

  // ── Fountain ────────────────────────────────────────────────────────────
  const fountain = new THREE.Group()
  fountain.position.set(-5.6, 0, 0.5)
  scene.add(fountain)
  cylinder(fountain, 3.1, 3.3, 0.36, 64, agedGold, 0, 0.18, 0)
  cylinder(fountain, 2.9, 2.9, 0.16, 64, gold, 0, 0.42, 0)
  const waterBasin = new THREE.Mesh(new THREE.CircleGeometry(2.82, 64), water)
  waterBasin.rotation.x = -Math.PI / 2
  waterBasin.position.y = 0.48
  fountain.add(waterBasin)
  cylinder(fountain, 0.55, 0.75, 1.35, 24, paleGold, 0, 1.12, 0)
  cylinder(fountain, 1.55, 1.1, 0.28, 48, gold, 0, 1.9, 0)
  const upperWater = new THREE.Mesh(new THREE.CircleGeometry(1.42, 48), water)
  upperWater.rotation.x = -Math.PI / 2
  upperWater.position.y = 2.06
  fountain.add(upperWater)
  cylinder(fountain, 0.22, 0.34, 1.1, 18, paleGold, 0, 2.55, 0)
  const sculpture = new THREE.Mesh(new THREE.TorusKnotGeometry(0.48, 0.12, 120, 16, 2, 3), paleGold)
  sculpture.position.y = 3.5
  sculpture.rotation.set(0.35, 0.2, 0.3)
  sculpture.castShadow = true
  fountain.add(sculpture)
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.05, 10, 48), gold)
  crown.rotation.x = Math.PI / 2
  crown.position.y = 4.18
  fountain.add(crown)
  const fountainLight = addPointLight(fountain, 0x67e8ee, 10, 8, 0, 2.3, 0)
  fountainLight.castShadow = false
  colliders.push({ shape: 'circle', x: -5.6, z: 0.5, radius: 3.55, enabled: true })

  // Ripples.
  const ripples: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 0.86, 64),
      new THREE.MeshBasicMaterial({
        color: 0xb8f8ff,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.51
    fountain.add(ring)
    ripples.push(ring)
  }

  // Water droplets.
  const dropletCount = 280
  const dropletPositions = new Float32Array(dropletCount * 3)
  const dropletSeeds: number[] = []
  for (let i = 0; i < dropletCount; i++) {
    dropletSeeds.push(Math.random())
  }
  const dropletGeometry = new THREE.BufferGeometry()
  dropletGeometry.setAttribute('position', new THREE.BufferAttribute(dropletPositions, 3))
  const droplets = new THREE.Points(
    dropletGeometry,
    new THREE.PointsMaterial({
      color: 0xcffcff,
      size: 0.055,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  )
  droplets.position.copy(fountain.position)
  scene.add(droplets)

  // ── Bar ─────────────────────────────────────────────────────────────────
  const bar = new THREE.Group()
  bar.position.set(14.6, 0, 4.3)
  scene.add(bar)
  box(bar, 1.15, 1.18, 8.2, woodMaterial, 0, 0.59, 0)
  box(bar, 1.4, 0.12, 8.5, paleGold, 0, 1.2, 0)
  box(bar, 1.22, 0.1, 8.35, gold, 0, 0.08, 0)
  box(bar, 0.18, 0.14, 8.2, paleGold, -0.6, 1.34, 0)
  // Bar front panels.
  for (let z = -3.5; z <= 3.5; z += 1.4) {
    box(bar, 0.05, 0.75, 1.1, agedGold, -0.61, 0.62, z)
  }
  // Mirror and bottle shelves.
  plane(
    bar,
    7.7,
    2.4,
    new THREE.MeshPhysicalMaterial({
      color: 0xaeb9b1,
      metalness: 1,
      roughness: 0.08,
      envMapIntensity: 2.4,
    }),
    0.96,
    2.75,
    0,
    -Math.PI / 2,
  )
  for (const y of [1.95, 2.72, 3.48]) {
    box(bar, 0.58, 0.07, 7.8, gold, 0.83, y, 0)
    for (let z = -3.5; z <= 3.5; z += 0.52) {
      const hue = [0x7d3b12, 0x25512d, 0x6b0d17, 0x7a5516][Math.floor(Math.random() * 4)]
      const bottleMaterial = new THREE.MeshStandardMaterial({
        color: hue,
        roughness: 0.16,
        metalness: 0.25,
        transparent: true,
        opacity: 0.86,
        envMapIntensity: 1.7,
      })
      const bottle = cylinder(bar, 0.085, 0.11, 0.42 + Math.random() * 0.16, 12, bottleMaterial, 0.83, y + 0.26, z, false)
      const neck = cylinder(bar, 0.035, 0.05, 0.16, 10, bottleMaterial, 0.83, y + 0.52, z, false)
      bottle.rotation.z = 0.02
      neck.rotation.z = 0.02
    }
  }
  // Bar stools.
  for (let z = -2.8; z <= 2.8; z += 1.4) {
    const stool = new THREE.Group()
    stool.position.set(-1.75, 0, z)
    bar.add(stool)
    cylinder(stool, 0.38, 0.43, 0.16, 24, velvet, 0, 0.8, 0)
    cylinder(stool, 0.31, 0.36, 0.08, 24, gold, 0, 0.9, 0)
    cylinder(stool, 0.06, 0.08, 0.75, 12, darkMetal, 0, 0.4, 0)
    const foot = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 24), agedGold)
    foot.rotation.x = Math.PI / 2
    foot.position.y = 0.26
    stool.add(foot)
    cylinder(stool, 0.29, 0.29, 0.06, 24, agedGold, 0, 0.03, 0)
  }
  // Glasses.
  for (let i = 0; i < 5; i++) {
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xcde8dd,
      metalness: 0,
      roughness: 0.03,
      transmission: 0.92,
      transparent: true,
      opacity: 0.62,
      thickness: 0.15,
      envMapIntensity: 2,
    })
    cylinder(bar, 0.1, 0.075, 0.25, 16, glassMaterial, -0.16, 1.46, -2.8 + i * 1.35, false)
  }
  for (let i = 0; i < 3; i++) {
    const pendant = new THREE.Group()
    pendant.position.set(-0.15, 4.25, -2.4 + i * 2.4)
    bar.add(pendant)
    cylinder(pendant, 0.015, 0.015, 1.15, 8, darkMetal, 0, 0.57, 0, false)
    cylinder(pendant, 0.34, 0.16, 0.28, 18, agedGold, 0, 0, 0, false)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12), warmLight)
    bulb.position.y = -0.16
    pendant.add(bulb)
    addPointLight(pendant, 0xffbd63, 8, 6, 0, -0.16, 0)
  }
  addPointLight(scene, 0xffb04e, 28, 16, 14.2, 4.2, 4.3)
  colliders.push({ shape: 'box', minX: 13.75, maxX: 16.1, minZ: 0.1, maxZ: 8.55, enabled: true })
  interactables.push({
    id: 'bar',
    kind: 'bar',
    label: 'Gold Bar',
    detail: 'Ein Drink auf das Haus?',
    position: new THREE.Vector3(12.1, 0, 4.3),
    radius: 2.7,
  })

  // ── Slot machines ───────────────────────────────────────────────────────
  const slotScreenMaterial = new THREE.MeshBasicMaterial({ map: slotFace, toneMapped: false })
  const slotGlowMaterials: THREE.MeshBasicMaterial[] = []
  const slotPositions = [6.5, 1.6, -3.3]
  for (let index = 0; index < slotPositions.length; index++) {
    const z = slotPositions[index]
    const machine = new THREE.Group()
    machine.position.set(-15.25, 0, z)
    machine.rotation.y = Math.PI / 2
    scene.add(machine)

    box(machine, 1.85, 3.25, 0.9, new THREE.MeshStandardMaterial({ color: 0x36070d, roughness: 0.4, metalness: 0.38 }), 0, 1.78, 0)
    box(machine, 2.02, 0.16, 1.02, gold, 0, 3.42, 0)
    box(machine, 1.98, 0.12, 1.0, agedGold, 0, 0.16, 0)
    box(machine, 0.16, 3.1, 0.98, gold, -0.98, 1.8, 0)
    box(machine, 0.16, 3.1, 0.98, gold, 0.98, 1.8, 0)
    box(machine, 1.56, 0.66, 0.1, gold, 0, 3.18, 0.48)
    const screen = plane(machine, 1.46, 0.97, slotScreenMaterial, 0, 2.32, 0.47)
    screen.castShadow = false
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb52e, transparent: true, opacity: 0.26, toneMapped: false })
    slotGlowMaterials.push(glowMat)
    const glow = plane(machine, 1.66, 1.16, glowMat, 0, 2.32, 0.48)
    glow.castShadow = false
    // Button deck.
    box(machine, 1.38, 0.26, 0.32, darkMetal, 0, 1.48, 0.58)
    for (let b = -1; b <= 1; b++) {
      const button = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 18), b === 0 ? paleGold : gold)
      button.rotation.x = Math.PI / 2
      button.position.set(b * 0.38, 1.5, 0.76)
      machine.add(button)
    }
    // Lever.
    cylinder(machine, 0.035, 0.035, 0.8, 10, agedGold, 1.1, 2.15, 0.18, false)
    const lever = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 12), new THREE.MeshStandardMaterial({ color: 0xc51f32, metalness: 0.5, roughness: 0.25 }))
    lever.position.set(1.1, 2.56, 0.18)
    machine.add(lever)
    // Stool.
    cylinder(scene, 0.36, 0.4, 0.15, 24, velvet, -13.2, 0.75, z)
    cylinder(scene, 0.05, 0.07, 0.68, 12, darkMetal, -13.2, 0.37, z)
    cylinder(scene, 0.3, 0.3, 0.05, 24, agedGold, -13.2, 0.03, z)
    addPointLight(machine, index === 0 ? 0xff4b3c : 0xffc45c, 6, 4.5, 0, 2.4, 0.9)
    colliders.push({ shape: 'box', minX: -16.15, maxX: -14.2, minZ: z - 1.1, maxZ: z + 1.1, enabled: true })
    interactables.push({
      id: `slot-${index + 1}`,
      kind: 'slot',
      label: `Goliat Gold ${index + 1}`,
      detail: 'Walzen drehen · Jackpot 25.000',
      position: new THREE.Vector3(-13.5, 0, z),
      radius: 2.25,
    })
  }

  // ── Blackjack table ─────────────────────────────────────────────────────
  const blackjack = new THREE.Group()
  blackjack.position.set(8, 0, -7.2)
  scene.add(blackjack)
  cylinder(blackjack, 2.8, 2.95, 0.18, 48, darkMetal, 0, 0.78, 0)
  const tableTop = cylinder(blackjack, 2.6, 2.6, 0.16, 64, felt, 0, 0.91, 0)
  tableTop.scale.z = 0.72
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.11, 12, 64), paleGold)
  rim.rotation.x = Math.PI / 2
  rim.scale.z = 0.72
  rim.position.y = 0.97
  blackjack.add(rim)
  box(blackjack, 1.4, 0.05, 0.6, new THREE.MeshStandardMaterial({ color: 0x0b3825, roughness: 1 }), 0, 1.01, 0.35)
  makeSign(blackjack, 'BLACKJACK PAYS 3 TO 2', 2.5, 0.24, 0, 1.035, -0.6, 0, '#e8c76e', 'rgba(255,215,100,0.3)')
  // Cards and chips.
  const cardMaterial = new THREE.MeshStandardMaterial({ color: 0xf2ead7, roughness: 0.8 })
  const redCardMaterial = new THREE.MeshStandardMaterial({ color: 0xa8121f, roughness: 0.7 })
  for (let i = 0; i < 4; i++) {
    const card = box(blackjack, 0.28, 0.012, 0.4, cardMaterial, -0.95 + i * 0.36, 1.04, 0.15 + (i % 2) * 0.2)
    card.rotation.y = (i - 1.5) * 0.1
  }
  const hiddenCard = box(blackjack, 0.28, 0.012, 0.4, redCardMaterial, 0.82, 1.04, -0.22)
  hiddenCard.rotation.y = -0.14
  for (let i = 0; i < 5; i++) {
    const chip = cylinder(blackjack, 0.13, 0.13, 0.05, 20, i % 2 ? velvet : paleGold, 1.55, 1.04 + i * 0.05, 0.35)
    chip.castShadow = false
  }
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const chair = new THREE.Group()
    chair.position.set(Math.cos(angle) * 3.35, 0, Math.sin(angle) * 3.05)
    chair.rotation.y = -angle + Math.PI / 2
    blackjack.add(chair)
    cylinder(chair, 0.34, 0.38, 0.13, 24, velvet, 0, 0.57, 0)
    box(chair, 0.65, 0.9, 0.1, velvet, 0, 1.0, -0.28)
    cylinder(chair, 0.05, 0.06, 0.5, 10, darkMetal, 0, 0.27, 0)
  }
  addPointLight(scene, 0xffca6d, 44, 12, 8, 6.2, -7.2)
  colliders.push({ shape: 'circle', x: 8, z: -7.2, radius: 3.15, enabled: true })
  interactables.push({
    id: 'blackjack',
    kind: 'blackjack',
    label: 'Blackjack',
    detail: 'Karten · 3 : 2 Auszahlung',
    position: new THREE.Vector3(8, 0, -4.1),
    radius: 2.65,
  })

  // ── Roulette table ──────────────────────────────────────────────────────
  const roulette = new THREE.Group()
  roulette.position.set(-8, 0, -7.2)
  scene.add(roulette)
  cylinder(roulette, 2.65, 2.85, 0.2, 48, darkMetal, 0, 0.8, 0)
  const rouletteTable = cylinder(roulette, 2.5, 2.5, 0.16, 64, felt, 0, 0.93, 0)
  rouletteTable.scale.z = 0.72
  const rouletteRim = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.11, 12, 64), paleGold)
  rouletteRim.rotation.x = Math.PI / 2
  rouletteRim.scale.z = 0.72
  rouletteRim.position.y = 0.99
  roulette.add(rouletteRim)
  makeSign(roulette, 'ROULETTE  •  SINGLE ZERO', 2.5, 0.22, 0, 1.045, -1.1, 0, '#e8c76e', 'rgba(255,215,100,0.3)')
  const wheel = new THREE.Group()
  wheel.position.set(0.2, 1.15, 0.1)
  roulette.add(wheel)
  const wheelBody = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.18, 64), darkMetal)
  wheelBody.position.y = -0.1
  wheel.add(wheelBody)
  const wheelFace = new THREE.Mesh(
    new THREE.CircleGeometry(1.03, 96),
    new THREE.MeshBasicMaterial({ map: rouletteFace, toneMapped: false }),
  )
  wheelFace.rotation.x = -Math.PI / 2
  wheelFace.position.y = 0.01
  wheel.add(wheelFace)
  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(1.09, 0.06, 10, 64), paleGold)
  wheelRing.rotation.x = Math.PI / 2
  wheelRing.position.y = 0.02
  wheel.add(wheelRing)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), paleGold)
  ball.position.set(0.78, 0.12, 0)
  wheel.add(ball)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const chair = new THREE.Group()
    chair.position.set(Math.cos(angle) * 3.2, 0, Math.sin(angle) * 2.95)
    chair.rotation.y = -angle + Math.PI / 2
    roulette.add(chair)
    cylinder(chair, 0.34, 0.38, 0.13, 24, velvet, 0, 0.57, 0)
    box(chair, 0.65, 0.9, 0.1, velvet, 0, 1.0, -0.28)
    cylinder(chair, 0.05, 0.06, 0.5, 10, darkMetal, 0, 0.27, 0)
  }
  addPointLight(scene, 0xffca6d, 40, 11, -8, 6.2, -7.2)
  colliders.push({ shape: 'circle', x: -8, z: -7.2, radius: 3.15, enabled: true })
  interactables.push({
    id: 'roulette',
    kind: 'roulette',
    label: 'Roulette',
    detail: 'Rot oder Schwarz · 37 Zahlen',
    position: new THREE.Vector3(-8, 0, -4.1),
    radius: 2.65,
  })

  // ── High-stakes salon ───────────────────────────────────────────────────
  const high = new THREE.Group()
  high.position.set(0, 0, -21)
  scene.add(high)
  cylinder(high, 3.1, 3.35, 0.26, 56, darkMetal, 0, 0.86, 0)
  const highTop = cylinder(high, 2.9, 2.9, 0.18, 64, felt, 0, 1.02, 0)
  highTop.scale.z = 0.72
  const highRim = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.12, 12, 72), paleGold)
  highRim.rotation.x = Math.PI / 2
  highRim.scale.z = 0.72
  highRim.position.y = 1.09
  high.add(highRim)
  makeSign(high, 'HIGH STAKES  •  BLACKJACK', 3.2, 0.3, 0, 1.16, -0.7, 0, '#f5d987', 'rgba(255,206,82,0.45)')
  for (let i = 0; i < 5; i++) {
    const chip = cylinder(high, 0.14, 0.14, 0.055, 22, i % 2 ? velvet : paleGold, 1.6, 1.14 + i * 0.055, 0.5)
    chip.castShadow = false
  }
  const highCard = box(high, 0.3, 0.014, 0.43, cardMaterial, -0.3, 1.13, 0.12)
  highCard.rotation.y = 0.2
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    const chair = new THREE.Group()
    chair.position.set(Math.cos(angle) * 3.8, 0, Math.sin(angle) * 3.1)
    chair.rotation.y = -angle + Math.PI / 2
    high.add(chair)
    cylinder(chair, 0.37, 0.42, 0.16, 24, velvet, 0, 0.62, 0)
    box(chair, 0.72, 1.05, 0.11, velvet, 0, 1.1, -0.32)
    cylinder(chair, 0.06, 0.07, 0.55, 10, darkMetal, 0, 0.3, 0)
  }
  addPointLight(scene, 0xffc763, 52, 14, 0, 6.4, -21)
  colliders.push({ shape: 'circle', x: 0, z: -21, radius: 3.55, enabled: true })
  interactables.push({
    id: 'high-stakes',
    kind: 'blackjack',
    label: 'High Stakes Blackjack',
    detail: 'VIP-Tisch · Mindesteinsatz 100',
    position: new THREE.Vector3(0, 0, -17.2),
    radius: 2.8,
    variant: 'high',
  })

  // Salon artwork and gold trim.
  makeFrame(scene, 4.4, 2.4, 0, 4.6, -26.75, 0, gold, artMaterial)
  makeSign(scene, 'GOLIAT GOLD', 4.0, 0.8, 0, 4.6, -26.62, 0, '#f2cf6e', 'rgba(255,202,76,0.6)')
  for (const x of [-6.8, 6.8]) {
    for (const z of [-16.2, -21, -25.8]) {
      box(scene, 0.3, 6.8, 0.3, agedGold, x, 3.4, z, false)
    }
  }
  const rearEmblem = plane(scene, 3.8, 3.8, emblemMaterial, 0, 5.9, -15.35, 0)
  rearEmblem.visible = false

  // ── Lighting ────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x6b4d22, 0.54))
  const hemi = new THREE.HemisphereLight(0xffdfa0, 0x1b0c02, 0.82)
  scene.add(hemi)

  const key = new THREE.SpotLight(0xffd27a, 245, 32, 0.62, 0.72, 1.35)
  key.position.set(0, 8.7, 4.5)
  key.target.position.set(0, 0, 1)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.0002
  key.shadow.normalBias = 0.035
  scene.add(key, key.target)

  const fountainSpot = new THREE.SpotLight(0x7be7ee, 220, 24, 0.56, 0.82, 1.4)
  fountainSpot.position.set(0, 8.6, -2)
  fountainSpot.target.position.set(0, 1.4, -2)
  fountainSpot.castShadow = true
  fountainSpot.shadow.mapSize.set(1024, 1024)
  fountainSpot.shadow.bias = -0.0003
  scene.add(fountainSpot, fountainSpot.target)

  const doorSpot = new THREE.SpotLight(0xffbf58, 210, 25, 0.5, 0.7, 1.3)
  doorSpot.position.set(0, 8.4, -11.2)
  doorSpot.target.position.set(0, 2.2, -14.8)
  scene.add(doorSpot, doorSpot.target)

  // Wall sconces.
  for (const side of [-1, 1]) {
    for (const z of [-11, -5.5, 0, 5.5, 11]) {
      const bracket = new THREE.Group()
      bracket.position.set(side * 16.58, 4.9, z)
      bracket.rotation.y = side * -Math.PI / 2
      scene.add(bracket)
      box(bracket, 0.22, 0.34, 0.12, agedGold, 0, 0, 0, false)
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), warmLight)
      glow.position.set(0, 0.1, 0.2)
      bracket.add(glow)
      if (z === -5.5 || z === 5.5) addPointLight(scene, 0xffb45c, 9, 5.5, side * 16.1, 4.9, z)
    }
  }

  // Chandeliers.
  const chandeliers: THREE.Group[] = []
  for (const [x, z, scale] of [
    [0, 5.4, 1],
    [0, -9.5, 0.82],
    [0, -21, 0.88],
  ] as const) {
    const chandelier = new THREE.Group()
    chandelier.position.set(x, 7.4, z)
    chandelier.scale.setScalar(scale)
    scene.add(chandelier)
    chandeliers.push(chandelier)
    cylinder(chandelier, 0.035, 0.035, 1.45, 8, agedGold, 0, 0.72, 0, false)
    cylinder(chandelier, 0.18, 0.28, 0.22, 16, gold, 0, 1.42, 0, false)
    for (const [radius, y] of [
      [1.15, 0],
      [0.78, 0.34],
      [0.42, 0.62],
    ] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.045, 8, 48), paleGold)
      ring.rotation.x = Math.PI / 2
      ring.position.y = y
      chandelier.add(ring)
      const count = Math.round(radius * 12)
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), warmLight)
        bulb.position.set(Math.cos(angle) * radius, y + 0.08, Math.sin(angle) * radius)
        chandelier.add(bulb)
      }
    }
    addPointLight(chandelier, 0xffc26b, 42, 16, 0, 0.2, 0)
  }

  // Volumetric-ish light shafts.
  for (const [x, z, radius, opacity] of [
    [0, 4.8, 2.4, 0.02],
    [0, -2, 2.9, 0.014],
    [0, -9.5, 2.1, 0.022],
    [8, -7.2, 1.7, 0.022],
    [-8, -7.2, 1.7, 0.022],
  ] as const) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, 7.2, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffcf78,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    cone.position.set(x, 4.8, z)
    cone.rotation.x = Math.PI
    scene.add(cone)
  }

  // Dust motes.
  const moteCount = 420
  const motePositions = new Float32Array(moteCount * 3)
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = (Math.random() - 0.5) * 33
    motePositions[i * 3 + 1] = Math.random() * 8.3 + 0.3
    motePositions[i * 3 + 2] = (Math.random() - 0.5) * 28
  }
  const moteGeometry = new THREE.BufferGeometry()
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3))
  const motes = new THREE.Points(
    moteGeometry,
    new THREE.PointsMaterial({
      color: 0xffd98a,
      size: 0.018,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  )
  scene.add(motes)

  // ── Collision shell ─────────────────────────────────────────────────────
  colliders.push(
    { shape: 'box', minX: -17.7, maxX: -16.5, minZ: -15.2, maxZ: 15.2, enabled: true },
    { shape: 'box', minX: 16.5, maxX: 17.7, minZ: -15.2, maxZ: 15.2, enabled: true },
    { shape: 'box', minX: -17.7, maxX: 17.7, minZ: 14.5, maxZ: 15.8, enabled: true },
    { shape: 'box', minX: -17.7, maxX: -2.0, minZ: -15.8, maxZ: -14.5, enabled: true },
    { shape: 'box', minX: 2.0, maxX: 17.7, minZ: -15.8, maxZ: -14.5, enabled: true },
    { shape: 'box', minX: -7.7, maxX: -6.5, minZ: -27.5, maxZ: -15, enabled: true },
    { shape: 'box', minX: 6.5, maxX: 7.7, minZ: -27.5, maxZ: -15, enabled: true },
    { shape: 'box', minX: -7.7, maxX: 7.7, minZ: -27.9, maxZ: -26.5, enabled: true },
  )
  const doorCollider: BoxCollider = {
    shape: 'box',
    minX: -2.05,
    maxX: 2.05,
    minZ: -15.2,
    maxZ: -14.35,
    enabled: true,
  }
  colliders.push(doorCollider)

  // ── Animation ───────────────────────────────────────────────────────────
  let doorOpen = 0
  const update = (elapsed: number, delta: number, player: THREE.Vector3) => {
    const distanceToDoor = Math.hypot(player.x, player.z + 14.7)
    const target = distanceToDoor < 6.2 ? 1 : 0
    doorOpen += (target - doorOpen) * Math.min(1, delta * 3.2)
    leftDoor.position.x = -0.98 - doorOpen * 1.92
    rightDoor.position.x = 0.98 + doorOpen * 1.92
    doorCollider.enabled = doorOpen < 0.55

    sculpture.rotation.y = elapsed * 0.18
    sculpture.rotation.x = 0.35 + Math.sin(elapsed * 0.35) * 0.08
    crown.rotation.z = elapsed * 0.12

    const waterGeometry = waterBasin.geometry as THREE.CircleGeometry
    const scale = 1 + Math.sin(elapsed * 1.5) * 0.004
    waterBasin.scale.setScalar(scale)
    upperWater.scale.setScalar(1 + Math.sin(elapsed * 1.8 + 1) * 0.006)
    waterGeometry.attributes.position.needsUpdate = false

    ripples.forEach((ring, index) => {
      const phase = (elapsed * 0.22 + index * 0.25) % 1
      ring.scale.setScalar(0.18 + phase * 2.6)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.2
    })

    const positionAttribute = dropletGeometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < dropletCount; i++) {
      const phase = (elapsed * 0.38 + dropletSeeds[i]) % 1
      const angle = dropletSeeds[i] * Math.PI * 2 + phase * 0.9
      const radius = 0.12 + phase * 2.55
      positionAttribute.setXYZ(
        i,
        Math.cos(angle) * radius,
        2.6 + Math.sin(phase * Math.PI) * 0.95 - phase * 2.08,
        Math.sin(angle) * radius,
      )
    }
    positionAttribute.needsUpdate = true

    wheel.rotation.y = elapsed * 0.16
    ball.position.x = Math.cos(elapsed * 0.9) * 0.79
    ball.position.z = Math.sin(elapsed * 0.9) * 0.79
    ball.position.y = 0.13 + Math.abs(Math.sin(elapsed * 1.2)) * 0.035

    chandeliers.forEach((chandelier, index) => {
      chandelier.rotation.y = Math.sin(elapsed * 0.14 + index) * 0.08
    })

    slotGlowMaterials.forEach((material, index) => {
      material.opacity = 0.19 + Math.sin(elapsed * 2.2 + index * 1.7) * 0.08
    })

    // Dust drifts very slowly, which keeps the air alive without distraction.
    const moteAttribute = moteGeometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < moteCount; i++) {
      let y = moteAttribute.getY(i) + delta * 0.025
      if (y > 8.5) y = 0.2
      moteAttribute.setY(i, y)
      moteAttribute.setX(i, moteAttribute.getX(i) + Math.sin(elapsed * 0.2 + i) * delta * 0.0015)
    }
    moteAttribute.needsUpdate = true
  }

  return { scene, interactables, colliders, update }
}
