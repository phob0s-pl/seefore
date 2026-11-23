import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Waypoints } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import type { ModelAnswer } from '../model/answer.ts';
import { DEPTHS, depthOf } from '../model/view.ts';
import type { Depth } from '../model/view.ts';
import { Button, GlassGroup } from './ui.tsx';

/** What the shell knows of the model, and hands to the page: the answer, or why there is none. */
export type ModelState = { answer?: ModelAnswer; failed?: string };

/** The depths as the top bar names them. */
const DEPTH_WORDS: Record<Depth, string> = { systems: 'Systems', containers: 'Containers', components: 'Components' };

/**
 * The window: the sidebar with the name and the one entry, the top bar with a back and a
 * forward arrow and the choice of depth, and the page beside them.
 */
export function Shell() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const depth = depthOf(params.get('depth'));
  const [model, setModel] = useState<ModelState>({});

  useEffect(() => {
    fetch('/api/model')
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.text()).trim());
        setModel({ answer: (await response.json()) as ModelAnswer });
      })
      .catch((cause: unknown) => {
        setModel({ failed: cause instanceof Error && cause.message !== '' ? cause.message : 'Cannot reach seefore.' });
      });
  }, []);

  // The project's name stands beside the tool's: the model's name, or its folder's.
  const project = model.answer ? (model.answer.name ?? model.answer.folder) : undefined;
  return (
    <div className="app-shell">
      <div className="app-fade" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <div className="brand-row">
          <Link className="brand" to="/">
            <span>
              seefore<span className="brand-dot">.</span>
            </span>
          </Link>
          {project !== undefined && (
            <span className="brand-project" title={project}>
              {project}
            </span>
          )}
        </div>
        <nav aria-label="Main navigation" className="sidebar-navigation">
          <NavLink to="/" end className="nav-link">
            <Waypoints />
            <span className="nav-text">Architecture</span>
          </NavLink>
        </nav>
      </aside>
      <div className="app-inset">
        <header className="top-header">
          <GlassGroup className="history-controls" aria-label="Page history">
            <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => void navigate(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Go forward" onClick={() => void navigate(1)}>
              <ChevronRight />
            </Button>
          </GlassGroup>
          <nav className="page-tabs" aria-label="Depth">
            {DEPTHS.map((item) => (
              <Link key={item} to={item === 'systems' ? '/' : `/?depth=${item}`} aria-current={item === depth ? 'page' : undefined}>
                {DEPTH_WORDS[item]}
              </Link>
            ))}
          </nav>
        </header>
        <main id="main-content" tabIndex={-1} className="page-content">
          <Outlet context={model} />
        </main>
      </div>
    </div>
  );
}
