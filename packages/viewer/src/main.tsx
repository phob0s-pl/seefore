import '@xyflow/react/dist/style.css';
import './styles.css';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { addressOf, routeOf } from './address.ts';
import type { Route } from './address.ts';
import { revisionOf } from './follow.ts';
import { Live, httpServer, nothingShown } from './live.ts';
import type { Shown } from './live.ts';
import { Page, pageTitle } from './page.tsx';

/**
 * The page as the browser runs it: it asks the server for the state and the pictures, follows
 * its events, and keeps the address in step with the setting shown.
 */
function App() {
  const [shown, setShown] = useState<Shown>(() => nothingShown(routeOf(location.hash)));
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
    // An address typed or followed, and Back and Forward over the entries the controls made.
    const onHash = () => void live.go(routeOf(location.hash));
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      events.close();
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, [live]);

  // The address names what is shown, so that it reopens it: put right when a depth was too
  // shallow for the box, or a setting was not known. With nothing to show it stays as it is.
  const address = addressOf(shown.route);
  useEffect(() => {
    if (address !== '' && address !== location.hash) history.replaceState(null, '', address);
  }, [address]);

  const title = pageTitle(shown);
  useEffect(() => {
    document.title = title;
  }, [title]);

  // A control or a button opens a setting in one step: a new entry in the history, so that Back
  // returns to the one before, and the page takes it at once, as the reader acts.
  const go = (route: Route) => {
    const next = addressOf(route);
    if (next !== '' && next !== location.hash) history.pushState(null, '', next);
    void live.go(route);
  };

  return <Page shown={shown} onGo={go} />;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
