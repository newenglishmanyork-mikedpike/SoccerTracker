import Dexie, { type Table } from 'dexie';
import type { Match, Player } from './types';

class TrackerDB extends Dexie {
  players!: Table<Player, string>;
  matches!: Table<Match, string>;

  constructor() {
    super('soccer-tracker');
    this.version(1).stores({
      players: 'id, createdAt',
      matches: 'id, createdAt',
    });
  }
}

export const db = new TrackerDB();

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Read-modify-write a match inside a transaction. */
export async function updateMatch(id: string, fn: (m: Match) => Match | void): Promise<void> {
  await db.transaction('rw', db.matches, async () => {
    const m = await db.matches.get(id);
    if (!m) return;
    const next = fn(m) ?? m;
    await db.matches.put(next);
  });
}

export interface Backup {
  app: 'soccer-tracker';
  version: 1;
  exportedAt: string;
  players: Player[];
  matches: Match[];
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'soccer-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    players: await db.players.toArray(),
    matches: await db.matches.toArray(),
  };
}

export async function importBackup(data: unknown): Promise<void> {
  const b = data as Partial<Backup>;
  if (b?.app !== 'soccer-tracker' || !Array.isArray(b.players) || !Array.isArray(b.matches)) {
    throw new Error('This file is not a Soccer Tracker backup.');
  }
  await db.transaction('rw', db.players, db.matches, async () => {
    await db.players.clear();
    await db.matches.clear();
    await db.players.bulkPut(b.players!);
    await db.matches.bulkPut(b.matches!);
  });
}
