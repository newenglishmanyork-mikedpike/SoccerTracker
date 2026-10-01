import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Team } from './types';

/**
 * Records created before teams existed have no teamId; they belong to this
 * team. The id is fixed (not random) so every device agrees on it.
 */
export const DEFAULT_TEAM_ID = 'default';

export function teamOf(rec: { teamId?: string }): string {
  return rec.teamId ?? DEFAULT_TEAM_ID;
}

export interface TeamsState {
  teams: Team[];
  active: Team | undefined;
}

/** All teams plus the one selected on this device (falls back to the first). */
export function useTeams(): TeamsState | undefined {
  const teams = useLiveQuery(() => db.teams.orderBy('createdAt').toArray(), []);
  const activeId = useLiveQuery(() => db.meta.get('activeTeamId').then((m) => m?.value ?? null), []);
  if (teams === undefined || activeId === undefined) return undefined;
  return { teams, active: teams.find((t) => t.id === activeId) ?? teams[0] };
}
