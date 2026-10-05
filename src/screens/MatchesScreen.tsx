import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { addMatch, deleteMatch } from '../data';
import { db } from '../db';
import { prettyDate, today } from '../lib/format';
import { computeMatchState } from '../lib/matchState';
import { teamOf } from '../teams';

export default function MatchesScreen({ teamId, onOpen }: { teamId: string; onOpen: (id: string) => void }) {
  const matches =
    useLiveQuery(
      () =>
        db.matches
          .orderBy('createdAt')
          .reverse()
          .filter((m) => teamOf(m) === teamId)
          .toArray(),
      [teamId],
    ) ?? [];
  const inTeam = (p: { teamId?: string; archived?: boolean }) => !p.archived && teamOf(p) === teamId;
  const playerCount = useLiveQuery(() => db.players.filter(inTeam).count(), [teamId]) ?? 0;
  const [creating, setCreating] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(today());
  const [onField, setOnField] = useState<number | null>(null);

  const defaultOnField = matches[0]?.onField ?? 7;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = await addMatch({
      teamId,
      date,
      opponent: opponent.trim() || 'Opponent',
      onField: onField ?? defaultOnField,
      // Everyone starts absent; the coach taps players in as they arrive.
      presentIds: [],
      lineupIds: [],
      events: [],
      finished: false,
    });
    setCreating(false);
    setOpponent('');
    onOpen(id);
  };

  const remove = async (id: string, label: string) => {
    if (confirm(`Delete the match vs ${label}? Its minutes and goals will be removed from season stats.`)) {
      await deleteMatch(id);
    }
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Matches</h1>
        {!creating && (
          <button className="btn primary" onClick={() => setCreating(true)} disabled={playerCount === 0}>
            + New match
          </button>
        )}
      </header>

      {playerCount === 0 && <p className="empty">Start by adding your players on the Squad tab.</p>}

      {creating && (
        <form className="card form" onSubmit={create}>
          <label>
            Opponent
            <input className="input" value={opponent} onChange={(e) => setOpponent(e.target.value)} autoFocus />
          </label>
          <label>
            Date
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Players on the pitch
            <Stepper value={onField ?? defaultOnField} onChange={setOnField} min={2} max={11} />
          </label>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              Create
            </button>
          </div>
        </form>
      )}

      <ul className="list">
        {matches.map((m) => {
          const s = computeMatchState(m.events, Date.now());
          const status = m.finished ? 'Full time' : s.started ? (s.running ? 'Live' : 'In progress') : 'Not started';
          return (
            <li key={m.id} className="row match-row" onClick={() => onOpen(m.id)}>
              <div className="grow">
                <div className="name">vs {m.opponent}</div>
                <div className="muted small">
                  {prettyDate(m.date)} · {m.onField}v{m.onField}
                </div>
              </div>
              {s.started && (
                <span className="score-pill">
                  {s.score.us}–{s.score.them}
                </span>
              )}
              <span className={`status ${s.running ? 'live' : ''}`}>{status}</span>
              <button
                className="btn small ghost"
                aria-label="Delete match"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(m.id, m.opponent);
                }}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A −/+ number control. `onChange` gets the next value; use `onStep` instead
 * when the value is saved asynchronously, so quick repeated taps each count
 * (the caller applies the ±1 to the latest saved value, not the one on screen).
 */
export function Stepper({
  value,
  onChange,
  onStep,
  min,
  max,
}: {
  value: number;
  onChange?: (n: number) => void;
  onStep?: (delta: 1 | -1) => void;
  min: number;
  max: number;
}) {
  const step = (d: 1 | -1) => (onStep ? onStep(d) : onChange?.(Math.min(max, Math.max(min, value + d))));
  return (
    <div className="stepper">
      <button type="button" className="btn small" onClick={() => step(-1)} disabled={value <= min}>
        −
      </button>
      <span>{value}</span>
      <button type="button" className="btn small" onClick={() => step(1)} disabled={value >= max}>
        +
      </button>
    </div>
  );
}
