# ⚓ Urkraft der Meere — Pirate RPG (Web Vertical Slice)

Ein **spielbarer Vertical Slice** eines Open-World-Piraten-RPGs im Browser.
Kein Mockup, kein Pseudocode: autoritativer Server, Client-Prediction,
Three.js-Rendering, Progression, Loot, Fraktionen und Schiffskampf.

> **Plattform:** Web / TypeScript
> **Stack:** Vite · Three.js · WebSocket (`ws`) · Node 22
> **Ziel:** beweisen, dass die Architektur trägt — nicht ein fertiges MMO.

---

## Was tatsächlich spielbar ist

| System | Status |
|---|---|
| Open-World-See mit Insel, Kollision, Nebel-Horizont | ✅ |
| Multiplayer (ein Server, Snapshot-Replikation, 10 Hz) | ✅ |
| Charakter/Account (Name, Token, persistentes Save) | ✅ |
| Level, XP, Skill-Unlock (Flamma-Frucht ab Lv 3) | ✅ |
| Fraktionen: Piraten vs. Marine (Aggro, PvP) | ✅ |
| Urkraft-Frucht: Feuerlanze (Projektil + Cooldown) | ✅ |
| Kampf: Bordkanone, Fernkampf, Schiffskampf | ✅ |
| Schiff-Upgrades: Rumpf, Kanonen, Crew | ✅ |
| Loot mit Raritäten + Inventar | ✅ |
| NPCs inkl. Boss (Tiefenwächter, 900 HP) | ✅ |
| Chat, Minimap, Tod/Respawn | ✅ |
| Mobile: Touch-Joystick + Buttons | ✅ (Basis) |
| Housing, Städtebau, Crew-Kriege, Berufe, Dungeon-Instanzen | ❌ bewusst ausgeklammert |

Der Slice ist **eine** Insel, **zwei** Fraktionen, **eine** Frucht, **ein** Boss —
aber die Systeme dahinter sind datengetrieben und erweiterbar.

---

## Schnellstart

```bash
npm install
npm run dev        # Server :3001 + Client :3002
```

Dann <http://localhost:3002> öffnen, Namen eingeben, Fraktion wählen, „In See stechen“.

| Befehl | Zweck |
|---|---|
| `npm run dev` | Server + Vite parallel |
| `npm run dev:server` | nur autoritativer Server (tsx watch) |
| `npm run dev:client` | nur Vite |
| `npm test` | 10 Simulationstests (Movement, Combat, XP, Dock, Respawn) |
| `npm run build` | Typecheck + Production-Build |
| `npm start` | Server ohne Watch (Production) |

---

## Steuerung

| Eingabe | Aktion |
|---|---|
| `W A S D` / Pfeiltasten | segeln |
| Maus | zielen |
| Linksklick | Bordkanone |
| `Q` | Urkraft-Fähigkeit (ab Level 3) |
| `E` | anlegen / Kanonen aufrüsten (am Dock) |
| `Enter` | Chat |
| `Leertaste` | Respawn anfordern |

Mobile: linke Bildschirmhälfte = Joystick, rechte Hälfte = Feuer, Buttons `Q`/`E`.

---

## Projektstruktur

```
src/
├── shared/          # von Server UND Client importiert
│   ├── constants.ts # Tuning: Tickrate, Reichweiten, Weltradien
│   ├── types.ts     # Wire-Protokoll + Simulationszustand
│   ├── content.ts   # datengetriebene Registry (Items, NPCs, Früchte, Fraktionen)
│   └── math.ts      # Vektor-, Winkel- und Kollisions-Helfer
├── server/
│   ├── index.ts     # WebSocket-Transport, Tick-Loop, Broadcast
│   ├── world.ts     # autoritative Simulation (das eigentliche Spiel)
│   ├── persistence.ts
│   └── world.test.ts
└── client/
    ├── main.ts      # Bootstrap, Prediction, Reconciliation
    ├── net.ts       # WebSocket-Client mit Reconnect
    ├── scene.ts     # Three.js-View (rein darstellend)
    ├── hud.ts       # DOM-HUD + Minimap
    ├── input.ts     # Tastatur/Maus/Touch → Intents
    └── style.css
```

Details: **[ARCHITECTURE.md](./ARCHITECTURE.md)**
Angepasster Master-Prompt: **[GAME_PROMPT.md](./GAME_PROMPT.md)**

---

## Architektur in einem Absatz

Der Client sendet **nur Absichten** (`input`, `attack`, `skill`, `dock`).
Der Server simuliert mit fixen 20 Hz und broadcastet 10 Hz Snapshots.
Der lokale Spieler wird clientseitig vorhergesagt und weich auf die
Serverposition korrigiert (Snap bei > 70 Units Divergenz).
Alle Inhalte liegen in `shared/content.ts` — neue Items, NPCs oder Früchte
brauchen **keinen** Systemcode.

---

## Bekannte Grenzen (ehrlich)

- **Kein echtes Account-System:** Token in `localStorage`, kein Passwort, keine Session-Sicherheit.
- **Ein Weltprozess:** keine Sharding-/Interest-Management-Schicht. Ab ~64 Spielern
  müsste man AOI (Area of Interest) einbauen.
- **JSON über WebSocket:** einfach zu debuggen, aber teurer als Binärprotokoll.
- **Keine Server-Autorität über Aim-Assist:** Zielen ist clientseitig, Treffer werden serverseitig geprüft.
- **Assets sind prozedural** (Three.js-Primitive), kein Art-Pipeline.
- **Persistenz** ist eine JSON-Datei, keine Datenbank.

---

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/goliatgold-tech/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/goliatgold-tech/PlayGround)

- 🎮 [Open the project](https://omgithub.com/goliatgold-tech/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=goliatgold-tech%2FPlayGround).
- 💻 [Explore the source](https://github.com/goliatgold-tech/PlayGround).
- 🛠️ [Check build runs](https://github.com/goliatgold-tech/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/goliatgold-tech/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/goliatgold-tech).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
