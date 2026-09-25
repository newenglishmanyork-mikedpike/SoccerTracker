import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { db, exportBackup, importBackup } from '../db';
import { download, today } from '../lib/format';
import { computeSeasonStats, seasonCsv } from '../lib/seasonStats';

type SortKey = 'name' | 'games' | 'starts' | 'ms' | 'avg' | 'goals';

export default function StatsScreen() {
  const players = useLiveQuery(() => db.players.orderBy('createdAt').toArray(), []) ?? [];
  const matches = useLiveQuery(() => db.matches.toArray(), []) ?? [];
  const [sort, setSort] = useState<SortKey>('ms');
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => computeSeasonStats(matches, Date.now()), [matches]);
  const played = matches.filter((m) => m.events.some((e) => e.type === 'PERIOD_START')).length;

  const rows = players
    .filter((p) => !p.archived || stats[p.id])
    .map((p) => {
      const r = stats[p.id] ?? { games: 0, starts: 0, ms: 0, goals: 0 };
      return { p, ...r, avg: r.games ? r.ms / r.games : 0 };
    });

  // Flag anyone well below the team average (per game attended / starts per game attended).
  const withGames = rows.filter((r) => r.games > 0);
  const teamAvg = withGames.reduce((a, r) => a + r.avg, 0) / (withGames.length || 1);
  const teamStartRate = withGames.reduce((a, r) => a + r.starts / r.games, 0) / (withGames.length || 1);

  rows.sort((a, b) =>
    sort === 'name' ? a.p.name.localeCompare(b.p.name) : (b[sort] as number) - (a[sort] as number),
  );

  const header = (key: SortKey, label: string) => (
    <th className={sort === key ? 'sorted' : ''} onClick={() => setSort(key)}>
      {label}
    </th>
  );

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Restoring a backup replaces all players and matches on this device. Continue?')) return;
    try {
      await importBackup(JSON.parse(await file.text()));
      alert('Backup restored.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Season</h1>
        <span className="muted">{played} matches played</span>
      </header>

      {rows.length === 0 ? (
        <p className="empty">Stats appear here once you've played a match.</p>
      ) : (
        <>
          <p className="hint">
            Tap a column to sort. <span className="low-text">Amber</span> = well below the team average for minutes
            or starts.
          </p>
          <div className="table-wrap">
            <table className="stats">
              <thead>
                <tr>
                  {header('name', 'Player')}
                  {header('games', 'GP')}
                  {header('starts', 'Starts')}
                  {header('ms', 'Min')}
                  {header('avg', 'Avg')}
                  {header('goals', 'Goals')}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lowMins = r.games > 0 && r.avg < teamAvg * 0.8;
                  const lowStarts = r.games > 1 && r.starts / r.games < teamStartRate * 0.6;
                  return (
                    <tr key={r.p.id}>
                      <td>{r.p.name}</td>
                      <td>{r.games}</td>
                      <td className={lowStarts ? 'low-text' : ''}>{r.starts}</td>
                      <td>{Math.round(r.ms / 60000)}</td>
                      <td className={lowMins ? 'low-text' : ''}>{Math.round(r.avg / 60000)}</td>
                      <td>{r.goals || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="section-title">Your data</h2>
      <p className="hint">
        Everything is stored on this device only. Download a backup regularly so you don't lose your season.
      </p>
      <div className="actions wrap">
        <button
          className="btn"
          onClick={async () =>
            download(`soccer-backup-${today()}.json`, JSON.stringify(await exportBackup(), null, 2), 'application/json')
          }
        >
          Download backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Restore backup
        </button>
        <button
          className="btn"
          disabled={rows.length === 0}
          onClick={() => download(`season-stats-${today()}.csv`, seasonCsv(players, stats), 'text/csv')}
        >
          Export CSV
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
      </div>
    </div>
  );
}
