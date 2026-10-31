/**
 * Very small JSON persistence layer.
 *
 * Keyed by a client-held token (stored in localStorage). This is deliberately
 * minimal: no password hashing, no rate limiting. It exists so progression
 * survives a reload and so the save/load seam is real, not mocked.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PlayerSave } from './world';

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const SAVE_FILE = join(DATA_DIR, 'players.json');

type SaveFile = Record<string, PlayerSave>;

let cache: SaveFile | null = null;

function load(): SaveFile {
  if (cache) return cache;
  try {
    if (existsSync(SAVE_FILE)) {
      cache = JSON.parse(readFileSync(SAVE_FILE, 'utf8')) as SaveFile;
    } else {
      cache = {};
    }
  } catch {
    cache = {};
  }
  return cache;
}

export function getSave(token: string): PlayerSave | undefined {
  if (!token) return undefined;
  return load()[token];
}

export function putSave(token: string, save: PlayerSave): void {
  if (!token) return;
  const data = load();
  data[token] = save;
}

export function flush(): void {
  const data = load();
  mkdirSync(dirname(SAVE_FILE), { recursive: true });
  writeFileSync(SAVE_FILE, JSON.stringify(data, null, 2), 'utf8');
}
