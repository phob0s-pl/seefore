import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@xyflow/react/dist/style.css';
import './theme.css';
import './base.css';
import './ui.css';
import './shell.css';
import './diagram.css';
import { Architecture } from './architecture.tsx';
import { Shell } from './shell.tsx';

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Architecture />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StrictMode>,
  );
}
