import { useState } from 'react';
import AccountScreen from './screens/AccountScreen';
import MatchesScreen from './screens/MatchesScreen';
import MatchScreen from './screens/MatchScreen';
import SquadScreen from './screens/SquadScreen';
import StatsScreen from './screens/StatsScreen';
import { useSyncStatus } from './sync/status';

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

  return (
    <div className="app">
      <main className="content">
        {sync.state === 'signedOut' && tab !== 'account' && (
          <div className="banner">
            <span className="grow">Sign in to sync your squad and matches across devices.</span>
            <button className="btn small primary" onClick={() => setTab('account')}>
              Sign in
            </button>
          </div>
        )}
        {tab === 'matches' && <MatchesScreen onOpen={setOpenMatchId} />}
        {tab === 'squad' && <SquadScreen />}
        {tab === 'stats' && <StatsScreen />}
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
