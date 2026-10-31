# 🎮 MASTER PROMPT — „Urkraft der Meere“ (Web / TypeScript, Vertical Slice)

> Angepasste Fassung des Piraten-RPG-Prompts.
> **Plattform:** Web · **Scope:** Vertical Slice · **Ziel:** spielbar + erweiterbar.
> Copy-paste-fertig für eine Game-KI oder ein Entwicklerteam.

---

## Rolle

Du bist Lead Gameplay-Engineer für ein browserbasiertes Open-World-Piraten-RPG.
Du lieferst **laufenden Code**, keine Beschreibung von Code.
Wenn eine Anforderung den Slice sprengt, sag es explizit und schlage den
kleinsten Schnitt vor, der die Architektur trotzdem beweist.

## Technischer Rahmen (verbindlich)

| Bereich | Vorgabe |
|---|---|
| Sprache | TypeScript, `strict` |
| Client | Vite + Three.js, WebGL2 |
| Server | Node 22, `ws`, autoritativ, 20 Hz Tick |
| Transport | JSON über WebSocket, Pfad `/ws` |
| Dev-Ports | Client `3002`, Server `3001` (Vite-Proxy) |
| Persistenz | JSON-Datei `data/players.json` (Token → Save) |
| Tests | headless Simulationstests, `npm test` |
| Assets | prozedurale Three.js-Primitive, keine externen Modelle |

**Nicht verhandelbar:** Der Client sendet niemals Positionen, nur Absichten.
Der Server entscheidet über Bewegung, Treffer, Tod, Loot und Progression.

## Spielkonzept (Slice)

Eine Ozeanwelt mit **einer** Insel, **zwei** Fraktionen und einem Boss.
Der Slice muss den kompletten Kern-Loop abbilden:

```
segeln → Gegner finden → kämpfen → Beute/XP → Level-Up → Fähigkeit
      → Schiff aufrüsten → stärkerer Gegner (Boss)
```

### Welt
- Runde Ozeanwelt (Radius 900), Insel (Radius 150) mit Strand, Wald, Berg.
- Kollision: Schiffe bleiben im Ozean und **außerhalb** der Insel.
- Seehöhle am Inselrand als Boss-Arena.
- Dock als einziger Upgrade-Ort.

### Fraktionen
- **Piraten** vs. **Marine**, Feindschaft bidirektional.
- PvP ist immer aktiv (kein Flagging im Slice).
- Kopfgeld steigt bei PvP-Kills.

### Charakter & Progression
- Account: Name + Token, Save überlebt Reload.
- XP-Kurve: `floor(90 * level^1.45)`.
- Level-Up: volle Heilung, `maxHp +5`.
- Frucht-Unlock bei Level 3 (eine Frucht: „Flamma“, Element Feuer).

### Kampf
- Bordkanone: 14 Schaden, 850 ms Cooldown, 280 Reichweite.
- Crew-Upgrade senkt Cooldown, Kanonen-Upgrade erhöht Schaden.
- Frucht-Skill „Feuerlanze“: 42 Schaden, 3,5 s Cooldown.
- NPC-KI: Aggro-Radius, Annäherung, Feuerreichweite, Patrouille.

### Schiff
- Upgrades: Rumpf (+20 HP/Stufe), Kanonen (+3 DMG/Stufe), Crew (−12 % CD/Stufe).
- Kosten: `round(baseCost * growth^(level-1))`, Maximum Stufe 5.
- Upgrades nur am Dock und nur mit genug Gold.

### Loot & Inventar
- Raritäten: common → legendary, farbcodiert im HUD.
- Loot-Tabellen pro NPC mit Chance und Menge.
- Stacks mit Cap pro Item.

### UI
- HP-/XP-Balken, Level, Fraktion, Gold, Kopfgeld.
- Inventar, Schiffspanel, Skill-Slot mit Cooldown.
- Minimap (Insel, Dock, Höhle, Spieler, NPCs).
- Chat-Log, Toasts, Dock-Hinweis.
- Mobile: Touch-Joystick links, Feuer rechts, Buttons für Skill/Dock.

## Architektur-Anforderungen

1. **`src/shared/`** enthält alles, was Server und Client gemeinsam nutzen:
   Konstanten, Typen, Content-Registry, Mathematik/Kollision.
2. **`src/server/world.ts`** ist die einzige Simulationsquelle. Keine
   Spiellogik in Transportdateien.
3. **`src/client/scene.ts`** ist eine reine View. Sie interpoliert Snapshots
   und darf niemals Gameplay-Zustand verändern.
4. **Client-Prediction** für den lokalen Spieler, Reconciliation gegen den
   Server (Snap > 70 Units, sonst Ease).
5. **Content ist Daten**, keine `switch`-Kaskaden: neue Items/NPCs/Früchte
   sind Registry-Einträge.
6. **Erweiterbarkeit:** Jedes System (Combat, Progression, Loot, Shipyard)
   ist eine klar benannte Methode mit schmaler Schnittstelle.

## Lieferobjekte

1. Lauffähiges Repository (`npm install && npm run dev`).
2. `README.md` mit Start, Steuerung, Scope und Grenzen.
3. `ARCHITECTURE.md` mit Topologie, Protokoll, Datenmodellen, Roadmap.
4. Headless-Tests für: Bewegung/Kollision, Treffer, Cooldown, Kill→Loot/XP,
   Level-Up→Unlock, Skill-Gating, Dock-Upgrade, Respawn.
5. Ein Browser-Smoke-Test-Nachweis (Screenshot + Konsolenfehler = 0).

## Abnahmekriterien (Definition of Done)

- [ ] Zwei Browser-Tabs sehen sich gegenseitig und können sich treffen.
- [ ] Ein Schuss trifft nur, wenn der Server die Kollision bestätigt.
- [ ] Ein Kill vergibt XP, Gold und mindestens einen Loot-Drop.
- [ ] Level 3 schaltet die Frucht frei; `Q` wirkt sie mit Cooldown.
- [ ] Dock-Upgrade schlägt bei zu wenig Gold **und** bei zu großer Distanz fehl.
- [ ] Tod → Respawn nach 5 s am Fraktionshafen.
- [ ] `npm test` grün, `npm run build` ohne Fehler.
- [ ] Keine Konsolenfehler im Browser.
- [ ] Mobile Layout bleibt innerhalb der Safe Areas.

## Bewusst NICHT im Slice

Housing, Städtebau, Crew-Kriege, Inseleroberung, Berufe/Crafting,
Marktplatz, Tempelorden, mehrere Meere, Instanz-Dungeons, Freundesliste.

Diese Systeme werden **als Erweiterungspunkte dokumentiert**, nicht implementiert.
Wer sie trotzdem einbaut, verletzt den Scope.

## Arbeitsweise

1. Zuerst Datenmodelle + Content-Registry.
2. Dann Server-Simulation + Tests.
3. Dann Transport + Client-View.
4. Dann HUD/Input/Mobile.
5. Zum Schluss Politur und Dokumentation.

Nach jedem Schritt: `npm test`, `npx tsc --noEmit`, Browser-Screenshot.
Kein Schritt gilt als fertig ohne laufenden Nachweis.

---

### Portierung auf andere Engines

| Ziel | Was sich ändert | Was bleibt |
|---|---|---|
| **Unity** | `world.ts` → C#-Systeme, `scene.ts` → GameObjects, Netcode for GameObjects | Content-Schema, Tick-Modell, Autoritätsregeln, XP-Formeln |
| **Unreal** | Data Tables statt `content.ts`, Replication statt Snapshots | Protokoll-Semantik, Progression, Scope |
| **Roblox** | Luau-Module, `RemoteEvents`, ProfileService statt JSON | Datenmodelle, Anti-Cheat-Regeln, Loop |
| **AI Studio** | Prompt-Kette + simulierte Systeme | **kein** echtes Multiplayer — explizit kennzeichnen |
