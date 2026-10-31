import './style.css'
import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { createCasinoWorld } from './casino'
import type { Interactable } from './casino'
import { GameUI } from './games'
import { setTextureAnisotropy } from './textures'

const canvas = document.getElementById('world') as HTMLCanvasElement | null
const startScreen = document.getElementById('startScreen')
const startButton = document.getElementById('startButton')
const pauseScreen = document.getElementById('pauseScreen')
const resumeButton = document.getElementById('resumeButton')
const interactionPrompt = document.getElementById('interactionPrompt')
const interactionLabel = document.getElementById('interactionLabel')
const interactionDetail = document.getElementById('interactionDetail')
const toastElement = document.getElementById('toast')
const touchControls = document.getElementById('touchControls')
const touchStick = document.getElementById('touchStick')
const touchKnob = document.getElementById('touchKnob')
const touchInteract = document.getElementById('touchInteract')
const touchSprint = document.getElementById('touchSprint')

if (!canvas || !startScreen || !startButton || !pauseScreen || !resumeButton) {
  throw new Error('Casino shell is incomplete.')
}

const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
const PLAYER_HEIGHT = 1.7
const PLAYER_RADIUS = 0.36

let renderer: THREE.WebGLRenderer
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
  })
} catch (error) {
  startScreen.innerHTML = `<div class="start-content"><p class="start-eyebrow">WEBGL NICHT VERFÜGBAR</p><h1 class="start-logo"><span class="logo-line logo-line-one">GOLIAT</span><span class="logo-line logo-line-two">GOLD</span></h1><p class="start-tagline">Dein Browser konnte keinen 3D-Kontext öffnen. Bitte aktiviere Hardwarebeschleunigung und lade die Seite neu.</p></div>`
  throw error
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.88
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
setTextureAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()))

const world = createCasinoWorld()
const scene = world.scene

const pmrem = new THREE.PMREMGenerator(renderer)
pmrem.compileEquirectangularShader()
const environmentScene = new RoomEnvironment()
const environmentTarget = pmrem.fromScene(environmentScene, 0.035, 0.1, 1000)
scene.environment = environmentTarget.texture
scene.environmentIntensity = 0.82
environmentScene.dispose?.()
pmrem.dispose()

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.06, 90)
camera.position.set(0, PLAYER_HEIGHT, 11.7)
camera.lookAt(0, 1.8, -2.5)

const controls = new PointerLockControls(camera, document.body)
controls.pointerSpeed = 0.86

const renderTarget = new THREE.WebGLRenderTarget(
  Math.max(1, Math.floor(window.innerWidth * renderer.getPixelRatio())),
  Math.max(1, Math.floor(window.innerHeight * renderer.getPixelRatio())),
  { type: THREE.HalfFloatType, samples: 4 },
)
const composer = new EffectComposer(renderer, renderTarget)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.34,
  0.5,
  0.94,
)
composer.addPass(bloom)
composer.addPass(new OutputPass())

const gameUI = new GameUI({
  onCredits: credits => {
    const hud = document.getElementById('creditsValue')
    if (hud) hud.textContent = credits.toLocaleString('de-DE')
  },
  onClose: () => {
    if (isTouch) {
      document.body.classList.remove('modal-open')
      return
    }
    lockPointer()
  },
})

let started = false
let pauseVisible = false
let toastTimer = 0
let nearest: Interactable | null = null
let lastTime = 0
let bobPhase = 0
let loopRunning = false
let pointerLocked = false

const keys = new Set<string>()
const velocity = new THREE.Vector3()
const moveDirection = new THREE.Vector3()
const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)
const touchMove = new THREE.Vector2()
let touchSprinting = false
let touchLookPointer: number | null = null
let touchLookX = 0
let touchLookY = 0
let touchYaw = 0
let touchPitch = 0

const clock = new THREE.Clock()

function showToast(message: string, duration = 3300) {
  if (!toastElement) return
  window.clearTimeout(toastTimer)
  toastElement.textContent = message
  toastElement.classList.add('show')
  toastTimer = window.setTimeout(() => toastElement.classList.remove('show'), duration)
}

function lockPointer() {
  if (isTouch) return
  try {
    controls.lock()
  } catch {
    // Pointer lock can be denied by a browser policy. The canvas click fallback
    // below lets the player try again without ever dropping into a black screen.
  }
}

function showPause() {
  if (!started || isTouch || gameUI.isOpen || pauseVisible) return
  pauseVisible = true
  pauseScreen.hidden = false
  pauseScreen.setAttribute('aria-hidden', 'false')
  document.body.classList.add('paused')
  hidePrompt()
}

function hidePause() {
  pauseVisible = false
  pauseScreen.hidden = true
  pauseScreen.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('paused')
}

function hidePrompt() {
  if (interactionPrompt) interactionPrompt.hidden = true
  nearest = null
}

function startGame() {
  if (started) return
  started = true
  document.body.classList.add('playing')
  startScreen.classList.add('fadeOut')
  // Keep the pointer-lock request inside the click gesture. The visual fade and
  // DOM removal happen afterwards; the overlay is removed, never hidden.
  if (!isTouch) lockPointer()
  if (isTouch) {
    document.body.classList.add('touch')
    touchControls?.setAttribute('aria-hidden', 'false')
    showToast('Ziehe über die Szene, um dich umzusehen. Nutze den Stick zum Laufen.', 5200)
  } else {
    showToast('Willkommen im Goldenen Saal. Die Türen stehen offen.', 4200)
  }
  window.setTimeout(() => {
    startScreen.remove()
    if (!isTouch && !pointerLocked) {
      showToast('Klicke in den Saal, um die Maus zu erfassen.', 4200)
    }
  }, 420)
  startLoop()
}

function startLoop() {
  if (loopRunning) return
  loopRunning = true
  lastTime = performance.now()
  requestAnimationFrame(animate)
}

startButton.addEventListener('click', startGame)

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === document.body
  if (pointerLocked) {
    hidePause()
    return
  }
  if (started && !gameUI.isOpen && !isTouch) showPause()
})

controls.addEventListener('lock', () => {
  pointerLocked = true
  hidePause()
})

controls.addEventListener('unlock', () => {
  pointerLocked = false
  if (started && !gameUI.isOpen && !isTouch) showPause()
})

resumeButton.addEventListener('click', () => {
  hidePause()
  lockPointer()
})

canvas.addEventListener('click', () => {
  if (!started || isTouch || gameUI.isOpen || pauseVisible) return
  if (!document.pointerLockElement) lockPointer()
})

window.addEventListener('blur', () => {
  keys.clear()
  touchMove.set(0, 0)
  if (touchKnob) touchKnob.style.transform = 'translate(-50%, -50%)'
})

window.addEventListener('keydown', event => {
  if (gameUI.isOpen) {
    if (gameUI.handleKey(event)) return
    if (event.code === 'Escape') {
      event.preventDefault()
      gameUI.close()
      return
    }
  }

  if (event.code === 'Escape') {
    if (started && !isTouch && document.pointerLockElement) {
      document.exitPointerLock()
    }
    return
  }

  if (event.code === 'KeyE' && started && !gameUI.isOpen && !pauseVisible && (controls.isLocked || isTouch)) {
    event.preventDefault()
    interact()
    return
  }

  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'].includes(event.code)) {
    if (started && (controls.isLocked || isTouch) && !gameUI.isOpen && !pauseVisible) {
      event.preventDefault()
      keys.add(event.code)
    }
  }
})

window.addEventListener('keyup', event => {
  keys.delete(event.code)
})

function collides(x: number, z: number) {
  for (const collider of world.colliders) {
    if (!collider.enabled) continue
    if (collider.shape === 'circle') {
      const dx = x - collider.x
      const dz = z - collider.z
      if (dx * dx + dz * dz < (collider.radius + PLAYER_RADIUS) ** 2) return true
    } else {
      const closestX = Math.max(collider.minX, Math.min(x, collider.maxX))
      const closestZ = Math.max(collider.minZ, Math.min(z, collider.maxZ))
      const dx = x - closestX
      const dz = z - closestZ
      if (dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS) return true
    }
  }
  return false
}

function updateMovement(delta: number) {
  if (!started || gameUI.isOpen || pauseVisible) {
    velocity.multiplyScalar(Math.exp(-8 * delta))
    return
  }
  if (!controls.isLocked && !isTouch) {
    velocity.multiplyScalar(Math.exp(-10 * delta))
    return
  }

  camera.getWorldDirection(forward)
  forward.y = 0
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1)
  forward.normalize()
  right.crossVectors(forward, up).normalize()

  moveDirection.set(0, 0, 0)
  if (keys.has('KeyW') || keys.has('ArrowUp')) moveDirection.add(forward)
  if (keys.has('KeyS') || keys.has('ArrowDown')) moveDirection.sub(forward)
  if (keys.has('KeyD') || keys.has('ArrowRight')) moveDirection.add(right)
  if (keys.has('KeyA') || keys.has('ArrowLeft')) moveDirection.sub(right)
  if (touchMove.lengthSq() > 0.01) {
    moveDirection.addScaledVector(forward, -touchMove.y)
    moveDirection.addScaledVector(right, touchMove.x)
  }

  const moving = moveDirection.lengthSq() > 0.001
  if (moving) {
    moveDirection.normalize()
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchSprinting
    const maxSpeed = sprinting ? 7.2 : 4.35
    const acceleration = sprinting ? 48 : 30
    velocity.addScaledVector(moveDirection, acceleration * delta)
    const speed = velocity.length()
    if (speed > maxSpeed) velocity.multiplyScalar(maxSpeed / speed)
  } else {
    velocity.multiplyScalar(Math.exp(-9.5 * delta))
  }

  const nextX = camera.position.x + velocity.x * delta
  if (!collides(nextX, camera.position.z)) camera.position.x = nextX
  else velocity.x = 0
  const nextZ = camera.position.z + velocity.z * delta
  if (!collides(camera.position.x, nextZ)) camera.position.z = nextZ
  else velocity.z = 0

  const speed = Math.hypot(velocity.x, velocity.z)
  bobPhase += delta * (speed > 0.3 ? speed * 2.2 : 0)
  const bob = speed > 0.3 ? Math.sin(bobPhase) * Math.min(0.038, speed * 0.006) : 0
  camera.position.y += (PLAYER_HEIGHT + bob - camera.position.y) * Math.min(1, delta * 12)
}

function updateInteraction() {
  if (!started || gameUI.isOpen || pauseVisible || (!controls.isLocked && !isTouch)) {
    hidePrompt()
    return
  }
  let best: Interactable | null = null
  let bestDistance = Infinity
  for (const item of world.interactables) {
    const dx = camera.position.x - item.position.x
    const dz = camera.position.z - item.position.z
    const distance = Math.hypot(dx, dz)
    if (distance <= item.radius && distance < bestDistance) {
      best = item
      bestDistance = distance
    }
  }
  nearest = best
  if (!best) {
    hidePrompt()
    return
  }
  if (interactionPrompt) interactionPrompt.hidden = false
  if (interactionLabel) interactionLabel.textContent = best.label
  if (interactionDetail) interactionDetail.textContent = best.detail
}

function interact() {
  const target = nearest
  if (!target || gameUI.isOpen) return
  if (target.kind === 'bar') {
    showToast('Der Barkeeper lächelt: „Ein Gold Rush, wie immer. Geht aufs Haus.“', 3800)
    return
  }
  hidePrompt()
  gameUI.open(target.kind, target.variant)
  if (!isTouch) controls.unlock()
}

function animate(now: number) {
  if (!loopRunning) return
  requestAnimationFrame(animate)
  const delta = Math.min(0.05, Math.max(0.0001, (now - lastTime) / 1000))
  lastTime = now
  const elapsed = clock.getElapsedTime()

  updateMovement(delta)
  if (started) world.update(elapsed, delta, camera.position)
  updateInteraction()
  composer.render(delta)
}

// Touch look and movement.
if (isTouch) {
  document.body.classList.add('touch')
  touchControls?.setAttribute('aria-hidden', 'true')

  canvas.addEventListener(
    'touchstart',
    event => {
      if (!started || gameUI.isOpen || pauseVisible) return
      const touch = event.changedTouches[0]
      if (!touch) return
      touchLookPointer = touch.identifier
      touchLookX = touch.clientX
      touchLookY = touch.clientY
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
      touchYaw = euler.y
      touchPitch = euler.x
    },
    { passive: true },
  )

  canvas.addEventListener(
    'touchmove',
    event => {
      if (touchLookPointer === null) return
      const touch = Array.from(event.changedTouches).find(item => item.identifier === touchLookPointer)
      if (!touch) return
      const dx = touch.clientX - touchLookX
      const dy = touch.clientY - touchLookY
      touchLookX = touch.clientX
      touchLookY = touch.clientY
      touchYaw -= dx * 0.0042
      touchPitch -= dy * 0.0042
      touchPitch = Math.max(-1.38, Math.min(1.38, touchPitch))
      camera.quaternion.setFromEuler(new THREE.Euler(touchPitch, touchYaw, 0, 'YXZ'))
    },
    { passive: true },
  )

  const endLook = (event: TouchEvent) => {
    if (touchLookPointer === null) return
    if (Array.from(event.changedTouches).some(item => item.identifier === touchLookPointer)) touchLookPointer = null
  }
  canvas.addEventListener('touchend', endLook, { passive: true })
  canvas.addEventListener('touchcancel', endLook, { passive: true })

  let stickPointer: number | null = null
  let stickCenterX = 0
  let stickCenterY = 0

  touchStick?.addEventListener('pointerdown', event => {
    if (!started) return
    stickPointer = event.pointerId
    const rect = touchStick.getBoundingClientRect()
    stickCenterX = rect.left + rect.width / 2
    stickCenterY = rect.top + rect.height / 2
    touchStick.setPointerCapture(event.pointerId)
    event.preventDefault()
  })

  touchStick?.addEventListener('pointermove', event => {
    if (stickPointer !== event.pointerId) return
    const dx = event.clientX - stickCenterX
    const dy = event.clientY - stickCenterY
    const length = Math.hypot(dx, dy)
    const max = 38
    const clamped = Math.min(1, length / max)
    const nx = length > 0 ? (dx / length) * clamped : 0
    const ny = length > 0 ? (dy / length) * clamped : 0
    touchMove.set(nx, ny)
    if (touchKnob) touchKnob.style.transform = `translate(calc(-50% + ${nx * max}px), calc(-50% + ${ny * max}px))`
    event.preventDefault()
  })

  const endStick = (event: PointerEvent) => {
    if (stickPointer !== event.pointerId) return
    stickPointer = null
    touchMove.set(0, 0)
    if (touchKnob) touchKnob.style.transform = 'translate(-50%, -50%)'
  }
  touchStick?.addEventListener('pointerup', endStick)
  touchStick?.addEventListener('pointercancel', endStick)
  touchStick?.addEventListener('lostpointercapture', endStick)

  touchSprint?.addEventListener('pointerdown', event => {
    touchSprinting = true
    event.preventDefault()
  })
  const stopSprint = () => {
    touchSprinting = false
  }
  touchSprint?.addEventListener('pointerup', stopSprint)
  touchSprint?.addEventListener('pointercancel', stopSprint)
  touchSprint?.addEventListener('lostpointercapture', stopSprint)

  touchInteract?.addEventListener('click', event => {
    event.preventDefault()
    if (nearest) interact()
  })
}

function resize() {
  const width = window.innerWidth
  const height = window.innerHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65))
  renderer.setSize(width, height)
  composer.setSize(width, height)
  bloom.setSize(width, height)
}

window.addEventListener('resize', resize)
window.addEventListener('orientationchange', () => window.setTimeout(resize, 160))

// Render one frame immediately behind the opaque start screen so the lobby is
// already alive the instant the overlay begins its fade.
world.update(0, 0.016, camera.position)
composer.render(0.016)

// Small inspection hook for automated walkthroughs and manual QA. It exposes no
// privileged browser capabilities, only the scene objects that are already live.
;(window as unknown as { __casino: unknown }).__casino = {
  camera,
  controls,
  world,
  gameUI,
  setPosition: (x: number, z: number) => {
    camera.position.set(x, PLAYER_HEIGHT, z)
    velocity.set(0, 0, 0)
  },
  lookAt: (x: number, y: number, z: number) => camera.lookAt(x, y, z),
  get nearest() {
    return nearest
  },
  get started() {
    return started
  },
}

window.addEventListener('beforeunload', () => {
  loopRunning = false
  environmentTarget.dispose()
  renderTarget.dispose()
  composer.dispose()
  renderer.dispose()
})
