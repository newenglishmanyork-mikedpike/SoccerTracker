import { useState } from 'react';
import { addTeam, deleteTeam, renameTeam, setActiveTeam } from '../data';
import type { TeamsState } from '../teams';
import type { Team } from '../types';

export default function TeamBar({ state }: { state: TeamsState }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="teambar">
        <button className="team-switch" onClick={() => setOpen(true)} aria-label="Switch team">
          <span className="team-name">{state.active?.name ?? 'My team'}</span>
          <span className="caret">▾</span>
        </button>
      </div>
      {open && <TeamSheet state={state} onClose={() => setOpen(false)} />}
    </>
  );
}

function TeamSheet({ state, onClose }: { state: TeamsState; onClose: () => void }) {
  const { teams, active } = state;

  const create = async () => {
    const name = prompt('Name of the new team (e.g. U10 Tigers)')?.trim();
    if (!name) return;
    await addTeam(name);
    onClose();
  };

  const rename = async (t: Team) => {
    const name = prompt('Rename team', t.name)?.trim();
    if (name && name !== t.name) await renameTeam(t.id, name);
  };

  const remove = async (t: Team) => {
    const ok = confirm(
      `Delete “${t.name}”? Its players, matches and season stats will be deleted on all your devices. This can’t be undone.`,
    );
    if (ok) await deleteTeam(t.id);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Your teams</h2>
        <ul className="list">
          {teams.map((t) => (
            <li
              key={t.id}
              className={`row tappable ${t.id === active?.id ? 'selected' : ''}`}
              onClick={async () => {
                await setActiveTeam(t.id);
                onClose();
              }}
            >
              <span className="check">{t.id === active?.id ? '✓' : ''}</span>
              <span className="grow name">{t.name}</span>
              <button
                className="btn small ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  rename(t);
                }}
              >
                Rename
              </button>
              {teams.length > 1 && (
                <button
                  className="btn small ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(t);
                  }}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={create}>
            + New team
          </button>
        </div>
      </div>
    </div>
  );
}
