type SlotSymbol = { glyph: string; name: string; multiplier: number; color: string }

const SLOT_SYMBOLS: SlotSymbol[] = [
  { glyph: '7', name: 'SIEBEN', multiplier: 250, color: '#ffd65a' },
  { glyph: '★', name: 'STERN', multiplier: 100, color: '#fff1b5' },
  { glyph: '♦', name: 'DIAMANT', multiplier: 50, color: '#ffb74f' },
  { glyph: '♣', name: 'KREUZ', multiplier: 20, color: '#f1d58a' },
  { glyph: '♥', name: 'HERZ', multiplier: 15, color: '#e94a52' },
  { glyph: '⚜', name: 'FLEUR', multiplier: 10, color: '#e8c46d' },
]

const CARD_SUITS = [
  { symbol: '♠', color: 'black' },
  { symbol: '♥', color: 'red' },
  { symbol: '♦', color: 'red' },
  { symbol: '♣', color: 'black' },
] as const
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
type Card = { rank: string; suit: string; color: string }

const ROULETTE_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
  22, 18, 29, 7, 28, 12, 35, 3, 26,
]
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

type GameKind = 'slot' | 'blackjack' | 'roulette'

type GameOptions = {
  onCredits: (credits: number) => void
  onClose: () => void
}

function $<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element #${id}`)
  return element as T
}

function sleep(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms))
}

export class GameUI {
  private overlay = $<HTMLDivElement>('gameOverlay')
  private title = $<HTMLSpanElement>('gameTitle')
  private closeButton = $<HTMLButtonElement>('gameClose')
  private panels: Record<GameKind, HTMLElement> = {
    slot: $<HTMLElement>('slotPanel'),
    blackjack: $<HTMLElement>('blackjackPanel'),
    roulette: $<HTMLElement>('roulettePanel'),
  }
  private creditsElement = $<HTMLSpanElement>('gameCredits')
  private creditsValue = 1000
  private active: GameKind | null = null
  private options: GameOptions
  private slotTimers: number[] = []
  private slotSpinning = false
  private slotBet = 25
  private slotReels: HTMLElement[] = []
  private blackjack: {
    deck: Card[]
    player: Card[]
    dealer: Card[]
    bet: number
    phase: 'ready' | 'player' | 'done'
    hidden: boolean
  } = { deck: [], player: [], dealer: [], bet: 25, phase: 'ready', hidden: true }
  private highStakes = false
  private rouletteBet = 25
  private rouletteChoice: 'red' | 'black' | 'even' | 'odd' = 'red'
  private rouletteSpinning = false
  private rouletteRotation = 0
  private rouletteBallOrbit = 0
  private rouletteRaf = 0
  private rouletteCanvas = $<HTMLCanvasElement>('rouletteCanvas')
  private rouletteStatus = $<HTMLSpanElement>('rouletteStatus')

  constructor(options: GameOptions) {
    this.options = options
    this.slotReels = Array.from(document.querySelectorAll<HTMLElement>('#slotReels .reel'))
    this.closeButton.addEventListener('click', () => this.close())
    this.bindSlot()
    this.bindBlackjack()
    this.bindRoulette()
    this.setCredits(1000)
    this.drawRoulette(0, 0)
  }

  get isOpen() {
    return this.active !== null
  }

  get kind() {
    return this.active
  }

  open(kind: GameKind, variant?: 'high') {
    if (this.active) return
    this.active = kind
    this.highStakes = variant === 'high'
    this.overlay.hidden = false
    this.overlay.classList.add('is-open')
    this.overlay.setAttribute('aria-hidden', 'false')
    document.body.classList.add('modal-open')
    this.panels.slot.hidden = kind !== 'slot'
    this.panels.blackjack.hidden = kind !== 'blackjack'
    this.panels.roulette.hidden = kind !== 'roulette'
    this.title.textContent =
      kind === 'slot'
        ? 'GOLIAT GOLD · WALZEN'
        : kind === 'blackjack'
          ? this.highStakes
            ? 'HIGH STAKES · BLACKJACK'
            : 'BLACKJACK · 3 : 2'
          : 'ROULETTE · SINGLE ZERO'
    if (kind === 'slot') {
      this.slotBet = Math.min(this.slotBet, Math.max(5, this.creditsValue))
      this.renderSlot()
      this.setSlotMessage('Wähle deinen Einsatz und dreh die Walzen.')
    }
    if (kind === 'blackjack') {
      this.blackjack.bet = this.highStakes ? 100 : 25
      this.blackjack.phase = 'ready'
      this.blackjack.player = []
      this.blackjack.dealer = []
      this.blackjack.hidden = true
      this.renderBlackjack()
      this.setBlackjackMessage(this.highStakes ? 'VIP-Tisch. Mindesteinsatz 100.' : 'Bereit für die nächste Hand?')
    }
    if (kind === 'roulette') {
      this.rouletteStatus.textContent = 'Setze auf Rot, Schwarz, Gerade oder Ungerade.'
      this.rouletteStatus.classList.remove('win')
      $<HTMLButtonElement>('rouletteSpin').disabled = false
      this.drawRoulette(this.rouletteRotation, 0)
    }
    window.setTimeout(() => {
      if (kind === 'slot') $<HTMLButtonElement>('slotSpin').focus()
      if (kind === 'blackjack') $<HTMLButtonElement>('bjDeal').focus()
      if (kind === 'roulette') $<HTMLButtonElement>('rouletteSpin').focus()
    }, 80)
  }

  close() {
    if (!this.active) return
    this.clearSlotTimers()
    this.stopRoulette()
    this.active = null
    this.overlay.classList.remove('is-open')
    this.overlay.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('modal-open')
    window.setTimeout(() => {
      if (!this.active) this.overlay.hidden = true
    }, 240)
    this.options.onClose()
  }

  handleEscape() {
    if (!this.active) return false
    this.close()
    return true
  }

  handleKey(event: KeyboardEvent) {
    if (!this.active) return false
    if (event.code === 'Escape') {
      event.preventDefault()
      this.close()
      return true
    }
    if (this.active === 'slot' && event.code === 'Space') {
      event.preventDefault()
      this.spinSlot()
      return true
    }
    if (this.active === 'blackjack') {
      if (event.code === 'KeyH') {
        event.preventDefault()
        this.hitBlackjack()
        return true
      }
      if (event.code === 'KeyS') {
        event.preventDefault()
        this.standBlackjack()
        return true
      }
    }
    return false
  }

  setCredits(value: number) {
    this.creditsValue = Math.max(0, Math.floor(value))
    this.creditsElement.textContent = this.creditsValue.toLocaleString('de-DE')
    const hud = document.getElementById('creditsValue')
    if (hud) hud.textContent = this.creditsValue.toLocaleString('de-DE')
    const slot = document.getElementById('slotCredits')
    if (slot) slot.textContent = this.creditsValue.toLocaleString('de-DE')
    const bj = document.getElementById('bjCredits')
    if (bj) bj.textContent = this.creditsValue.toLocaleString('de-DE')
    const roulette = document.getElementById('rouletteCredits')
    if (roulette) roulette.textContent = this.creditsValue.toLocaleString('de-DE')
    this.options.onCredits(this.creditsValue)
  }

  // ── Slots ──────────────────────────────────────────────────────────────
  private bindSlot() {
    $<HTMLButtonElement>('slotSpin').addEventListener('click', () => this.spinSlot())
    $<HTMLButtonElement>('slotBetDown').addEventListener('click', () => {
      if (this.slotSpinning) return
      this.slotBet = Math.max(5, this.slotBet - 5)
      this.renderSlot()
    })
    $<HTMLButtonElement>('slotBetUp').addEventListener('click', () => {
      if (this.slotSpinning) return
      this.slotBet = Math.min(100, this.slotBet + 5)
      this.renderSlot()
    })
  }

  private renderSlot() {
    $<HTMLSpanElement>('slotBet').textContent = this.slotBet.toLocaleString('de-DE')
    this.slotReels.forEach((reel, index) => {
      const current = reel.dataset.symbol
      const symbol = SLOT_SYMBOLS.find(item => item.glyph === current) ?? SLOT_SYMBOLS[(index + 2) % SLOT_SYMBOLS.length]
      this.setReel(reel, symbol)
    })
    $<HTMLButtonElement>('slotSpin').disabled = this.slotSpinning || this.creditsValue < this.slotBet
  }

  private setReel(reel: HTMLElement, symbol: SlotSymbol) {
    reel.dataset.symbol = symbol.glyph
    const glyph = reel.querySelector<HTMLElement>('.symbol')
    if (glyph) {
      glyph.textContent = symbol.glyph
      glyph.style.color = symbol.color
      glyph.style.textShadow = `0 0 20px ${symbol.color}80`
    }
  }

  private setSlotMessage(message: string, win = false) {
    const element = $<HTMLDivElement>('slotMessage')
    element.textContent = message
    element.classList.toggle('win', win)
  }

  private clearSlotTimers() {
    this.slotTimers.forEach(timer => window.clearTimeout(timer))
    this.slotTimers = []
    this.slotSpinning = false
    this.slotReels.forEach(reel => reel.classList.remove('spinning'))
  }

  private spinSlot() {
    if (this.active !== 'slot' || this.slotSpinning) return
    if (this.creditsValue < this.slotBet) {
      this.setSlotMessage('Nicht genug Credits. Setze den Einsatz herunter.')
      return
    }
    this.setCredits(this.creditsValue - this.slotBet)
    this.slotSpinning = true
    this.setSlotMessage('Die Walzen laufen …')
    this.slotReels.forEach(reel => reel.classList.add('spinning'))
    $<HTMLButtonElement>('slotSpin').disabled = true

    const results = this.slotReels.map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)])
    this.slotReels.forEach((reel, index) => {
      const interval = window.setInterval(() => {
        this.setReel(reel, SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)])
      }, 58 + index * 13)
      this.slotTimers.push(interval)
      const stopTimer = window.setTimeout(() => {
        window.clearInterval(interval)
        this.setReel(reel, results[index])
        reel.classList.remove('spinning')
        if (index === this.slotReels.length - 1) this.finishSlot(results)
      }, 1050 + index * 330)
      this.slotTimers.push(stopTimer)
    })
  }

  private finishSlot(results: SlotSymbol[]) {
    this.slotSpinning = false
    let payout = 0
    let message = 'Kein Gewinn. Das Glück kommt zurück.'
    let win = false
    const [a, b, c] = results
    if (a.glyph === b.glyph && b.glyph === c.glyph) {
      payout = this.slotBet * a.multiplier
      message = `DREI ${a.name} · ${payout.toLocaleString('de-DE')} CREDITS!`
      win = true
    } else if (a.glyph === b.glyph || b.glyph === c.glyph || a.glyph === c.glyph) {
      payout = this.slotBet * 2
      message = `ZWEI GLEICHE · ${payout.toLocaleString('de-DE')} CREDITS`
      win = true
    }
    if (payout > 0) this.setCredits(this.creditsValue + payout)
    this.setSlotMessage(message, win)
    this.renderSlot()
  }

  // ── Blackjack ──────────────────────────────────────────────────────────
  private bindBlackjack() {
    $<HTMLButtonElement>('bjDeal').addEventListener('click', () => this.dealBlackjack())
    $<HTMLButtonElement>('bjHit').addEventListener('click', () => this.hitBlackjack())
    $<HTMLButtonElement>('bjStand').addEventListener('click', () => this.standBlackjack())
    $<HTMLButtonElement>('bjBetDown').addEventListener('click', () => {
      if (this.blackjack.phase === 'player') return
      this.blackjack.bet = Math.max(this.highStakes ? 100 : 10, this.blackjack.bet - 10)
      this.renderBlackjack()
    })
    $<HTMLButtonElement>('bjBetUp').addEventListener('click', () => {
      if (this.blackjack.phase === 'player') return
      this.blackjack.bet = Math.min(500, this.blackjack.bet + 10)
      this.renderBlackjack()
    })
  }

  private makeDeck(): Card[] {
    const deck: Card[] = []
    for (const suit of CARD_SUITS) {
      for (const rank of CARD_RANKS) deck.push({ rank, suit: suit.symbol, color: suit.color })
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return deck
  }

  private drawCard() {
    if (this.blackjack.deck.length < 8) this.blackjack.deck = this.makeDeck()
    return this.blackjack.deck.pop() as Card
  }

  private score(hand: Card[]) {
    let total = 0
    let aces = 0
    for (const card of hand) {
      if (card.rank === 'A') {
        total += 11
        aces++
      } else if (['J', 'Q', 'K'].includes(card.rank)) total += 10
      else total += Number(card.rank)
    }
    while (total > 21 && aces > 0) {
      total -= 10
      aces--
    }
    return total
  }

  private renderCard(card: Card, hidden = false) {
    const element = document.createElement('div')
    element.className = `playing-card${hidden ? ' hidden-card' : ''}${card.color === 'red' ? ' red' : ''}`
    if (hidden) {
      element.innerHTML = '<span class="card-back-mark">G</span>'
      return element
    }
    element.innerHTML = `<span class="card-corner">${card.rank}<br>${card.suit}</span><span class="card-suit">${card.suit}</span>`
    return element
  }

  private renderBlackjack() {
    $<HTMLSpanElement>('bjBet').textContent = this.blackjack.bet.toLocaleString('de-DE')
    $<HTMLSpanElement>('bjCredits').textContent = this.creditsValue.toLocaleString('de-DE')
    const playerHand = $<HTMLDivElement>('bjPlayerCards')
    const dealerHand = $<HTMLDivElement>('bjDealerCards')
    playerHand.replaceChildren(...this.blackjack.player.map(card => this.renderCard(card)))
    dealerHand.replaceChildren(
      ...this.blackjack.dealer.map((card, index) => this.renderCard(card, this.blackjack.hidden && index === 1)),
    )
    const dealerVisible = this.blackjack.hidden ? this.blackjack.dealer.slice(0, 1) : this.blackjack.dealer
    $<HTMLSpanElement>('bjPlayerScore').textContent = this.blackjack.player.length ? String(this.score(this.blackjack.player)) : '—'
    $<HTMLSpanElement>('bjDealerScore').textContent = dealerVisible.length ? String(this.score(dealerVisible)) : '—'
    const playerTurn = this.blackjack.phase === 'player'
    $<HTMLButtonElement>('bjHit').disabled = !playerTurn
    $<HTMLButtonElement>('bjStand').disabled = !playerTurn
    $<HTMLButtonElement>('bjDeal').disabled = playerTurn || this.creditsValue < this.blackjack.bet
    $<HTMLButtonElement>('bjBetDown').disabled = playerTurn
    $<HTMLButtonElement>('bjBetUp').disabled = playerTurn
  }

  private setBlackjackMessage(message: string, win = false) {
    const element = $<HTMLDivElement>('bjMessage')
    element.textContent = message
    element.classList.toggle('win', win)
  }

  private dealBlackjack() {
    if (this.active !== 'blackjack' || this.blackjack.phase === 'player') return
    if (this.creditsValue < this.blackjack.bet) {
      this.setBlackjackMessage('Nicht genug Credits für diesen Einsatz.')
      return
    }
    this.setCredits(this.creditsValue - this.blackjack.bet)
    this.blackjack.deck = this.makeDeck()
    this.blackjack.player = [this.drawCard(), this.drawCard()]
    this.blackjack.dealer = [this.drawCard(), this.drawCard()]
    this.blackjack.hidden = true
    this.blackjack.phase = 'player'
    this.setBlackjackMessage('Deine Hand. Ziehen oder stehen?')
    this.renderBlackjack()
    if (this.score(this.blackjack.player) === 21) {
      window.setTimeout(() => this.standBlackjack(), 450)
    }
  }

  private hitBlackjack() {
    if (this.active !== 'blackjack' || this.blackjack.phase !== 'player') return
    this.blackjack.player.push(this.drawCard())
    const score = this.score(this.blackjack.player)
    this.renderBlackjack()
    if (score > 21) {
      this.blackjack.phase = 'done'
      this.blackjack.hidden = false
      this.setBlackjackMessage(`Überkauft mit ${score}. Das Haus gewinnt.`)
      this.renderBlackjack()
    } else if (score === 21) {
      window.setTimeout(() => this.standBlackjack(), 300)
    } else {
      this.setBlackjackMessage(`Deine Hand: ${score}. Noch eine Karte?`)
    }
  }

  private standBlackjack() {
    if (this.active !== 'blackjack' || this.blackjack.phase !== 'player') return
    this.blackjack.hidden = false
    let dealerScore = this.score(this.blackjack.dealer)
    while (dealerScore < 17) {
      this.blackjack.dealer.push(this.drawCard())
      dealerScore = this.score(this.blackjack.dealer)
    }
    const playerScore = this.score(this.blackjack.player)
    this.blackjack.phase = 'done'
    if (playerScore > 21) {
      this.setBlackjackMessage(`Überkauft mit ${playerScore}. Das Haus gewinnt.`)
    } else if (dealerScore > 21) {
      this.setCredits(this.creditsValue + this.blackjack.bet * 2)
      this.setBlackjackMessage(`Dealer überkauft (${dealerScore}). Du gewinnst ${(this.blackjack.bet * 2).toLocaleString('de-DE')} Credits!`, true)
    } else if (playerScore > dealerScore) {
      this.setCredits(this.creditsValue + this.blackjack.bet * 2)
      this.setBlackjackMessage(`${playerScore} gegen ${dealerScore}. Du gewinnst ${(this.blackjack.bet * 2).toLocaleString('de-DE')} Credits!`, true)
    } else if (playerScore === dealerScore) {
      this.setCredits(this.creditsValue + this.blackjack.bet)
      this.setBlackjackMessage(`Push bei ${playerScore}. Dein Einsatz kommt zurück.`)
    } else {
      this.setBlackjackMessage(`${dealerScore} gegen ${playerScore}. Das Haus gewinnt.`)
    }
    this.renderBlackjack()
  }

  // ── Roulette ───────────────────────────────────────────────────────────
  private bindRoulette() {
    document.querySelectorAll<HTMLButtonElement>('[data-roulette-choice]').forEach(button => {
      button.addEventListener('click', () => {
        if (this.rouletteSpinning) return
        this.rouletteChoice = button.dataset.rouletteChoice as typeof this.rouletteChoice
        document.querySelectorAll('[data-roulette-choice]').forEach(item => item.classList.remove('selected'))
        button.classList.add('selected')
      })
    })
    $<HTMLButtonElement>('rouletteBetDown').addEventListener('click', () => {
      if (this.rouletteSpinning) return
      this.rouletteBet = Math.max(5, this.rouletteBet - 5)
      $<HTMLSpanElement>('rouletteBet').textContent = this.rouletteBet.toLocaleString('de-DE')
    })
    $<HTMLButtonElement>('rouletteBetUp').addEventListener('click', () => {
      if (this.rouletteSpinning) return
      this.rouletteBet = Math.min(100, this.rouletteBet + 5)
      $<HTMLSpanElement>('rouletteBet').textContent = this.rouletteBet.toLocaleString('de-DE')
    })
    $<HTMLButtonElement>('rouletteSpin').addEventListener('click', () => this.spinRoulette())
    this.drawRoulette(0, 0)
  }

  private stopRoulette() {
    if (this.rouletteRaf) cancelAnimationFrame(this.rouletteRaf)
    this.rouletteRaf = 0
    this.rouletteSpinning = false
    $<HTMLButtonElement>('rouletteSpin').disabled = false
  }

  private drawRoulette(rotation: number, ballOrbit: number) {
    const canvas = this.rouletteCanvas
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const size = canvas.width
    const center = size / 2
    const radius = center - 14
    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.translate(center, center)

    // Outer rim.
    const rimGradient = ctx.createRadialGradient(0, 0, radius * 0.72, 0, 0, radius)
    rimGradient.addColorStop(0, '#7a5214')
    rimGradient.addColorStop(0.65, '#e0b64f')
    rimGradient.addColorStop(1, '#4a2c07')
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fillStyle = rimGradient
    ctx.fill()
    ctx.strokeStyle = '#f2d27b'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.rotate(rotation)
    const segments = 37
    const inner = radius * 0.31
    for (let i = 0; i < segments; i++) {
      const start = (i / segments) * Math.PI * 2 - Math.PI / 2
      const end = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2
      const number = ROULETTE_ORDER[i]
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, radius * 0.92, start, end)
      ctx.closePath()
      ctx.fillStyle = number === 0 ? '#075e38' : RED_NUMBERS.has(number) ? '#8b0d1b' : '#12110f'
      ctx.fill()
      ctx.strokeStyle = 'rgba(230,190,95,0.7)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.save()
      ctx.rotate(start + (end - start) / 2)
      ctx.translate(0, -radius * 0.78)
      ctx.rotate(Math.PI / 2)
      ctx.fillStyle = '#f7e9bc'
      ctx.font = '700 17px Georgia, serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(number), 0, 0)
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(0, 0, inner, 0, Math.PI * 2)
    ctx.fillStyle = '#221306'
    ctx.fill()
    ctx.strokeStyle = '#d9ae48'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, inner * 0.55, 0, Math.PI * 2)
    ctx.fillStyle = '#0c0803'
    ctx.fill()
    ctx.strokeStyle = '#8d651d'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()

    // The ball rides the top edge and settles into the winning pocket.
    ctx.save()
    ctx.translate(center, center)
    ctx.rotate(ballOrbit)
    ctx.beginPath()
    ctx.arc(0, -radius * 0.75, 6.2, 0, Math.PI * 2)
    const ballGradient = ctx.createRadialGradient(-2, -2, 1, 0, 0, 7)
    ballGradient.addColorStop(0, '#fffbe4')
    ballGradient.addColorStop(0.55, '#e7c66d')
    ballGradient.addColorStop(1, '#7a5214')
    ctx.fillStyle = ballGradient
    ctx.shadowColor = 'rgba(255,225,145,0.9)'
    ctx.shadowBlur = 8
    ctx.fill()
    ctx.restore()
  }

  private spinRoulette() {
    if (this.active !== 'roulette' || this.rouletteSpinning) return
    if (this.creditsValue < this.rouletteBet) {
      this.rouletteStatus.textContent = 'Nicht genug Credits für diesen Einsatz.'
      return
    }
    this.setCredits(this.creditsValue - this.rouletteBet)
    this.rouletteSpinning = true
    this.rouletteStatus.textContent = 'Die Kugel läuft …'
    $<HTMLButtonElement>('rouletteSpin').disabled = true
    const result = ROULETTE_ORDER[Math.floor(Math.random() * ROULETTE_ORDER.length)]
    const index = ROULETTE_ORDER.indexOf(result)
    const startRotation = this.rouletteRotation
    const targetRotation = startRotation + Math.PI * 2 * 6 + (-index / 37) * Math.PI * 2
    const startTime = performance.now()
    const duration = 3900
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      this.rouletteRotation = startRotation + (targetRotation - startRotation) * eased
      this.rouletteBallOrbit = (1 - eased) * Math.PI * 9
      this.drawRoulette(this.rouletteRotation, this.rouletteBallOrbit)
      if (progress < 1) {
        this.rouletteRaf = requestAnimationFrame(animate)
      } else {
        this.rouletteRaf = 0
        this.finishRoulette(result)
      }
    }
    this.rouletteRaf = requestAnimationFrame(animate)
  }

  private finishRoulette(result: number) {
    this.rouletteSpinning = false
    $<HTMLButtonElement>('rouletteSpin').disabled = false
    const color = result === 0 ? 'grün' : RED_NUMBERS.has(result) ? 'rot' : 'schwarz'
    const even = result !== 0 && result % 2 === 0
    const won =
      (this.rouletteChoice === 'red' && color === 'rot') ||
      (this.rouletteChoice === 'black' && color === 'schwarz') ||
      (this.rouletteChoice === 'even' && even) ||
      (this.rouletteChoice === 'odd' && result !== 0 && !even)
    if (won) {
      const payout = this.rouletteBet * 2
      this.setCredits(this.creditsValue + payout)
      this.rouletteStatus.textContent = `${result} ${color.toUpperCase()} · Gewinn ${payout.toLocaleString('de-DE')} Credits!`
      this.rouletteStatus.classList.add('win')
    } else {
      this.rouletteStatus.textContent = `${result} ${color.toUpperCase()} · Das Haus gewinnt.`
      this.rouletteStatus.classList.remove('win')
    }
  }
}
