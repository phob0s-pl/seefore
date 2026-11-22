import { createRoot } from 'react-dom/client';

/** The page. Not built yet. */
function App() {
  return <p>seefore: the viewer is not built yet.</p>;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
