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
import './records.css';
import { Architecture } from './architecture.tsx';
import { ActorsList, ConnectionsList, OwnersList, SoftwareList, TABS, TechnologiesList } from './models.tsx';
import { RecordPage } from './record.tsx';
import { Shell } from './shell.tsx';

const [software, actors, connections, technologies, owners] = TABS;

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Architecture />} />
            <Route path="models" element={<SoftwareList />} />
            <Route path="models/:id" element={<RecordPage tab={software} />} />
            <Route path="actors" element={<ActorsList />} />
            <Route path="actors/:id" element={<RecordPage tab={actors} />} />
            <Route path="connections" element={<ConnectionsList />} />
            <Route path="connections/:id" element={<RecordPage tab={connections} />} />
            <Route path="technologies" element={<TechnologiesList />} />
            <Route path="technologies/:id" element={<RecordPage tab={technologies} />} />
            <Route path="owners" element={<OwnersList />} />
            <Route path="owners/:id" element={<RecordPage tab={owners} />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StrictMode>,
  );
}
