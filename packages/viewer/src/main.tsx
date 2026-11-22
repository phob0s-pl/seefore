import '@xyflow/react/dist/style.css';
import './styles.css';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { addressOf, routeOf } from './address.ts';
import { revisionOf } from './follow.ts';
import { Live, httpServer } from './live.ts';
import type { Shown } from './live.ts';
import { Page, pageTitle } from './page.tsx';

/**
 * The page as the browser runs it: it asks the server for the state and the pictures, follows
 * its events, and keeps the address in step with the view shown.
 */
function App() {
  const [shown, setShown] = useState<Shown>(() => ({ state: null, route: routeOf(location.hash), picture: null, trouble: null }));
  const live = useMemo(() => new Live(httpServer(), setShown, routeOf(location.hash)), []);

  useEffect(() => {
    void live.refresh();
    // The server names its latest revision when the stream opens and after each new reading.
    const events = new EventSource('/api/events');
    events.addEventListener('revision', (event) => {
      const { state, trouble } = live.current();
      if (revisionOf(event.data) !== state?.revision || trouble !== null) void live.refresh();
    });
    events.addEventListener('error', () => live.lost());
    const onHash = () => void live.go(routeOf(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => {
      events.close();
      window.removeEventListener('hashchange', onHash);
    };
  }, [live]);

  // The address names what is shown, so that it reopens it. With no view to show it stays as it is.
  const address = addressOf(shown.route);
  useEffect(() => {
    if (address !== '' && address !== location.hash) history.replaceState(null, '', address);
  }, [address]);

  const title = pageTitle(shown);
  useEffect(() => {
    document.title = title;
  }, [title]);

  return <Page shown={shown} />;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
