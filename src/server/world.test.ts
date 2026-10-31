/**
 * Headless integration tests for the authoritative simulation.
 * Run: npm test
 */

import assert from 'node:assert/strict';
import * as C from '../shared/constants';
import { World } from './world';
import type { InputState } from '../shared/types';

const idle = (over: Partial<InputState> = {}): InputState => ({
  seq: 1,
  up: false,
  down: false,
  left: false,
  right: false,
  aimX: 0,
  aimZ: 1,
  ...over,
});

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function tick(world: World, seconds: number): void {
  const steps = Math.ceil((seconds * 1000) / C.TICK_MS);
  for (let i = 0; i < steps; i++) world.update(C.TICK_MS, Date.now());
}

console.log('world simulation');

test('movement follows input and clamps to the world radius', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  p.x = 0;
  p.z = 300;
  const x0 = p.x;
  w.handleMessage('p1', { type: 'input', input: idle({ right: true }) });
  tick(w, 1);
  assert.ok(p.x > x0 + 20, `expected eastward movement, got ${p.x - x0}`);

  p.x = C.WORLD_RADIUS + 500;
  p.z = 0;
  w.handleMessage('p1', { type: 'input', input: idle({ right: true }) });
  tick(w, 0.5);
  assert.ok(Math.hypot(p.x, p.z) <= C.WORLD_RADIUS + 0.001);
});

test('ships cannot sail onto the island', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  p.x = 0;
  p.z = 300;
  w.handleMessage('p1', { type: 'input', input: idle({ up: true }) });
  tick(w, 8);
  assert.ok(Math.hypot(p.x, p.z) >= C.ISLAND_EXCLUSION - 0.5, `stopped at ${Math.hypot(p.x, p.z)}`);
});

test('cannon shot damages an NPC in the aim direction', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  const npc = [...w.npcs.values()].find((n) => n.type === 'marine_grunt')!;
  npc.x = 300;
  npc.z = 0;
  npc.homeX = 300;
  npc.homeZ = 0;
  p.x = 200;
  p.z = 0;

  w.handleMessage('p1', { type: 'input', input: idle({ aimX: 100, aimZ: 0 }) });
  w.handleMessage('p1', { type: 'attack' });
  assert.equal(w.projectiles.size, 1, 'projectile should spawn');

  tick(w, 0.5);
  assert.ok(npc.hp < npc.maxHp, `npc should take damage, hp=${npc.hp}`);
});

test('cannon cooldown blocks rapid fire', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  w.handleMessage('p1', { type: 'input', input: idle({ aimX: 1, aimZ: 0 }) });
  w.handleMessage('p1', { type: 'attack' });
  w.handleMessage('p1', { type: 'attack' });
  assert.equal(w.projectiles.size, 1);
});

test('killing an NPC grants xp, gold and loot', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  const npc = [...w.npcs.values()].find((n) => n.type === 'marine_grunt')!;
  npc.x = 300;
  npc.z = 0;
  npc.homeX = 300;
  npc.homeZ = 0;
  npc.hp = 1;
  p.x = 200;
  p.z = 0;

  w.handleMessage('p1', { type: 'input', input: idle({ aimX: 100, aimZ: 0 }) });
  w.handleMessage('p1', { type: 'attack' });
  tick(w, 0.5);

  assert.equal(npc.alive, false, 'npc should die');
  assert.ok(p.xp > 0, 'xp should be granted');
  assert.ok(p.gold > 0, 'gold should be granted');
});

test('xp overflow levels the player and unlocks the fruit', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  assert.equal(p.level, 1);
  assert.equal(p.fruit, null);

  w.grantXp(p, p.xpNext);
  assert.equal(p.level, 2);
  assert.equal(p.fruit, null, 'fruit unlocks at level 3');

  w.grantXp(p, p.xpNext);
  assert.equal(p.level, 3);
  assert.equal(p.fruit, 'fire');
});

test('fruit skill is gated by level and cooldown', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  w.handleMessage('p1', { type: 'input', input: idle({ aimX: 1, aimZ: 0 }) });
  w.handleMessage('p1', { type: 'skill' });
  assert.equal(w.projectiles.size, 0, 'no fruit, no skill');

  p.fruit = 'fire';
  p.level = 3;
  w.handleMessage('p1', { type: 'skill' });
  assert.equal(w.projectiles.size, 1);
  assert.equal([...w.projectiles.values()][0].kind, 'fireball');

  w.handleMessage('p1', { type: 'skill' });
  assert.equal(w.projectiles.size, 1, 'cooldown should block the second cast');
});

test('shipyard upgrade requires gold and proximity to the dock', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  p.gold = 0;
  p.x = C.DOCK.x;
  p.z = C.DOCK.z;

  w.handleMessage('p1', { type: 'dock', stat: 'cannons' });
  assert.equal(p.ship.cannons, 1, 'cannot upgrade without gold');

  p.gold = 1000;
  w.handleMessage('p1', { type: 'dock', stat: 'cannons' });
  assert.equal(p.ship.cannons, 2);
  assert.ok(p.gold < 1000, 'gold should be spent');

  p.x = 800;
  p.z = 800;
  const before = p.gold;
  w.handleMessage('p1', { type: 'dock', stat: 'cannons' });
  assert.equal(p.ship.cannons, 2, 'must be at the dock');
  assert.equal(p.gold, before, 'no gold spent far from the dock');
});

test('dead players respawn at their faction home', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  p.hp = 0;
  p.alive = false;
  p.respawnAt = Date.now() - 1;
  tick(w, 0.1);
  assert.equal(p.alive, true);
  assert.equal(p.hp, p.maxHp);
});

test('snapshot is a detached copy', () => {
  const w = new World();
  const p = w.addPlayer('p1', 'Tester', 'pirate');
  p.inventory.push({ itemId: 'rum', count: 2 });
  const snap = w.snapshot();
  snap.players[0].inventory[0].count = 99;
  assert.equal(p.inventory[0].count, 2);
});

console.log(`\n${passed} test(s) passed${process.exitCode ? ' — with failures' : ''}`);
