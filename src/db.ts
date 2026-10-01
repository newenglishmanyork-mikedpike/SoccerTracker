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
