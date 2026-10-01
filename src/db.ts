import Dexie, { type Table } from 'dexie';
import type { Match, Player, Team } from './types';

export interface Meta {
  key: 'ownerUid' | 'activeTeamId';
  value: string;
}

class TrackerDB extends Dexie {
  players!: Table<Player, string>;
  matches!: Table<Match, string>;
  teams!: Table<Team, string>;
  /** Per-device settings; never synced. */
  meta!: Table<Meta, string>;

  constructor() {
    super('soccer-tracker');
    this.version(1).stores({
      players: 'id, createdAt',
      matches: 'id, createdAt',
    });
    this.version(2).stores({
      teams: 'id, createdAt',
      meta: 'key',
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
  version: 1 | 2;
  exportedAt: string;
  /** Absent in version 1 backups (single team). */
  teams?: Team[];
  players: Player[];
  matches: Match[];
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'soccer-tracker',
    version: 2,
    exportedAt: new Date().toISOString(),
    teams: await db.teams.toArray(),
    players: await db.players.toArray(),
    matches: await db.matches.toArray(),
  };
}

/** Remove every team, player, match and device setting from this device. */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', [db.players, db.matches, db.teams, db.meta], async () => {
    await Promise.all([db.players.clear(), db.matches.clear(), db.teams.clear(), db.meta.clear()]);
  });
  try {
    localStorage.removeItem('soccer-tracker:openMatch');
  } catch {
    /* storage unavailable: fine */
  }
}
