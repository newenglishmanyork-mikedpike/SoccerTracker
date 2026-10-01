import { useEffect, useState } from 'react';
import TeamBar from './components/TeamBar';
import { ensureDefaultTeam } from './data';
import AccountScreen from './screens/AccountScreen';
import MatchesScreen from './screens/MatchesScreen';
import MatchScreen from './screens/MatchScreen';
import SquadScreen from './screens/SquadScreen';
import StatsScreen from './screens/StatsScreen';
import { useSyncStatus } from './sync/status';
import { useTeams } from './teams';

type Tab = 'matches' | 'squad' | 'stats' | 'account';

const OPEN_KEY = 'soccer-tracker:openMatch';

function readOpenMatch(): string | null {
  try {
    return localStorage.getItem(OPEN_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('matches');
  const sync = useSyncStatus();
  const teams = useTeams();

  useEffect(() => {
    if (teams && teams.teams.length === 0) ensureDefaultTeam();
  }, [teams]);
  // Remember the open match so a refresh mid-game lands back on it.
  const [openMatchId, setOpenMatchIdState] = useState<string | null>(readOpenMatch);

  const setOpenMatchId = (id: string | null) => {
    setOpenMatchIdState(id);
    try {
      if (id) localStorage.setItem(OPEN_KEY, id);
      else localStorage.removeItem(OPEN_KEY);
    } catch {
      /* storage unavailable: fine */
    }
  };

  if (openMatchId) {
    return <MatchScreen matchId={openMatchId} onBack={() => setOpenMatchId(null)} />;
  }

  const team = teams?.active;

  return (
    <div className="app">
      {teams && tab !== 'account' && <TeamBar state={teams} />}
      <main className="content">
        {sync.state === 'signedOut' && tab !== 'account' && (
          <div className="banner">
            <span className="grow">Sign in to sync your squad and matches across devices.</span>
            <button className="btn small primary" onClick={() => setTab('account')}>
              Sign in
            </button>
          </div>
        )}
        {!team && tab !== 'account' && <div className="screen muted">Loading…</div>}
        {team && tab === 'matches' && <MatchesScreen key={team.id} teamId={team.id} onOpen={setOpenMatchId} />}
        {team && tab === 'squad' && <SquadScreen key={team.id} teamId={team.id} />}
        {team && tab === 'stats' && <StatsScreen key={team.id} team={team} />}
        {tab === 'account' && <AccountScreen />}
      </main>
      <nav className="tabbar">
        {(
          [
            ['matches', 'Matches', '⚽'],
            ['squad', 'Squad', '👕'],
            ['stats', 'Season', '📊'],
            ['account', 'Account', '☁️'],
          ] as const
        ).map(([key, label, icon]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            <span className="tab-icon">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
