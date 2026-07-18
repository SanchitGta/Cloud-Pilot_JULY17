import { useEffect, useState } from 'react';
import { getCurrentConnection } from './api/client';
import ConnectPage from './pages/ConnectPage';
import OverviewPage from './pages/OverviewPage';

type Screen = 'loading' | 'connect' | 'overview';

export default function App() {
  // App is the single place that decides which top-level screen is active.
  // Any future top-level screen extends this switch rather than self-checking
  // connection state.
  const [screen, setScreen] = useState<Screen>('loading');

  useEffect(() => {
    (async () => {
      const connection = await getCurrentConnection();
      setScreen(connection ? 'overview' : 'connect');
    })();
  }, []);

  if (screen === 'loading') {
    return <p>Loading...</p>;
  }

  if (screen === 'overview') {
    return <OverviewPage />;
  }

  return <ConnectPage onConnected={() => setScreen('overview')} />;
}
