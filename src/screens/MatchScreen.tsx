import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { updateMatch } from '../data';
import { db } from '../db';
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
import { teamOf } from '../teams';
import type { Match, MatchEvent, Player } from '../types';
import { Stepper } from './MatchesScreen';

const MIN_ON_FIELD = 2;
const MAX_ON_FIELD = 11;

type Sheet =
  | { mode: 'off'; playerId: string }
  | { mode: 'on'; playerId: string }
  // Players-per-side was reduced: pick who comes off until it fits.
  | { mode: 'reduce' }
  | null;

export default function MatchScreen({ matchId, onBack }: { matchId: string; onBack: () => void }) {
  const match = useLiveQuery(() => db.matches.get(matchId).then((m) => m ?? null), [matchId]);
  // Only this match's team: other teams' players and matches don't belong in
  // its lists, suggestions or season context.
  const teamId = match ? teamOf(match) : undefined;
  const players = useLiveQuery<Player[] | null>(
    () =>
      teamId === undefined
        ? null
        : db.players
            .orderBy('createdAt')
            .filter((p) => teamOf(p) === teamId)
            .toArray(),
    [teamId],
  );
  const allMatches = useLiveQuery<Match[] | null>(
    () => (teamId === undefined ? null : db.matches.filter((m) => teamOf(m) === teamId).toArray()),
    [teamId],
  );

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
    }));

  /** Change players-per-side by ±1, applied to the saved value so fast taps all count. */
  const stepOnField = (d: 1 | -1, after?: (n: number) => void) =>
    update((m) => {
      const onField = Math.min(MAX_ON_FIELD, Math.max(MIN_ON_FIELD, m.onField + d));
      after?.(onField);
      return { ...m, onField, lineupIds: m.lineupIds.slice(0, onField) };
    });

  const lastEvent = match.events[match.events.length - 1];
  const undoLabel = !lastEvent
    ? ''
    : lastEvent.type === 'PERIOD_START' && s.period === 1
      ? 'Kick off'
      : describeEvent(lastEvent, name);

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
                Pause
              </button>
            )}
            {s.started && !s.running && (
              <>
                <button className="btn primary big" onClick={() => push({ type: 'PERIOD_START', t: Date.now() })}>
                  Restart
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
                ↶ Undo: {undoLabel}
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
            onFieldStep={(d) => stepOnField(d)}
            toggleLineup={(id) =>
              update((m) => {
                if (m.lineupIds.includes(id)) return { ...m, lineupIds: m.lineupIds.filter((p) => p !== id) };
                if (m.lineupIds.length >= m.onField) return m;
                return { ...m, lineupIds: [...m.lineupIds, id] };
              })
            }
            setLineup={(ids) => update((m) => ({ ...m, lineupIds: ids }))}
            setPresent={setPresent}
            setAllPresent={() =>
              update((m) => ({
                ...m,
                presentIds: [...m.presentIds, ...absent.filter((id) => !m.presentIds.includes(id))],
              }))
            }
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
            onFieldStep={(d) =>
              stepOnField(d, (n) => {
                if (s.onPitch.length > n) setSheet({ mode: 'reduce' });
              })
            }
            onReduce={() => setSheet({ mode: 'reduce' })}
            setPresent={setPresent}
          />
        )}
      </main>

      {sheet && (
        <SubSheet
          sheet={sheet}
          s={s}
          onField={match.onField}
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
            // When cutting players-per-side, keep asking until it fits.
            if (sheet.mode !== 'reduce' || s.onPitch.length - 1 <= match.onField) setSheet(null);
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
        ? 'Playing'
        : 'Paused';
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
  onFieldStep,
  toggleLineup,
  setLineup,
  setPresent,
  setAllPresent,
}: {
  match: Match;
  present: string[];
  absent: string[];
  byId: Map<string, Player>;
  ctxStarts: Record<string, number>;
  ctxMs: Record<string, number>;
  onFieldStep: (d: 1 | -1) => void;
  toggleLineup: (id: string) => void;
  setLineup: (ids: string[]) => void;
  setPresent: (id: string, present: boolean) => void;
  setAllPresent: () => void;
}) {
  const suggestLineup = () => {
    // Fewest starts first, then fewest season minutes.
    const ranked = [...present].sort(
      (a, b) => (ctxStarts[a] ?? 0) - (ctxStarts[b] ?? 0) || (ctxMs[a] ?? 0) - (ctxMs[b] ?? 0),
    );
    setLineup(ranked.slice(0, match.onField));
  };

  return (
    <div className="screen">
      <div className="card setup-bar">
        <span className="grow">Players on the pitch</span>
        <Stepper value={match.onField} onStep={onFieldStep} min={MIN_ON_FIELD} max={MAX_ON_FIELD} />
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
      {present.length === 0 ? (
        <p className="hint">Nobody is marked as here yet. Tap players below as they arrive.</p>
      ) : (
        <p className="hint">Tap players to pick the starters. “Suggest” picks those with the fewest starts this season.</p>
      )}

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

      <AbsentList
        absent={absent}
        byId={byId}
        setPresent={setPresent}
        title="Not here yet"
        action="Here"
        onAll={setAllPresent}
      />
    </div>
  );
}

function AbsentList({
  absent,
  byId,
  setPresent,
  title = 'Not here',
  action = 'Arrived',
  onAll,
}: {
  absent: string[];
  byId: Map<string, Player>;
  setPresent: (id: string, present: boolean) => void;
  title?: string;
  action?: string;
  /** Before kick-off: mark everyone as here in one tap. */
  onAll?: () => void;
}) {
  if (absent.length === 0) return null;
  return (
    <>
      <div className="section-head">
        <h2 className="section-title">
          {title} ({absent.length})
        </h2>
        {onAll && absent.length > 1 && (
          <button className="btn small" onClick={onAll}>
            All here
          </button>
        )}
      </div>
      <ul className="list">
        {absent.map((id) => {
          const p = byId.get(id);
          return (
            <li key={id} className="row dim tappable" onClick={() => setPresent(id, true)}>
              <Shirt p={p} />
              <span className="grow name">{p?.name}</span>
              <button
                className="btn small"
                onClick={(e) => {
                  e.stopPropagation();
                  setPresent(id, true);
                }}
              >
                {action}
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
  onFieldStep,
  onReduce,
  setPresent,
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
  onFieldStep: (d: 1 | -1) => void;
  onReduce: () => void;
  setPresent: (id: string, present: boolean) => void;
}) {
  const bench = present.filter((id) => !s.onPitch.includes(id));
  const benchOrder = suggestOn(bench, s.playerMs, ctx);
  const offOrder = suggestOff(s.onPitch, s.playerMs, ctx);
  const fair = fairShareMs(s.playerMs, present.length);
  const short = match.onField - s.onPitch.length;
  // Only suggest someone come off when the pitch is full and there's a sub waiting.
  const nextOff = bench.length > 0 && short <= 0 ? offOrder[0] : undefined;

  return (
    <div className="screen">
      <div className="card setup-bar">
        <span className="grow">Players on the pitch</span>
        <Stepper value={match.onField} onStep={onFieldStep} min={MIN_ON_FIELD} max={MAX_ON_FIELD} />
      </div>
      <p className="hint">
        Fair share so far: <strong>{mins(fair)}</strong> each · {present.length} players here
      </p>
      {short > 0 && bench.length > 0 && (
        <p className="notice">
          Room for {short} more on the pitch. Tap <strong>On</strong> next to a bench player.
        </p>
      )}
      {short < 0 && (
        <p className="notice warn">
          {-short} too many on the pitch for {match.onField}v{match.onField}.{' '}
          <button className="btn small" onClick={onReduce}>
            Choose who comes off
          </button>
        </p>
      )}

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
  onField,
  present,
  byId,
  ctx,
  onClose,
  onSub,
  onOff,
}: {
  sheet: NonNullable<Sheet>;
  s: MatchState;
  onField: number;
  present: string[];
  byId: Map<string, Player>;
  ctx: ReturnType<typeof seasonContext>;
  onClose: () => void;
  onSub: (onId: string, offId: string) => void;
  onOff: (id: string) => void;
}) {
  const subject = sheet.mode === 'reduce' ? '' : byId.get(sheet.playerId)?.name;
  const bench = present.filter((id) => !s.onPitch.includes(id));
  const options =
    sheet.mode === 'off' ? suggestOn(bench, s.playerMs, ctx) : suggestOff(s.onPitch, s.playerMs, ctx);
  const excess = s.onPitch.length - onField;
  const title =
    sheet.mode === 'off'
      ? `${subject} off — who comes on?`
      : sheet.mode === 'on'
        ? `${subject} on — who comes off?`
        : `Now ${onField}v${onField}: who comes off?${excess > 1 ? ` (${excess} to go)` : ''}`;
  const choose = (id: string) => {
    if (sheet.mode === 'off') onSub(id, sheet.playerId);
    else if (sheet.mode === 'on') onSub(sheet.playerId, id);
    else onOff(id);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {options.length === 0 && <p className="hint">Nobody available.</p>}
        <ul className="list">
          {options.map((id, i) => {
            const p = byId.get(id);
            return (
              <li
                key={id}
                className={`row tappable ${i === 0 ? 'selected' : ''}`}
                onClick={() => choose(id)}
              >
                <Shirt p={p} />
                <span className="grow name-line">
                  <span className="name">{p?.name}</span>
                  {i === 0 && <span className="badge on">Suggested</span>}
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
