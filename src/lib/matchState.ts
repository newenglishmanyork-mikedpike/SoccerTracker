import type { Match, MatchEvent } from '../types';

export interface MatchState {
  /** Kick-off has happened (there is at least one PERIOD_START). */
  started: boolean;
  /** The game clock is currently running. */
  running: boolean;
  /** Number of periods started so far (1 = first half in progress/done). */
  period: number;
  /** Total running game time. */
  clockMs: number;
  /** Running time in the current (or most recent) period. */
  periodClockMs: number;
  /** Players currently on the pitch, in a stable order. */
  onPitch: string[];
  starters: string[];
  /** Game time each player has spent on the pitch. */
  playerMs: Record<string, number>;
  goals: Record<string, number>;
  score: { us: number; them: number };
}

/**
 * Replay the event log to get the state of the match at `now`.
 * Time only accumulates while a period is running, so half-time and
 * subs made during a stoppage don't count toward anyone's minutes.
 */
export function computeMatchState(events: MatchEvent[], now: number): MatchState {
  const s: MatchState = {
    started: false,
    running: false,
    period: 0,
    clockMs: 0,
    periodClockMs: 0,
    onPitch: [],
    starters: [],
    playerMs: {},
    goals: {},
    score: { us: 0, them: 0 },
  };
  let lastT = 0;

  const advance = (t: number) => {
    if (s.running) {
      const dt = Math.max(0, t - lastT);
      s.clockMs += dt;
      s.periodClockMs += dt;
      for (const p of s.onPitch) s.playerMs[p] = (s.playerMs[p] ?? 0) + dt;
    }
    lastT = t;
  };
  const addToPitch = (id: string) => {
    if (!s.onPitch.includes(id)) s.onPitch.push(id);
  };

  for (const e of events) {
    advance(e.t);
    switch (e.type) {
      case 'START':
        addToPitch(e.playerId);
        if (!s.starters.includes(e.playerId)) s.starters.push(e.playerId);
        break;
      case 'PERIOD_START':
        s.started = true;
        s.running = true;
        s.period += 1;
        s.periodClockMs = 0;
        break;
      case 'PERIOD_END':
        s.running = false;
        break;
      case 'SUB': {
        const i = s.onPitch.indexOf(e.offId);
        if (s.onPitch.includes(e.onId)) break;
        if (i >= 0) s.onPitch[i] = e.onId; // keep the incoming player in the same slot
        else addToPitch(e.onId);
        break;
      }
      case 'ON':
        addToPitch(e.playerId);
        break;
      case 'OFF':
        s.onPitch = s.onPitch.filter((p) => p !== e.playerId);
        break;
      case 'GOAL':
        s.goals[e.playerId] = (s.goals[e.playerId] ?? 0) + 1;
        s.score.us += 1;
        break;
      case 'OPP_GOAL':
        s.score.them += 1;
        break;
    }
  }
  if (s.running) advance(now);
  return s;
}

/** Remove the last event. Undoing kick-off returns the match to lineup selection. */
export function undoLast(m: Match): Match {
  const events = m.events.slice(0, -1);
  const removed = m.events[m.events.length - 1];
  if (removed?.type === 'PERIOD_START' && !events.some((e) => e.type === 'PERIOD_START')) {
    return { ...m, events: events.filter((e) => e.type !== 'START') };
  }
  return { ...m, events };
}

/** Fair share of game time per player so far, if everyone present played equally. */
export function fairShareMs(onField: number, clockMs: number, presentCount: number): number {
  if (presentCount <= 0) return 0;
  return (Math.min(onField, presentCount) * clockMs) / presentCount;
}

export interface SeasonContext {
  /** Minutes (ms) played in other matches this season. */
  seasonMs: Record<string, number>;
  starts: Record<string, number>;
}

/**
 * Bench players ordered by who should come on next: fewest minutes this
 * game, then fewest season minutes, then fewest starts.
 */
export function suggestOn(bench: string[], playerMs: Record<string, number>, ctx: SeasonContext): string[] {
  return [...bench].sort(
    (a, b) =>
      (playerMs[a] ?? 0) - (playerMs[b] ?? 0) ||
      (ctx.seasonMs[a] ?? 0) - (ctx.seasonMs[b] ?? 0) ||
      (ctx.starts[a] ?? 0) - (ctx.starts[b] ?? 0),
  );
}

/**
 * On-pitch players ordered by who should come off next: most minutes this
 * game first.
 */
export function suggestOff(onPitch: string[], playerMs: Record<string, number>, ctx: SeasonContext): string[] {
  return [...onPitch].sort(
    (a, b) =>
      (playerMs[b] ?? 0) - (playerMs[a] ?? 0) ||
      (ctx.seasonMs[b] ?? 0) - (ctx.seasonMs[a] ?? 0),
  );
}

export function describeEvent(e: MatchEvent, name: (id: string) => string): string {
  switch (e.type) {
    case 'START':
      return `${name(e.playerId)} starts`;
    case 'PERIOD_START':
      return 'Period start';
    case 'PERIOD_END':
      return 'Period end';
    case 'SUB':
      return `${name(e.onId)} on for ${name(e.offId)}`;
    case 'ON':
      return `${name(e.playerId)} on`;
    case 'OFF':
      return `${name(e.playerId)} off`;
    case 'GOAL':
      return `Goal – ${name(e.playerId)}`;
    case 'OPP_GOAL':
      return 'Opponent goal';
  }
}
