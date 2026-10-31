import * as THREE from 'three'

let maxAnisotropy = 8

export function setTextureAnisotropy(value: number) {
  maxAnisotropy = value
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  return { canvas, ctx }
}

function finish(canvas: HTMLCanvasElement, srgb = true) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = maxAnisotropy
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function goldMarbleTexture() {
  const { canvas, ctx } = makeCanvas(1024, 1024)
  const rand = seeded(8128)
  const base = ctx.createLinearGradient(0, 0, 1024, 1024)
  base.addColorStop(0, '#6c4a12')
  base.addColorStop(0.28, '#b88928')
  base.addColorStop(0.5, '#e2bc5d')
  base.addColorStop(0.72, '#9d6e1b')
  base.addColorStop(1, '#4a2f07')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 1024, 1024)

  for (let i = 0; i < 44; i++) {
    const x = rand() * 1024
    const y = rand() * 1024
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let s = 0; s < 4; s++) {
      ctx.bezierCurveTo(
        x + (rand() - 0.5) * 380,
        y + (rand() - 0.5) * 380,
        x + (rand() - 0.5) * 620,
        y + (rand() - 0.5) * 620,
        x + (rand() - 0.5) * 820,
        y + (rand() - 0.5) * 820,
      )
    }
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,239,181,0.28)' : 'rgba(55,32,3,0.28)'
    ctx.lineWidth = 1 + rand() * 5
    ctx.stroke()
  }

  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,246,206,0.12)' : 'rgba(35,19,0,0.12)'
    const size = 0.4 + rand() * 2.2
    ctx.fillRect(rand() * 1024, rand() * 1024, size, size)
  }

  // Polished stone tile seams.
  ctx.strokeStyle = 'rgba(38,21,2,0.55)'
  ctx.lineWidth = 5
  ctx.strokeRect(0, 0, 1024, 1024)
  ctx.beginPath()
  ctx.moveTo(512, 0)
  ctx.lineTo(512, 1024)
  ctx.moveTo(0, 512)
  ctx.lineTo(1024, 512)
  ctx.stroke()

  const texture = finish(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(6, 5.5)
  return texture
}

export function wallMarbleTexture() {
  const { canvas, ctx } = makeCanvas(1024, 1024)
  const rand = seeded(9201)
  const base = ctx.createLinearGradient(0, 0, 0, 1024)
  base.addColorStop(0, '#241c10')
  base.addColorStop(0.5, '#141008')
  base.addColorStop(1, '#2b1c0a')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 1024, 1024)

  for (let i = 0; i < 34; i++) {
    const x = rand() * 1024
    const y = rand() * 1024
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + 160, y + 120, x - 80, y + 320, x + 220, y + 520)
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(212,175,55,0.22)' : 'rgba(105, 80, 35, 0.14)'
    ctx.lineWidth = 1 + rand() * 3
    ctx.stroke()
  }

  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = 'rgba(255,225,140,0.05)'
    ctx.fillRect(rand() * 1024, rand() * 1024, 1, 1)
  }

  const texture = finish(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(5, 2)
  return texture
}

export function carpetTexture() {
  const { canvas, ctx } = makeCanvas(512, 1536)
  const gradient = ctx.createLinearGradient(0, 0, 0, 1536)
  gradient.addColorStop(0, '#250307')
  gradient.addColorStop(0.5, '#490810')
  gradient.addColorStop(1, '#250307')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 1536)

  // Woven texture.
  for (let i = 0; i < 10000; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,190,90,0.035)' : 'rgba(0,0,0,0.06)'
    ctx.fillRect(Math.random() * 512, Math.random() * 1536, 1.4, 1.4)
  }

  ctx.strokeStyle = '#c99a35'
  ctx.lineWidth = 7
  ctx.strokeRect(20, 20, 472, 1496)
  ctx.lineWidth = 2
  ctx.strokeRect(36, 36, 440, 1464)

  for (let y = 90; y < 1460; y += 170) {
    ctx.save()
    ctx.translate(256, y)
    ctx.rotate(Math.PI / 4)
    ctx.strokeStyle = 'rgba(220,176,69,0.62)'
    ctx.lineWidth = 3
    ctx.strokeRect(-36, -36, 72, 72)
    ctx.strokeRect(-20, -20, 40, 40)
    ctx.restore()
    ctx.fillStyle = 'rgba(225,182,70,0.75)'
    ctx.beginPath()
    ctx.arc(256, y, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = finish(canvas)
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

export function sunburstTexture() {
  const { canvas, ctx } = makeCanvas(1024, 1024)
  const rand = seeded(334)
  ctx.clearRect(0, 0, 1024, 1024)
  ctx.translate(512, 512)

  const glow = ctx.createRadialGradient(0, 0, 40, 0, 0, 510)
  glow.addColorStop(0, 'rgba(255,230,145,0.8)')
  glow.addColorStop(0.28, 'rgba(197,142,39,0.22)')
  glow.addColorStop(1, 'rgba(197,142,39,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(0, 0, 510, 0, Math.PI * 2)
  ctx.fill()

  for (let i = 0; i < 64; i++) {
    ctx.save()
    ctx.rotate((i / 64) * Math.PI * 2)
    const length = i % 2 === 0 ? 450 : 320
    ctx.beginPath()
    ctx.moveTo(0, -38)
    ctx.lineTo(length, -7)
    ctx.lineTo(length, 7)
    ctx.lineTo(0, 38)
    ctx.closePath()
    ctx.fillStyle = i % 2 === 0 ? 'rgba(236,191,91,0.22)' : 'rgba(236,191,91,0.1)'
    ctx.fill()
    ctx.restore()
  }

  ctx.strokeStyle = 'rgba(241,199,102,0.65)'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(0, 0, 470, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 430, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 0; i < 24; i++) {
    ctx.save()
    ctx.rotate((i / 24) * Math.PI * 2)
    ctx.fillStyle = 'rgba(255,224,142,0.8)'
    ctx.beginPath()
    ctx.arc(0, -450, 4 + rand() * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  return finish(canvas)
}

type SignOptions = {
  color?: string
  glow?: string
  font?: string
  size?: number
  width?: number
  height?: number
  letterSpacing?: number
}

export function signTexture(text: string, options: SignOptions = {}) {
  const width = options.width ?? 1024
  const height = options.height ?? 256
  const { canvas, ctx } = makeCanvas(width, height)
  ctx.clearRect(0, 0, width, height)

  let size = options.size ?? Math.floor(height * 0.52)
  const font = options.font ?? 'Georgia, "Times New Roman", serif'
  ctx.font = `700 ${size}px ${font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const letters = [...text]
  let spacing = options.letterSpacing ?? size * 0.08
  let widths = letters.map(letter => ctx.measureText(letter).width)
  let total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, letters.length - 1)
  const maxWidth = width * 0.88
  if (total > maxWidth) {
    size = Math.max(12, Math.floor(size * (maxWidth / total)))
    ctx.font = `700 ${size}px ${font}`
    spacing = options.letterSpacing ?? size * 0.08
    widths = letters.map(letter => ctx.measureText(letter).width)
    total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, letters.length - 1)
  }
  let x = width / 2 - total / 2

  const gradient = ctx.createLinearGradient(0, height * 0.25, 0, height * 0.78)
  gradient.addColorStop(0, '#fff2b0')
  gradient.addColorStop(0.3, options.color ?? '#f4cf68')
  gradient.addColorStop(0.68, options.color ?? '#b98724')
  gradient.addColorStop(1, '#6b4610')

  ctx.shadowColor = options.glow ?? 'rgba(255,200,70,0.72)'
  ctx.shadowBlur = 24
  ctx.fillStyle = gradient
  letters.forEach((letter, index) => {
    ctx.fillText(letter, x + widths[index] / 2, height / 2)
    x += widths[index] + spacing
  })

  ctx.shadowBlur = 0
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(255,241,182,0.7)'

  return finish(canvas)
}

export function emblemTexture() {
  const { canvas, ctx } = makeCanvas(1024, 1024)
  ctx.clearRect(0, 0, 1024, 1024)
  ctx.translate(512, 470)

  const ring = ctx.createRadialGradient(0, 0, 150, 0, 0, 390)
  ring.addColorStop(0, 'rgba(255,225,136,0.04)')
  ring.addColorStop(0.82, 'rgba(188,135,35,0.08)')
  ring.addColorStop(1, 'rgba(255,220,120,0)')
  ctx.fillStyle = ring
  ctx.beginPath()
  ctx.arc(0, 0, 390, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(225,180,76,0.72)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(0, 0, 350, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 318, 0, Math.PI * 2)
  ctx.stroke()

  ctx.font = '700 390px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const gradient = ctx.createLinearGradient(-160, -160, 170, 200)
  gradient.addColorStop(0, '#fff2b3')
  gradient.addColorStop(0.45, '#e8be56')
  gradient.addColorStop(1, '#865a13')
  ctx.fillStyle = gradient
  ctx.shadowColor = 'rgba(255,203,75,0.65)'
  ctx.shadowBlur = 30
  ctx.fillText('G', 0, -8)

  ctx.shadowBlur = 0
  ctx.font = '600 58px Georgia, "Times New Roman", serif'
  ctx.fillStyle = 'rgba(241,204,112,0.9)'
  ctx.fillText('GOLIAT GOLD', 0, 284)

  return finish(canvas)
}

export function slotScreenTexture() {
  const { canvas, ctx } = makeCanvas(768, 512)
  const bg = ctx.createLinearGradient(0, 0, 0, 512)
  bg.addColorStop(0, '#2b0508')
  bg.addColorStop(0.55, '#100207')
  bg.addColorStop(1, '#32080b')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 768, 512)

  ctx.strokeStyle = '#d6a838'
  ctx.lineWidth = 12
  ctx.strokeRect(10, 10, 748, 492)
  ctx.lineWidth = 3
  ctx.strokeRect(30, 30, 708, 452)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '700 58px Georgia, serif'
  const title = ctx.createLinearGradient(0, 40, 0, 100)
  title.addColorStop(0, '#fff1af')
  title.addColorStop(1, '#b67f20')
  ctx.fillStyle = title
  ctx.shadowColor = 'rgba(255,200,65,0.85)'
  ctx.shadowBlur = 18
  ctx.fillText('GOLIAT GOLD', 384, 76)
  ctx.shadowBlur = 0

  const symbols = ['7', '★', '♦']
  symbols.forEach((symbol, index) => {
    const x = 150 + index * 234
    ctx.fillStyle = '#f7e5aa'
    ctx.fillRect(x - 86, 128, 172, 270)
    const inner = ctx.createLinearGradient(x - 80, 130, x + 80, 390)
    inner.addColorStop(0, '#3a0710')
    inner.addColorStop(0.5, '#130206')
    inner.addColorStop(1, '#4c0a12')
    ctx.fillStyle = inner
    ctx.fillRect(x - 76, 134, 152, 258)
    ctx.strokeStyle = '#c08c2d'
    ctx.lineWidth = 4
    ctx.strokeRect(x - 76, 134, 152, 258)
    ctx.font = `700 ${index === 0 ? 190 : 150}px Georgia, serif`
    ctx.fillStyle = index === 0 ? '#ffd35b' : index === 1 ? '#ffeeb0' : '#e7a84a'
    ctx.shadowColor = 'rgba(255,205,80,0.75)'
    ctx.shadowBlur = 16
    ctx.fillText(symbol, x, 266)
    ctx.shadowBlur = 0
  })

  ctx.fillStyle = 'rgba(245,215,140,0.9)'
  ctx.font = '600 26px Georgia, serif'
  ctx.fillText('HIGH LIMIT  •  JACKPOT 25,000', 384, 442)

  return finish(canvas)
}

export function rouletteTexture() {
  const { canvas, ctx } = makeCanvas(1024, 1024)
  ctx.translate(512, 512)
  const segments = 37
  const radius = 500
  const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
  const order = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
    22, 18, 29, 7, 28, 12, 35, 3, 26,
  ]
  for (let i = 0; i < segments; i++) {
    const start = (i / segments) * Math.PI * 2 - Math.PI / 2
    const end = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2
    const number = order[i]
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, radius, start, end)
    ctx.closePath()
    ctx.fillStyle = number === 0 ? '#075e38' : red.has(number) ? '#8d0d1a' : '#11100d'
    ctx.fill()
    ctx.strokeStyle = '#c49a3a'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.save()
    ctx.rotate(start + (end - start) / 2)
    ctx.translate(0, -radius * 0.82)
    ctx.rotate(Math.PI / 2)
    ctx.fillStyle = '#f4e5b3'
    ctx.font = '700 36px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(number), 0, 0)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, 162, 0, Math.PI * 2)
  ctx.fillStyle = '#2a1604'
  ctx.fill()
  ctx.strokeStyle = '#e2b64f'
  ctx.lineWidth = 12
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, 95, 0, Math.PI * 2)
  ctx.fillStyle = '#120b03'
  ctx.fill()
  ctx.strokeStyle = '#9b6e1d'
  ctx.lineWidth = 5
  ctx.stroke()

  return finish(canvas)
}

export function woodTexture() {
  const { canvas, ctx } = makeCanvas(512, 512)
  const rand = seeded(77)
  const bg = ctx.createLinearGradient(0, 0, 512, 512)
  bg.addColorStop(0, '#2c1407')
  bg.addColorStop(0.5, '#4d240c')
  bg.addColorStop(1, '#1b0b03')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 80; i++) {
    ctx.beginPath()
    const y = rand() * 512
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(150, y + (rand() - 0.5) * 30, 350, y + (rand() - 0.5) * 40, 512, y + (rand() - 0.5) * 24)
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(218,157,70,0.12)' : 'rgba(8,3,0,0.24)'
    ctx.lineWidth = 0.8 + rand() * 2.6
    ctx.stroke()
  }
  const texture = finish(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 2)
  return texture
}
