import { useState } from 'react';
import MatchesScreen from './screens/MatchesScreen';
import MatchScreen from './screens/MatchScreen';
import SquadScreen from './screens/SquadScreen';
import StatsScreen from './screens/StatsScreen';

type Tab = 'matches' | 'squad' | 'stats';

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
        {tab === 'matches' && <MatchesScreen onOpen={setOpenMatchId} />}
        {tab === 'squad' && <SquadScreen />}
        {tab === 'stats' && <StatsScreen />}
      </main>
      <nav className="tabbar">
        {(
          [
            ['matches', 'Matches', '⚽'],
            ['squad', 'Squad', '👕'],
            ['stats', 'Season', '📊'],
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
