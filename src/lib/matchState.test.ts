import { describe, expect, it } from 'vitest';
import type { Match, MatchEvent } from '../types';
import { computeMatchState, fairShareMs, suggestOff, suggestOn, undoLast } from './matchState';
import { computeSeasonStats } from './seasonStats';

const MIN = 60_000;
const at = (m: number) => 1_000_000 + m * MIN;

function match(events: MatchEvent[], extra: Partial<Match> = {}): Match {
  return {
    id: 'm1', date: '2026-09-01', opponent: 'Rovers', onField: 2,
    presentIds: ['a', 'b', 'c'], lineupIds: ['a', 'b'], events,
    finished: false, createdAt: 0, ...extra,
  };
}

const kickoff: MatchEvent[] = [
  { type: 'START', playerId: 'a', t: at(0) },
  { type: 'START', playerId: 'b', t: at(0) },
  { type: 'PERIOD_START', t: at(0) },
];

describe('computeMatchState', () => {
  it('is not started with no events', () => {
    const s = computeMatchState([], at(5));
    expect(s.started).toBe(false);
    expect(s.clockMs).toBe(0);
  });

  it('accumulates minutes for players on the pitch while the clock runs', () => {
    const s = computeMatchState(kickoff, at(10));
    expect(s.running).toBe(true);
    expect(s.clockMs).toBe(10 * MIN);
    expect(s.playerMs).toEqual({ a: 10 * MIN, b: 10 * MIN });
    expect(s.starters).toEqual(['a', 'b']);
  });

  it('handles a sub: 0-12 and 20-25 split correctly', () => {
    const events: MatchEvent[] = [
      ...kickoff,
      { type: 'SUB', onId: 'c', offId: 'a', t: at(12) },
      { type: 'SUB', onId: 'a', offId: 'c', t: at(20) },
    ];
    const s = computeMatchState(events, at(25));
    expect(s.playerMs.a).toBe(17 * MIN);
    expect(s.playerMs.c).toBe(8 * MIN);
    expect(s.playerMs.b).toBe(25 * MIN);
    expect(s.onPitch).toEqual(['a', 'b']);
  });

  it('does not count half-time', () => {
    const events: MatchEvent[] = [
      ...kickoff,
      { type: 'PERIOD_END', t: at(25) },
      { type: 'SUB', onId: 'c', offId: 'a', t: at(30) }, // half-time sub
      { type: 'PERIOD_START', t: at(35) },
    ];
    const s = computeMatchState(events, at(45));
    expect(s.period).toBe(2);
    expect(s.clockMs).toBe(35 * MIN);
    expect(s.periodClockMs).toBe(10 * MIN);
    expect(s.playerMs).toEqual({ a: 25 * MIN, b: 35 * MIN, c: 10 * MIN });
  });

  it('stops the clock after a period ends regardless of now', () => {
    const s = computeMatchState([...kickoff, { type: 'PERIOD_END', t: at(20) }], at(90));
    expect(s.running).toBe(false);
    expect(s.clockMs).toBe(20 * MIN);
  });

  it('tracks goals, score, and ON/OFF without replacement', () => {
    const events: MatchEvent[] = [
      ...kickoff,
      { type: 'GOAL', playerId: 'a', t: at(3) },
      { type: 'OPP_GOAL', t: at(4) },
      { type: 'GOAL', playerId: 'a', t: at(5) },
      { type: 'OFF', playerId: 'b', t: at(6) },
      { type: 'ON', playerId: 'c', t: at(8) },
    ];
    const s = computeMatchState(events, at(10));
    expect(s.score).toEqual({ us: 2, them: 1 });
    expect(s.goals).toEqual({ a: 2 });
    expect(s.playerMs.b).toBe(6 * MIN);
    expect(s.playerMs.c).toBe(2 * MIN);
    expect(s.onPitch).toEqual(['a', 'c']);
  });
});

describe('undoLast', () => {
  it('removes the last event', () => {
    const m = undoLast(match([...kickoff, { type: 'GOAL', playerId: 'a', t: at(1) }]));
    expect(m.events).toEqual(kickoff);
  });

  it('undoing kick-off removes START events too', () => {
    expect(undoLast(match(kickoff)).events).toEqual([]);
  });
});

describe('suggestions', () => {
  const ctx = { seasonMs: { c: 100 * MIN, d: 50 * MIN }, starts: {} };

  it('suggests the bench player with the fewest minutes, then fewest season minutes', () => {
    expect(suggestOn(['c', 'd', 'e'], { c: 0, d: 0, e: 5 * MIN }, ctx)).toEqual(['d', 'c', 'e']);
  });

  it('suggests the outfield player with the most minutes to come off, keeper last', () => {
    const ms = { a: 20 * MIN, b: 10 * MIN, k: 30 * MIN };
    expect(suggestOff(['a', 'b', 'k'], ms, ctx, 'k')).toEqual(['a', 'b', 'k']);
  });

  it('computes fair share', () => {
    expect(fairShareMs(7, 40 * MIN, 10)).toBe(28 * MIN);
    expect(fairShareMs(7, 40 * MIN, 5)).toBe(40 * MIN); // fewer players than spots
  });
});

describe('computeSeasonStats', () => {
  it('counts games, starts, minutes, goals and skips unplayed matches', () => {
    const m1 = match([...kickoff, { type: 'GOAL', playerId: 'b', t: at(1) }, { type: 'PERIOD_END', t: at(30) }]);
    const m2 = match([], { id: 'm2' });
    const stats = computeSeasonStats([m1, m2], at(100));
    expect(stats.a).toEqual({ playerId: 'a', games: 1, starts: 1, ms: 30 * MIN, goals: 0 });
    expect(stats.b.goals).toBe(1);
    expect(stats.c).toEqual({ playerId: 'c', games: 1, starts: 0, ms: 0, goals: 0 });
  });
});
