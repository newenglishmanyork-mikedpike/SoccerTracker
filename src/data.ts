// All writes go through here so every change is timestamped (for conflict
// resolution) and mirrored to the cloud when sync is on.
import { db, newId, type Backup } from './db';
import { pushDeletion, pushRecord } from './sync';
import { DEFAULT_TEAM_ID, teamOf } from './teams';
import type { Match, Player, Team } from './types';

/** Strictly increasing per record, even for several edits in the same millisecond. */
function stamp(prev?: number): number {
  return Math.max(Date.now(), (prev ?? 0) + 1);
}

export async function addPlayer(fields: Pick<Player, 'name' | 'number' | 'teamId'>): Promise<void> {
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
  const teams = (b.teams ?? []).map((t) => ({ ...t, updatedAt: stamp(Math.max(now, t.updatedAt ?? 0)) }));
  const players = b.players.map((p) => ({ ...p, updatedAt: stamp(Math.max(now, p.updatedAt ?? 0)) }));
  const matches = b.matches.map((m) => ({ ...m, updatedAt: stamp(Math.max(now, m.updatedAt ?? 0)) }));
  // A single-team (version 1) backup goes into the default team.
  if (!teams.some((t) => t.id === DEFAULT_TEAM_ID) && [...players, ...matches].some((r) => !r.teamId)) {
    teams.push({ id: DEFAULT_TEAM_ID, name: 'My team', createdAt: 0, updatedAt: stamp(now) });
  }
  const keepTeams = new Set(teams.map((t) => t.id));
  const keepPlayers = new Set(players.map((p) => p.id));
  const keepMatches = new Set(matches.map((m) => m.id));
  let removedTeams: Team[] = [];
  let removedPlayers: Player[] = [];
  let removedMatches: Match[] = [];

  await db.transaction('rw', db.players, db.matches, db.teams, async () => {
    removedTeams = (await db.teams.toArray()).filter((t) => !keepTeams.has(t.id));
    removedPlayers = (await db.players.toArray()).filter((p) => !keepPlayers.has(p.id));
    removedMatches = (await db.matches.toArray()).filter((m) => !keepMatches.has(m.id));
    await db.players.clear();
    await db.matches.clear();
    await db.teams.clear();
    await db.teams.bulkPut(teams);
    await db.players.bulkPut(players);
    await db.matches.bulkPut(matches);
  });

  teams.forEach((t) => pushRecord('teams', t));
  players.forEach((p) => pushRecord('players', p));
  matches.forEach((m) => pushRecord('matches', m));
  removedTeams.forEach((t) => pushDeletion('teams', t.id, stamp(Math.max(now, t.updatedAt ?? 0))));
  removedPlayers.forEach((p) => pushDeletion('players', p.id, stamp(Math.max(now, p.updatedAt ?? 0))));
  removedMatches.forEach((m) => pushDeletion('matches', m.id, stamp(Math.max(now, m.updatedAt ?? 0))));
}

/**
 * Make sure there's at least one team. Its updatedAt is deliberately ancient
 * and it isn't pushed: if the cloud already has this team (perhaps renamed),
 * the cloud copy wins when sync catches up.
 */
export async function ensureDefaultTeam(): Promise<void> {
  if ((await db.teams.count()) > 0) return;
  await db.teams.put({ id: DEFAULT_TEAM_ID, name: 'My team', createdAt: 0, updatedAt: 1 });
}

export async function addTeam(name: string): Promise<string> {
  const now = Date.now();
  const team: Team = { id: newId(), name, createdAt: now, updatedAt: now };
  await db.teams.add(team);
  pushRecord('teams', team);
  await setActiveTeam(team.id);
  return team.id;
}

export async function renameTeam(id: string, name: string): Promise<void> {
  let saved: Team | undefined;
  await db.transaction('rw', db.teams, async () => {
    const t = await db.teams.get(id);
    if (!t) return;
    saved = { ...t, name, updatedAt: stamp(t.updatedAt) };
    await db.teams.put(saved);
  });
  if (saved) pushRecord('teams', saved);
}

/** Delete a team along with its players and matches, everywhere. */
export async function deleteTeam(id: string): Promise<void> {
  let players: Player[] = [];
  let matches: Match[] = [];
  let team: Team | undefined;
  await db.transaction('rw', [db.players, db.matches, db.teams, db.meta], async () => {
    if ((await db.meta.get('activeTeamId'))?.value === id) await db.meta.delete('activeTeamId');
    team = await db.teams.get(id);
    players = await db.players.filter((p) => teamOf(p) === id).toArray();
    matches = await db.matches.filter((m) => teamOf(m) === id).toArray();
    await db.players.bulkDelete(players.map((p) => p.id));
    await db.matches.bulkDelete(matches.map((m) => m.id));
    await db.teams.delete(id);
  });
  players.forEach((p) => pushDeletion('players', p.id, stamp(p.updatedAt)));
  matches.forEach((m) => pushDeletion('matches', m.id, stamp(m.updatedAt)));
  pushDeletion('teams', id, stamp(team?.updatedAt));
}

export async function setActiveTeam(id: string): Promise<void> {
  await db.meta.put({ key: 'activeTeamId', value: id });
}
