export interface Player {
  id: string;
  name: string;
  number?: number;
  /** Archived players are hidden from new matches but keep their history. */
  archived?: boolean;
  createdAt: number;
}

/**
 * Everything that happens in a match is stored as an append-only event log.
 * Minutes, score and starts are always derived from it, so undo is just
 * "drop the last event" and a locked phone can't make the clock drift.
 * `t` is a wall-clock timestamp (ms since epoch).
 */
export type MatchEvent =
  | { type: 'START'; playerId: string; t: number }
  | { type: 'PERIOD_START'; t: number }
  | { type: 'PERIOD_END'; t: number }
  | { type: 'SUB'; onId: string; offId: string; t: number }
  | { type: 'ON'; playerId: string; t: number }
  | { type: 'OFF'; playerId: string; t: number }
  | { type: 'GOAL'; playerId: string; t: number }
  | { type: 'OPP_GOAL'; t: number };

export interface Match {
  id: string;
  /** ISO date, yyyy-mm-dd */
  date: string;
  opponent: string;
  /** Number of players on the pitch at once (e.g. 7 for 7v7). */
  onField: number;
  presentIds: string[];
  /** Starting lineup chosen before kick-off. */
  lineupIds: string[];
  keeperId?: string;
  events: MatchEvent[];
  finished: boolean;
  createdAt: number;
}
