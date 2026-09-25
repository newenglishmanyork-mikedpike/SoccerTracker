import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, newId } from '../db';
import { prettyDate, today } from '../lib/format';
import { computeMatchState } from '../lib/matchState';

export default function MatchesScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const matches = useLiveQuery(() => db.matches.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const playerCount = useLiveQuery(() => db.players.filter((p) => !p.archived).count(), []) ?? 0;
  const [creating, setCreating] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(today());
  const [onField, setOnField] = useState<number | null>(null);

  const defaultOnField = matches[0]?.onField ?? 7;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const players = await db.players.filter((p) => !p.archived).toArray();
    const id = newId();
    await db.matches.add({
      id,
      date,
      opponent: opponent.trim() || 'Opponent',
      onField: onField ?? defaultOnField,
      presentIds: players.map((p) => p.id),
      lineupIds: [],
      events: [],
      finished: false,
      createdAt: Date.now(),
    });
    setCreating(false);
    setOpponent('');
    onOpen(id);
  };

  const remove = async (id: string, label: string) => {
    if (confirm(`Delete the match vs ${label}? Its minutes and goals will be removed from season stats.`)) {
      await db.matches.delete(id);
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
            <Stepper value={onField ?? defaultOnField} onChange={setOnField} min={3} max={11} />
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

export function Stepper({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="stepper">
      <button type="button" className="btn small" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span>{value}</span>
      <button type="button" className="btn small" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}
