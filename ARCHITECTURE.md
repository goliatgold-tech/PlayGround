# Architektur — Urkraft der Meere (Vertical Slice)

## 1. Leitentscheidungen

| Entscheidung | Begründung |
|---|---|
| **Server-autoritativ** | Client sendet Intents, nie Positionen. Cheats müssen den Server überzeugen. |
| **Shared Simulation Constants** | Client-Prediction und Server nutzen dieselben Werte → kein Drift. |
| **Datengetriebener Content** | Items/NPCs/Früchte in `content.ts`; Systeme kennen keine konkreten IDs. |
| **View ist dumm** | `scene.ts` simuliert nichts, es interpoliert nur Snapshots. |
| **Ein Prozess, eine Welt** | Für den Slice ausreichend; Sharding ist bewusst offen gelassen. |

## 2. Topologie

```
┌──────────────────────────── Browser ────────────────────────────┐
│  input.ts ──► main.ts ──► net.ts ──► WebSocket ──┐              │
│                   │                              │              │
│                   ▼                              │              │
│            Prediction + Reconciliation           │              │
│                   │                              │              │
│                   ▼                              │              │
│   scene.ts (Three.js) ◄── Snapshot ──────────────┘              │
│   hud.ts (DOM)                                                   │
└──────────────────────────────────────────────────────────────────┘
                                   │  ws://…/ws  (JSON)
                                   ▼
┌──────────────────────────── Node ────────────────────────────────┐
│ index.ts   Transport, Join, Tick 20 Hz, Snapshot 10 Hz, Save     │
│    │                                                             │
│    ▼                                                             │
│ world.ts   Bewegung · NPC-KI · Projektile · Schaden · XP · Loot   │
│    │                                                             │
│    ▼                                                             │
│ persistence.ts   data/players.json (Token → PlayerSave)          │
└──────────────────────────────────────────────────────────────────┘
```

Der Vite-Dev-Server proxyt `/ws` nach `:3001`, damit Client und Server unter
demselben Origin laufen (kein CORS, ein Port für den Browser).

## 3. Tick-Modell

| Loop | Frequenz | Aufgabe |
|---|---|---|
| Simulation | 20 Hz (`TICK_MS = 50`) | Bewegung, KI, Projektile, Schaden |
| Snapshot | 10 Hz (`SNAPSHOT_MS = 100`) | vollständiger Weltzustand an alle |
| Input-Uplink | 20 Hz | Client → Server Absichten |
| Persistenz | 10 s + Disconnect | Spielerstände schreiben |

`dt` wird auf 100 ms geklemmt, damit ein Tab-Throttle keinen Teleport auslöst.

### Warum kein Delta-Snapshot?
Für ≤ 64 Spieler + 8 NPCs ist der Vollsnapshot klein genug (wenige KB) und
eliminiert eine ganze Fehlerklasse. Der Wechsel auf Delta/AOI ist ein
Transport-Detail, kein Architekturwechsel.

## 4. Protokoll

Alle Nachrichten sind JSON-Objekte mit `type`.

### Client → Server

| `type` | Payload | Autorität |
|---|---|---|
| `join` | `name`, `faction`, `token` | Server erzeugt/liest Save |
| `input` | `up/down/left/right`, `aimX/aimZ`, `seq` | Server bewegt |
| `attack` | — | Server prüft Cooldown + spawnt Projektil |
| `skill` | — | Server prüft Frucht, Level, Cooldown |
| `dock` | `stat: hull \| cannons \| crew` | Server prüft Distanz + Gold |
| `chat` | `text` | Server trunkiert + broadcastet |
| `respawn` | — | Server prüft Timer |

### Server → Client

| `type` | Inhalt |
|---|---|
| `welcome` | `playerId`, `token`, erster `Snapshot` |
| `snapshot` | `players[]`, `npcs[]`, `projectiles[]`, `t` |
| `event` | `kind: info \| loot \| levelup \| death \| combat`, `text` |
| `chat` | `from`, `text`, `faction` |
| `levelup` | `level` |
| `error` | `text` |

### Anti-Cheat-Minimum
- Bewegung: Server wendet Input selbst an → keine Positionspakete.
- Feuerrate: Cooldown liegt ausschließlich serverseitig.
- Treffer: Projektile werden serverseitig bewegt und kollidiert.
- Upgrades: Distanz zum Dock + Gold werden serverseitig geprüft.

Nicht abgedeckt: Aim-Snapping, Paket-Replay, Multi-Accounting, Rate-Limits.

## 5. Datenmodelle

```ts
interface PlayerState {
  id, name, faction, x, z, rot,
  hp, maxHp, level, xp, xpNext,
  fruit: FruitId | null, gold, bounty,
  inventory: { itemId, count }[],
  ship: { hull, cannons, crew },
  alive, respawnAt, lastAttackAt, lastSkillAt
}

interface NpcState {
  id, type, faction, x, z, rot,
  hp, maxHp, level, alive, respawnAt,
  homeX, homeZ, lastAttackAt, aggroId
}

interface ProjectileState {
  id, ownerId, kind: 'cannon' | 'fireball', faction,
  x, z, vx, vz, damage, ttl
}

interface Snapshot { t, players[], npcs[], projectiles[] }
```

`PlayerSave` (persistiert) ist eine Teilmenge ohne Transienten
(`lastAttackAt`, `respawnAt`, Position).

## 6. Content-Registry

`src/shared/content.ts` ist die einzige Stelle, an der Inhalte definiert werden:

```ts
ITEMS        // id, name, rarity, value, stack, description
FACTIONS     // id, name, color, accent, enemies[], homeX/Z
FRUITS       // id, name, category, unlockLevel, skill{damage, cooldown, speed}
NPCS         // hp, damage, xp, speed, aggroRange, attackRange, loot[]
SHIP_UPGRADES// id, maxLevel, baseCost, costGrowth
```

Systeme lesen nur über diese Registry. Ein neues Item ist ein Objekt-Eintrag,
kein Code-Change.

## 7. Progression

```
xpForLevel(L)      = floor(90 * L^1.45)
maxHp              = 100 + (level-1)*5 + (hull-1)*20
cannonDamage       = 14 + (cannons-1)*3
cannonCooldown     = 850ms * (1 - 0.12*(crew-1))
upgradeCost(def, L)= round(baseCost * costGrowth^(L-1))
```

Frucht-Unlock: `level >= FRUITS.fire.unlockLevel (3)`.
Level-Up heilt voll und erhöht `xpNext`.

## 8. Client-Prediction & Reconciliation

1. Jeder Frame wendet der Client die Eingabe lokal auf `local.{x,z,rot}` an
   (gleiche `PLAYER_SPEED`, gleiche Kollision via `clampToPlayable`).
2. Bei jedem Snapshot:
   - Divergenz > 70 Units → **Snap** auf Serverposition.
   - sonst → **Ease** mit 12 % pro Snapshot.
3. Remote-Spieler und NPCs werden mit `dt*9` interpoliert, Rotation über
   kürzesten Winkelpfad (`dt*7`).

Der Server bleibt Quelle der Wahrheit; die Prediction ist reine Latenz-Kosmetik.

## 9. Erweitern

### Neues Item
Eintrag in `ITEMS` + ggf. Loot-Chance in `NPCS[...].loot`. Fertig.

### Neue Frucht
`FruitId`-Union erweitern, Eintrag in `FRUITS`, Unlock-Bedingung in
`World.grantXp` ergänzen. Die Skill-Ausführung ist bereits generisch
(`trySkill` liest `FRUITS[player.fruit].skill`).

### Neuer NPC-Typ
`NpcType` erweitern, `NPCS`-Eintrag, in `seedNpcs()` spawnen. KI ist generisch.

### Neue Insel
`ISLAND_RADIUS`/`CAVE` sind aktuell global. Für mehrere Inseln:
`IslandDef[]` in `content.ts`, `clampToPlayable` → `resolveCollisions(islands, x, z)`.
Das ist der erste echte Refactor, sobald die Welt wächst.

## 10. Weg zum echten MMO (Roadmap)

| Schritt | Aufwand | Warum |
|---|---|---|
| Interest Management (AOI/Grid) | mittel | Snapshot-Kosten skalieren mit Spielern |
| Binärprotokoll (MessagePack/FlatBuffers) | klein | Bandbreite, CPU |
| Datenbank (Postgres) statt JSON | klein | Atomarität, Backups |
| Auth (OAuth/Session + Rate-Limits) | mittel | Account-Sicherheit |
| Sharding pro Meeresregion | groß | echte Open World |
| Instanzierte Dungeons | mittel | Boss-Encounter isolieren |
| Server-seitiges Pathfinding/NavMesh | mittel | glaubwürdige NPCs |
| Anti-Cheat (Input-Sanitizing, Replay-Erkennung) | groß | PvP-Integrität |

## 11. Teststrategie

`npm test` fährt die Simulation headless ohne Netzwerk:

- Bewegung + Welt-/Inselkollision
- Projektiltreffer und Cooldown
- Kill → XP, Gold, Loot
- XP-Overflow → Level-Up → Frucht-Unlock
- Skill-Gating (Level + Cooldown)
- Dock-Upgrade (Gold + Distanz)
- Respawn
- Snapshot-Isolation (kein geteilter Zustand)

Der Browser-Smoke-Test prüft zusätzlich Rendering, Join, Bewegung und
HUD/Dock-Hinweis über `playwright-cli`.
