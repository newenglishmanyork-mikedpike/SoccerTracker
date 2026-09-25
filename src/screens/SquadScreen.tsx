import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, newId } from '../db';
import type { Player } from '../types';

export default function SquadScreen() {
  const players = useLiveQuery(() => db.players.orderBy('createdAt').toArray(), []) ?? [];
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = players.filter((p) => !p.archived);
  const archived = players.filter((p) => p.archived);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const n = parseInt(number, 10);
    setName('');
    setNumber('');
    await db.players.add({ id: newId(), name: trimmed, number: isNaN(n) ? undefined : n, createdAt: Date.now() });
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Squad</h1>
        <span className="muted">{active.length} players</span>
      </header>

      <form className="card add-player" onSubmit={add}>
        <input
          className="input grow"
          placeholder="Player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCapitalize="words"
        />
        <input
          className="input num"
          placeholder="#"
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
        />
        <button className="btn primary" type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>

      {active.length === 0 && (
        <p className="empty">Add every player in your squad once. You'll pick who's present for each match.</p>
      )}

      <ul className="list">
        {active.map((p) =>
          editing === p.id ? (
            <EditRow key={p.id} player={p} onDone={() => setEditing(null)} />
          ) : (
            <li key={p.id} className="row">
              <span className="shirt">{p.number ?? ''}</span>
              <span className="grow name">{p.name}</span>
              <button className="btn small ghost" onClick={() => setEditing(p.id)}>
                Edit
              </button>
              <button className="btn small ghost" onClick={() => db.players.update(p.id, { archived: true })}>
                Remove
              </button>
            </li>
          ),
        )}
      </ul>

      {archived.length > 0 && (
        <>
          <button className="btn link" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} removed players ({archived.length})
          </button>
          {showArchived && (
            <ul className="list">
              {archived.map((p) => (
                <li key={p.id} className="row dim">
                  <span className="shirt">{p.number ?? ''}</span>
                  <span className="grow name">{p.name}</span>
                  <button className="btn small ghost" onClick={() => db.players.update(p.id, { archived: false })}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function EditRow({ player, onDone }: { player: Player; onDone: () => void }) {
  const [name, setName] = useState(player.name);
  const [number, setNumber] = useState(player.number?.toString() ?? '');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const n = parseInt(number, 10);
    await db.players.update(player.id, { name: name.trim(), number: isNaN(n) ? undefined : n });
    onDone();
  };
  return (
    <li className="row">
      <form className="add-player grow" onSubmit={save}>
        <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <input
          className="input num"
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
        />
        <button className="btn small primary" type="submit">
          Save
        </button>
        <button className="btn small ghost" type="button" onClick={onDone}>
          Cancel
        </button>
      </form>
    </li>
  );
}
