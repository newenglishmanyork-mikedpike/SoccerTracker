import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db, updateMatch } from '../db';
import { clock, mins, prettyDate } from '../lib/format';
import {
  computeMatchState,
  describeEvent,
  fairShareMs,
  suggestOff,
  suggestOn,
  undoLast,
  type MatchState,
} from '../lib/matchState';
import { seasonContext } from '../lib/seasonStats';
import { useNow, useWakeLock } from '../hooks';
import type { Match, MatchEvent, Player } from '../types';
import { Stepper } from './MatchesScreen';

type Sheet = { mode: 'off'; playerId: string } | { mode: 'on'; playerId: string } | null;

export default function MatchScreen({ matchId, onBack }: { matchId: string; onBack: () => void }) {
  const match = useLiveQuery(() => db.matches.get(matchId).then((m) => m ?? null), [matchId]);
  const players = useLiveQuery(() => db.players.orderBy('createdAt').toArray(), []);
  const allMatches = useLiveQuery(() => db.matches.toArray(), []);

  // Match was deleted (or a stale id was remembered): go back to the list.
  useEffect(() => {
    if (match === null) onBack();
  }, [match, onBack]);

  if (!match || !players || !allMatches) return <div className="screen muted">Loading…</div>;

  return <MatchView match={match} players={players} allMatches={allMatches} onBack={onBack} />;
}

function MatchView({
  match,
  players,
  allMatches,
  onBack,
}: {
  match: Match;
  players: Player[];
  allMatches: Match[];
  onBack: () => void;
}) {
  const running = computeMatchState(match.events, Date.now()).running;
  const now = useNow(running);
  const s = computeMatchState(match.events, now);
  useWakeLock(s.started && !match.finished);
  const [sheet, setSheet] = useState<Sheet>(null);

  const ctx = useMemo(() => seasonContext(allMatches, match.id, Date.now()), [allMatches, match.id]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const name = (id: string) => byId.get(id)?.name ?? 'Unknown';

  // Keep lists in squad order so players are easy to find.
  const present = players.filter((p) => match.presentIds.includes(p.id)).map((p) => p.id);
  const absent = players.filter((p) => !p.archived && !match.presentIds.includes(p.id)).map((p) => p.id);

  const update = (fn: (m: Match) => Match | void) => updateMatch(match.id, fn);
  const push = (...events: MatchEvent[]) => update((m) => ({ ...m, events: [...m.events, ...events] }));

  const setPresent = (id: string, isPresent: boolean) =>
    update((m) => ({
      ...m,
      presentIds: isPresent ? [...m.presentIds.filter((p) => p !== id), id] : m.presentIds.filter((p) => p !== id),
      lineupIds: isPresent ? m.lineupIds : m.lineupIds.filter((p) => p !== id),
      keeperId: !isPresent && m.keeperId === id ? undefined : m.keeperId,
    }));

  const toggleKeeper = (id: string) => update((m) => ({ ...m, keeperId: m.keeperId === id ? undefined : id }));

  const lastEvent = match.events[match.events.length - 1];

  return (
    <div className="app">
      <header className="match-header">
        <div className="match-title">
          <button className="btn ghost small" onClick={onBack}>
            ‹ Matches
          </button>
          <div className="grow center">
            <div className="name">vs {match.opponent}</div>
            <div className="muted small">
              {prettyDate(match.date)} · {match.onField}v{match.onField}
            </div>
          </div>
          <span className="spacer" />
        </div>
        <Scoreboard match={match} s={s} onOppGoal={() => push({ type: 'OPP_GOAL', t: Date.now() })} />
        {!match.finished && (
          <div className="controls">
            {!s.started && (
              <button
                className="btn primary big"
                disabled={match.lineupIds.length === 0}
                onClick={() => {
                  const t = Date.now();
                  push(
                    ...match.lineupIds.map((playerId): MatchEvent => ({ type: 'START', playerId, t })),
                    { type: 'PERIOD_START', t },
                  );
                }}
              >
                Kick off
              </button>
            )}
            {s.started && s.running && (
              <button className="btn warn big" onClick={() => push({ type: 'PERIOD_END', t: Date.now() })}>
                End period {s.period}
              </button>
            )}
            {s.started && !s.running && (
              <>
                <button className="btn primary big" onClick={() => push({ type: 'PERIOD_START', t: Date.now() })}>
                  Start period {s.period + 1}
                </button>
                <button
                  className="btn big"
                  onClick={() => confirm('Finish the match?') && update((m) => ({ ...m, finished: true }))}
                >
                  Full time
                </button>
              </>
            )}
            {lastEvent && s.started && (
              <button
                className="btn ghost undo"
                onClick={() => update(undoLast)}
                title="Undo the last action"
              >
                ↶ Undo: {describeEvent(lastEvent, name)}
              </button>
            )}
          </div>
        )}
      </header>

      <main className="content">
        {match.finished ? (
          <Summary match={match} s={s} name={name} byId={byId} onReopen={() => update((m) => ({ ...m, finished: false }))} />
        ) : !s.started ? (
          <Setup
            match={match}
            present={present}
            absent={absent}
            byId={byId}
            ctxStarts={ctx.starts}
            ctxMs={ctx.seasonMs}
            onFieldChange={(n) =>
              update((m) => ({ ...m, onField: n, lineupIds: m.lineupIds.slice(0, n) }))
            }
            toggleLineup={(id) =>
              update((m) => {
                if (m.lineupIds.includes(id)) return { ...m, lineupIds: m.lineupIds.filter((p) => p !== id) };
                if (m.lineupIds.length >= m.onField) return m;
                return { ...m, lineupIds: [...m.lineupIds, id] };
              })
            }
            setLineup={(ids) => update((m) => ({ ...m, lineupIds: ids }))}
            setPresent={setPresent}
            toggleKeeper={toggleKeeper}
          />
        ) : (
          <Live
            match={match}
            s={s}
            present={present}
            absent={absent}
            byId={byId}
            ctx={ctx}
            onGoal={(id) => push({ type: 'GOAL', playerId: id, t: Date.now() })}
            onSubTap={(id) => setSheet({ mode: 'off', playerId: id })}
            onBenchTap={(id) => {
              if (s.onPitch.length < match.onField) push({ type: 'ON', playerId: id, t: Date.now() });
              else setSheet({ mode: 'on', playerId: id });
            }}
            setPresent={setPresent}
            toggleKeeper={toggleKeeper}
          />
        )}
      </main>

      {sheet && (
        <SubSheet
          sheet={sheet}
          s={s}
          match={match}
          present={present}
          byId={byId}
          ctx={ctx}
          onClose={() => setSheet(null)}
          onSub={(onId, offId) => {
            push({ type: 'SUB', onId, offId, t: Date.now() });
            setSheet(null);
          }}
          onOff={(id) => {
            push({ type: 'OFF', playerId: id, t: Date.now() });
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}

function Scoreboard({ match, s, onOppGoal }: { match: Match; s: MatchState; onOppGoal: () => void }) {
  const periodLabel = match.finished
    ? 'Full time'
    : !s.started
      ? 'Not started'
      : s.running
        ? `Period ${s.period} · ${clock(s.periodClockMs)}`
        : `Break after period ${s.period}`;
  return (
    <div className="scoreboard">
      <div className="team">
        <span className="team-label">Us</span>
        <span className="goals">{s.score.us}</span>
      </div>
      <div className="clock-block">
        <div className={`clock ${s.running ? 'running' : ''}`}>{clock(s.clockMs)}</div>
        <div className="period">{periodLabel}</div>
      </div>
      <div className="team">
        <span className="team-label">{match.opponent}</span>
        <span className="goals">{s.score.them}</span>
        {s.started && !match.finished && (
          <button className="btn small ghost" onClick={onOppGoal}>
            + goal
          </button>
        )}
      </div>
    </div>
  );
}

function Shirt({ p }: { p?: Player }) {
  return <span className="shirt">{p?.number ?? ''}</span>;
}

function Setup({
  match,
  present,
  absent,
  byId,
  ctxStarts,
  ctxMs,
  onFieldChange,
  toggleLineup,
  setLineup,
  setPresent,
  toggleKeeper,
}: {
  match: Match;
  present: string[];
  absent: string[];
  byId: Map<string, Player>;
  ctxStarts: Record<string, number>;
  ctxMs: Record<string, number>;
  onFieldChange: (n: number) => void;
  toggleLineup: (id: string) => void;
  setLineup: (ids: string[]) => void;
  setPresent: (id: string, present: boolean) => void;
  toggleKeeper: (id: string) => void;
}) {
  const suggestLineup = () => {
    // Fewest starts first, then fewest season minutes. Keep the chosen keeper in.
    const keeper = match.keeperId && present.includes(match.keeperId) ? [match.keeperId] : [];
    const rest = present
      .filter((id) => !keeper.includes(id))
      .sort((a, b) => (ctxStarts[a] ?? 0) - (ctxStarts[b] ?? 0) || (ctxMs[a] ?? 0) - (ctxMs[b] ?? 0));
    setLineup([...keeper, ...rest].slice(0, match.onField));
  };

  return (
    <div className="screen">
      <div className="card setup-bar">
        <span className="grow">Players on the pitch</span>
        <Stepper value={match.onField} onChange={onFieldChange} min={3} max={11} />
      </div>

      <div className="section-head">
        <h2>
          Starting lineup{' '}
          <span className={match.lineupIds.length === match.onField ? 'ok' : 'muted'}>
            {match.lineupIds.length}/{match.onField}
          </span>
        </h2>
        <button className="btn small" onClick={suggestLineup} disabled={present.length === 0}>
          Suggest
        </button>
      </div>
      <p className="hint">Tap players to pick the starters. “Suggest” picks those with the fewest starts this season.</p>

      <ul className="list">
        {present.map((id) => {
          const p = byId.get(id);
          const selected = match.lineupIds.includes(id);
          return (
            <li key={id} className={`row tappable ${selected ? 'selected' : ''}`} onClick={() => toggleLineup(id)}>
              <span className="check">{selected ? '✓' : ''}</span>
              <Shirt p={p} />
              <span className="grow name">{p?.name}</span>
              <span className="muted small">{ctxStarts[id] ?? 0} starts</span>
              {selected && (
                <button
                  className={`chip ${match.keeperId === id ? 'on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleKeeper(id);
                  }}
                >
                  GK
                </button>
              )}
              <button
                className="btn small ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setPresent(id, false);
                }}
              >
                Absent
              </button>
            </li>
          );
        })}
      </ul>

      <AbsentList absent={absent} byId={byId} setPresent={setPresent} />
    </div>
  );
}

function AbsentList({
  absent,
  byId,
  setPresent,
}: {
  absent: string[];
  byId: Map<string, Player>;
  setPresent: (id: string, present: boolean) => void;
}) {
  if (absent.length === 0) return null;
  return (
    <>
      <h2 className="section-title">Not here ({absent.length})</h2>
      <ul className="list">
        {absent.map((id) => {
          const p = byId.get(id);
          return (
            <li key={id} className="row dim">
              <Shirt p={p} />
              <span className="grow name">{p?.name}</span>
              <button className="btn small" onClick={() => setPresent(id, true)}>
                Arrived
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function MinutesBar({ ms, fair }: { ms: number; fair: number }) {
  const pct = fair > 0 ? Math.min(100, (ms / fair) * 100) : 0;
  const low = fair > 60_000 && ms < fair * 0.75;
  return (
    <span className="minutes">
      <span className={`mins ${low ? 'low' : ''}`}>{mins(ms)}</span>
      <span className="bar">
        <span className={`fill ${low ? 'low' : ''}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

function Live({
  match,
  s,
  present,
  absent,
  byId,
  ctx,
  onGoal,
  onSubTap,
  onBenchTap,
  setPresent,
  toggleKeeper,
}: {
  match: Match;
  s: MatchState;
  present: string[];
  absent: string[];
  byId: Map<string, Player>;
  ctx: ReturnType<typeof seasonContext>;
  onGoal: (id: string) => void;
  onSubTap: (id: string) => void;
  onBenchTap: (id: string) => void;
  setPresent: (id: string, present: boolean) => void;
  toggleKeeper: (id: string) => void;
}) {
  const bench = present.filter((id) => !s.onPitch.includes(id));
  const benchOrder = suggestOn(bench, s.playerMs, ctx);
  const offOrder = suggestOff(s.onPitch, s.playerMs, ctx, match.keeperId);
  const nextOff = bench.length > 0 ? offOrder[0] : undefined;
  const fair = fairShareMs(match.onField, s.clockMs, present.length);
  const short = match.onField - s.onPitch.length;

  return (
    <div className="screen">
      <p className="hint">
        Fair share so far: <strong>{mins(fair)}</strong> each · {present.length} players here
      </p>

      <h2 className="section-title">
        On the pitch ({s.onPitch.length}/{match.onField})
      </h2>
      <ul className="list">
        {s.onPitch.map((id) => {
          const p = byId.get(id);
          const goals = s.goals[id] ?? 0;
          return (
            <li key={id} className={`row ${id === nextOff ? 'suggest-off' : ''}`}>
              <Shirt p={p} />
              <div className="grow">
                <div className="name-line">
                  <span className="name">{p?.name}</span>
                  {id === nextOff && <span className="badge off">Next off</span>}
                </div>
                <MinutesBar ms={s.playerMs[id] ?? 0} fair={fair} />
              </div>
              <button className={`chip ${match.keeperId === id ? 'on' : ''}`} onClick={() => toggleKeeper(id)}>
                GK
              </button>
              <button className="btn goal" onClick={() => onGoal(id)} aria-label={`Goal for ${p?.name}`}>
                ⚽{goals > 0 && <span className="goal-count">{goals}</span>}
              </button>
              <button className="btn sub" onClick={() => onSubTap(id)}>
                Sub
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="section-title">Bench ({bench.length})</h2>
      {bench.length === 0 && <p className="hint">Everyone is on the pitch.</p>}
      <ul className="list">
        {benchOrder.map((id, i) => {
          const p = byId.get(id);
          return (
            <li key={id} className={`row ${i === 0 ? 'suggest-on' : ''}`}>
              <Shirt p={p} />
              <div className="grow">
                <div className="name-line">
                  <span className="name">{p?.name}</span>
                  {i === 0 && <span className="badge on">Next on</span>}
                </div>
                <div className="bench-meta">
                  <MinutesBar ms={s.playerMs[id] ?? 0} fair={fair} />
                  <span className="muted small">season {mins(ctx.seasonMs[id] ?? 0)}</span>
                </div>
              </div>
              <button className="btn small ghost" onClick={() => setPresent(id, false)}>
                Left
              </button>
              <button className="btn sub" onClick={() => onBenchTap(id)}>
                {short > 0 ? 'On' : 'Sub on'}
              </button>
            </li>
          );
        })}
      </ul>

      <AbsentList absent={absent} byId={byId} setPresent={setPresent} />
    </div>
  );
}

function SubSheet({
  sheet,
  s,
  match,
  present,
  byId,
  ctx,
  onClose,
  onSub,
  onOff,
}: {
  sheet: NonNullable<Sheet>;
  s: MatchState;
  match: Match;
  present: string[];
  byId: Map<string, Player>;
  ctx: ReturnType<typeof seasonContext>;
  onClose: () => void;
  onSub: (onId: string, offId: string) => void;
  onOff: (id: string) => void;
}) {
  const subject = byId.get(sheet.playerId)?.name;
  const bench = present.filter((id) => !s.onPitch.includes(id));
  const options =
    sheet.mode === 'off' ? suggestOn(bench, s.playerMs, ctx) : suggestOff(s.onPitch, s.playerMs, ctx, match.keeperId);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{sheet.mode === 'off' ? `${subject} off — who comes on?` : `${subject} on — who comes off?`}</h2>
        {options.length === 0 && <p className="hint">Nobody available.</p>}
        <ul className="list">
          {options.map((id, i) => {
            const p = byId.get(id);
            return (
              <li
                key={id}
                className={`row tappable ${i === 0 ? 'selected' : ''}`}
                onClick={() => (sheet.mode === 'off' ? onSub(id, sheet.playerId) : onSub(sheet.playerId, id))}
              >
                <Shirt p={p} />
                <span className="grow name-line">
                  <span className="name">{p?.name}</span>
                  {i === 0 && <span className="badge on">Suggested</span>}
                  {match.keeperId === id && <span className="badge">GK</span>}
                </span>
                <span className="mins">{mins(s.playerMs[id] ?? 0)}</span>
              </li>
            );
          })}
        </ul>
        <div className="actions">
          {sheet.mode === 'off' && (
            <button className="btn ghost" onClick={() => onOff(sheet.playerId)}>
              Take off, no replacement
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Summary({
  match,
  s,
  name,
  byId,
  onReopen,
}: {
  match: Match;
  s: MatchState;
  name: (id: string) => string;
  byId: Map<string, Player>;
  onReopen: () => void;
}) {
  const ids = [...new Set([...match.presentIds, ...Object.keys(s.playerMs)])].filter((id) => byId.has(id));
  ids.sort((a, b) => (s.playerMs[b] ?? 0) - (s.playerMs[a] ?? 0));
  const scorers = match.events.filter((e): e is Extract<MatchEvent, { type: 'GOAL' }> => e.type === 'GOAL');

  return (
    <div className="screen">
      {scorers.length > 0 && (
        <p className="hint">
          ⚽{' '}
          {Object.entries(s.goals)
            .map(([id, n]) => (n > 1 ? `${name(id)} ×${n}` : name(id)))
            .join(', ')}
        </p>
      )}
      <table className="stats">
        <thead>
          <tr>
            <th>Player</th>
            <th>Started</th>
            <th>Min</th>
            <th>Goals</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => (
            <tr key={id}>
              <td>{name(id)}</td>
              <td>{s.starters.includes(id) ? '✓' : ''}</td>
              <td>{Math.floor((s.playerMs[id] ?? 0) / 60000)}</td>
              <td>{s.goals[id] ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button className="btn ghost" onClick={onReopen}>
          Reopen match
        </button>
      </div>
    </div>
  );
}
