import type { Match, Player } from '../types';
import { computeMatchState, type SeasonContext } from './matchState';

export interface PlayerSeason {
  playerId: string;
  games: number;
  starts: number;
  ms: number;
  goals: number;
}

/** Aggregate every kicked-off match into per-player season totals. */
export function computeSeasonStats(matches: Match[], now: number): Record<string, PlayerSeason> {
  const out: Record<string, PlayerSeason> = {};
  const row = (id: string) => (out[id] ??= { playerId: id, games: 0, starts: 0, ms: 0, goals: 0 });

  for (const m of matches) {
    const s = computeMatchState(m.events, now);
    if (!s.started) continue;
    const involved = new Set([...m.presentIds, ...Object.keys(s.playerMs)]);
    for (const id of involved) {
      const r = row(id);
      r.games += 1;
      r.ms += s.playerMs[id] ?? 0;
      r.goals += s.goals[id] ?? 0;
    }
    for (const id of s.starters) row(id).starts += 1;
  }
  return out;
}

export function seasonContext(matches: Match[], excludeMatchId: string | undefined, now: number): SeasonContext {
  const stats = computeSeasonStats(
    matches.filter((m) => m.id !== excludeMatchId),
    now,
  );
  const ctx: SeasonContext = { seasonMs: {}, starts: {} };
  for (const r of Object.values(stats)) {
    ctx.seasonMs[r.playerId] = r.ms;
    ctx.starts[r.playerId] = r.starts;
  }
  return ctx;
}

export function seasonCsv(players: Player[], stats: Record<string, PlayerSeason>): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ['Player,Number,Games,Starts,Minutes,Avg minutes,Goals'];
  for (const p of players) {
    const r = stats[p.id];
    if (!r) continue;
    const mins = Math.round(r.ms / 60000);
    const avg = r.games ? Math.round(r.ms / 60000 / r.games) : 0;
    lines.push([esc(p.name), p.number ?? '', r.games, r.starts, mins, avg, r.goals].join(','));
  }
  return lines.join('\n');
}
