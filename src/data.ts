// All writes go through here so every change is timestamped (for conflict
// resolution) and mirrored to the cloud when sync is on.
import { db, newId, type Backup } from './db';
import { pushDeletion, pushRecord } from './sync';
import type { Match, Player } from './types';

/** Strictly increasing per record, even for several edits in the same millisecond. */
function stamp(prev?: number): number {
  return Math.max(Date.now(), (prev ?? 0) + 1);
}

export async function addPlayer(fields: Pick<Player, 'name' | 'number'>): Promise<void> {
  const now = Date.now();
  const player: Player = { id: newId(), ...fields, createdAt: now, updatedAt: now };
  await db.players.add(player);
  pushRecord('players', player);
}

export async function updatePlayer(id: string, changes: Partial<Omit<Player, 'id'>>): Promise<void> {
  let saved: Player | undefined;
  await db.transaction('rw', db.players, async () => {
    const p = await db.players.get(id);
    if (!p) return;
    saved = { ...p, ...changes, updatedAt: stamp(p.updatedAt) };
    await db.players.put(saved);
  });
  if (saved) pushRecord('players', saved);
}

export async function addMatch(fields: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = Date.now();
  const match: Match = { id: newId(), ...fields, createdAt: now, updatedAt: now };
  await db.matches.add(match);
  pushRecord('matches', match);
  return match.id;
}

/** Read-modify-write a match inside a transaction. */
export async function updateMatch(id: string, fn: (m: Match) => Match | void): Promise<void> {
  let saved: Match | undefined;
  await db.transaction('rw', db.matches, async () => {
    const m = await db.matches.get(id);
    if (!m) return;
    saved = { ...(fn(m) ?? m), updatedAt: stamp(m.updatedAt) };
    await db.matches.put(saved);
  });
  if (saved) pushRecord('matches', saved);
}

export async function deleteMatch(id: string): Promise<void> {
  const m = await db.matches.get(id);
  await db.matches.delete(id);
  pushDeletion('matches', id, stamp(m?.updatedAt));
}

/** Replace everything on this device (and in the cloud, when signed in) with a backup. */
export async function importBackup(data: unknown): Promise<void> {
  const b = data as Partial<Backup>;
  if (b?.app !== 'soccer-tracker' || !Array.isArray(b.players) || !Array.isArray(b.matches)) {
    throw new Error('This file is not a Soccer Tracker backup.');
  }
  const now = Date.now();
  const players = b.players.map((p) => ({ ...p, updatedAt: stamp(Math.max(now, p.updatedAt ?? 0)) }));
  const matches = b.matches.map((m) => ({ ...m, updatedAt: stamp(Math.max(now, m.updatedAt ?? 0)) }));
  const keepPlayers = new Set(players.map((p) => p.id));
  const keepMatches = new Set(matches.map((m) => m.id));
  let removedPlayers: Player[] = [];
  let removedMatches: Match[] = [];

  await db.transaction('rw', db.players, db.matches, async () => {
    removedPlayers = (await db.players.toArray()).filter((p) => !keepPlayers.has(p.id));
    removedMatches = (await db.matches.toArray()).filter((m) => !keepMatches.has(m.id));
    await db.players.clear();
    await db.matches.clear();
    await db.players.bulkPut(players);
    await db.matches.bulkPut(matches);
  });

  players.forEach((p) => pushRecord('players', p));
  matches.forEach((m) => pushRecord('matches', m));
  removedPlayers.forEach((p) => pushDeletion('players', p.id, stamp(Math.max(now, p.updatedAt ?? 0))));
  removedMatches.forEach((m) => pushDeletion('matches', m.id, stamp(Math.max(now, m.updatedAt ?? 0))));
}
