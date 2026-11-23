import { ChevronLeft, ChevronRight, Waypoints } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, GlassGroup } from './ui.tsx';

/**
 * The window: the sidebar with the name and the one entry, the top bar with a back and a
 * forward arrow, and the page beside them.
 */
export function Shell() {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <div className="app-fade" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <Link className="brand" to="/">
          <span>
            seefore<span className="brand-dot">.</span>
          </span>
        </Link>
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
        </header>
        <main id="main-content" tabIndex={-1} className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
