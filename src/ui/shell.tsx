import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, House, ListChecks, PencilRuler, Puzzle, Waypoints } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import type { ModelAnswer } from '../model/answer.ts';
import { catalogueOf } from '../model/catalogue.ts';
import type { Catalogue } from '../model/catalogue.ts';
import { changesOf } from '../model/changes.ts';
import type { Changes } from '../model/changes.ts';
import { contextOf } from '../model/context.ts';
import type { Context } from '../model/context.ts';
import { rulebookOf } from '../model/rulebook.ts';
import type { Rulebook } from '../model/rulebook.ts';
import { travelOf } from '../model/travel.ts';
import type { Travel } from '../model/travel.ts';
import { DEPTHS, depthOf, focusesOf, focusFor } from '../model/view.ts';
import type { Depth, Focus } from '../model/view.ts';
import { ChangeSidebar } from './changes.tsx';
import { TABS } from './models.tsx';
import { Button, ButtonLink, GlassGroup } from './ui.tsx';

/**
 * What the shell knows of the model, and hands to the page: the answer and what the pages of
 * the records, of the rules, of the context and of the changes ask of it, worked out once, or
 * why there is none. On the page of a flow, in the system or under a change, the places the page
 * fills itself: the sidebar under the name, and the top bar after the arrows; on the page of a
 * rule and on that of a record under a change, the top bar alone.
 */
export type ModelState = { answer?: ModelAnswer; catalogue?: Catalogue; travel?: Travel; rulebook?: Rulebook; context?: Context; changes?: Changes; failed?: string; slots?: Slots };

/** The places of the shell that the page of a flow fills, its steps and its breadcrumb, and that of a rule or of a record under a change, its breadcrumb. */
export type Slots = { steps: HTMLElement | null; crumbs: HTMLElement | null };

/** The depths as the top bar names them. */
const DEPTH_WORDS: Record<Depth, string> = { systems: 'Systems', containers: 'Containers', components: 'Components' };

/** The first choice of the focus at a depth, which shows everything. */
const ALL_WORDS: Partial<Record<Depth, string>> = { containers: 'All systems', components: 'All apps' };

/** The address of the diagram at a depth, with a focus or none. */
function diagramAt(depth: Depth, focus?: string): string {
  if (depth === 'systems') return '/';
  return `/?${new URLSearchParams(focus === undefined ? { depth } : { depth, focus }).toString()}`;
}

/**
 * The focus of the diagram: a pill that names the current choice and opens the list of choices
 * under it, "All" first. A choice is a link to its address. The list closes on a choice, on
 * Escape, which then closes nothing else, and on a click outside it.
 */
function FocusMenu({ depth, focus, choices }: { depth: Depth; focus: string | undefined; choices: readonly Focus[] }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useId();
  const options = [{ id: undefined, name: ALL_WORDS[depth] ?? '' }, ...choices];
  const current = options.find((option) => option.id === focus) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpen(false);
    };
    // Caught before the panel of the diagram hears it, and kept from it.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  return (
    <div
      className="focus-menu"
      ref={menu}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        className="focus-menu-trigger"
        aria-label="Focus"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={list}
        title={current?.name}
        onClick={() => setOpen((was) => !was)}
      >
        <span>{current?.name}</span>
        <ChevronDown aria-hidden="true" />
      </Button>
      {open && (
        <div id={list} className="focus-menu-list" role="listbox" aria-label="Focus">
          {options.map((option) => (
            <Link key={option.id ?? ''} to={diagramAt(depth, option.id)} role="option" aria-selected={option.id === current?.id} onClick={() => setOpen(false)}>
              <span className="focus-menu-check">{option.id === current?.id && <Check aria-hidden="true" />}</span>
              <span className="focus-menu-name">{option.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The window: the sidebar with the name and its entries, the top bar with a back and a forward
 * arrow and, on the Architecture page, the choice of depth and of focus, and the page beside
 * them. On the page of a flow, under a change too, its steps stand in the sidebar and its
 * breadcrumb in the top bar; on the other pages of a change, its sections stand in the sidebar.
 * Where the sidebar is replaced, a home button stands before the arrows.
 */
export function Shell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const depth = depthOf(params.get('depth'));
  const [model, setModel] = useState<{ answer?: ModelAnswer; failed?: string }>({});
  const state = useMemo((): ModelState => {
    if (model.answer === undefined) return model;
    const catalogue = catalogueOf(model.answer.records);
    return { ...model, catalogue, travel: travelOf(model.answer.records, catalogue), rulebook: rulebookOf(model.answer), context: contextOf(model.answer.records), changes: changesOf(model.answer.records, model.answer.laid) };
  }, [model]);
  // The focus the address names, and the choices of the depth: none at Systems.
  const records = model.answer?.records;
  const wanted = params.get('focus');
  const focus = useMemo(() => (records ? focusFor(records, depth, wanted) : undefined), [records, depth, wanted]);
  const choices = useMemo(() => (records ? focusesOf(records, depth) : []), [records, depth]);
  // Each depth link keeps the focus where it fits: an app's system at Containers.
  const links = useMemo(() => DEPTHS.map((item) => ({ depth: item, to: diagramAt(item, records && focusFor(records, item, focus)) })), [records, focus]);
  // Models is current on each of its lists and on the page of every record.
  const inModels = TABS.some((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`));
  // On the page of a flow the steps take the place of the navigation, while the model is read
  // and once it has the flow. An address whose flow does not exist keeps the navigation. So it is
  // for a flow under a change, once the change has the flow under it; else the change's own
  // sidebar stands, as on the page of any record under it.
  const flowId = useMatch('/flows/:id')?.params.id;
  const flowUnder = useMatch('/changes/:id/records/flows/:flow')?.params;
  const onFlow = flowId !== undefined && (state.catalogue === undefined ? state.failed === undefined : state.catalogue.record(flowId)?.kind === 'flows');
  const onFlowUnder = flowUnder !== undefined && (state.changes === undefined ? state.failed === undefined : state.changes.flow(flowUnder.id ?? '', flowUnder.flow ?? '') !== undefined);
  const reading = onFlow || onFlowUnder;
  // On the pages of a change its own sidebar takes the place of the navigation, once the model
  // has the change: Need, Records, and the page of each record under it. While the model is read,
  // and for an id that names no change, the navigation stays.
  const onNeed = useMatch('/changes/:id');
  const onRecords = useMatch('/changes/:id/records/*');
  const changeId = (onNeed ?? onRecords)?.params.id;
  const change = changeId !== undefined ? state.changes?.change(changeId) : undefined;
  // The page of a rule, and that of a record under a change, put their breadcrumb in the top bar too.
  const onRule = useMatch('/rules/:id') !== null;
  const underChange = (onRecords?.params['*'] ?? '') !== '';
  const crumbed = reading || onRule || underChange;
  // Wherever the navigation is replaced, a button leads home.
  const home = reading || change !== undefined;
  const [steps, setSteps] = useState<HTMLElement | null>(null);
  const [crumbs, setCrumbs] = useState<HTMLElement | null>(null);
  const handed = useMemo((): ModelState => (crumbed ? { ...state, slots: { steps: reading ? steps : null, crumbs } } : state), [state, crumbed, reading, steps, crumbs]);
  const dot = state.rulebook?.dot;

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
    <div className={`app-shell${reading ? ' app-shell-reading' : ''}`}>
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
        {reading ? (
          <div className="sidebar-slot" ref={setSteps} />
        ) : change !== undefined ? (
          <ChangeSidebar change={change} />
        ) : (
          <nav aria-label="Main navigation" className="sidebar-navigation">
            <NavLink to="/" end className="nav-link">
              <Waypoints />
              <span className="nav-text">Architecture</span>
            </NavLink>
            <NavLink to="/context" className="nav-link">
              <Compass />
              <span className="nav-text">Context</span>
            </NavLink>
            <NavLink to="/features" className="nav-link">
              <Puzzle />
              <span className="nav-text">Features</span>
            </NavLink>
            <Link to="/models" className={`nav-link${inModels ? ' active' : ''}`} aria-current={inModels ? 'page' : undefined}>
              <Boxes />
              <span className="nav-text">Models</span>
            </Link>
            <NavLink to="/rules" className="nav-link">
              <ListChecks />
              <span className="nav-text">Rules</span>
              {dot !== undefined && <span className={`nav-dot nav-dot-${dot}`} role="img" aria-label={dot === 'broken' ? 'A rule is broken' : 'A rule is not judged'} />}
            </NavLink>
            <NavLink to="/changes" className="nav-link">
              <PencilRuler />
              <span className="nav-text">Changes</span>
            </NavLink>
          </nav>
        )}
      </aside>
      <div className="app-inset">
        <header className="top-header">
          <GlassGroup className="history-controls" aria-label="Page history">
            {home && (
              <>
                <ButtonLink to="/" variant="ghost" size="icon" aria-label="Home">
                  <House />
                </ButtonLink>
                <span className="history-divider" aria-hidden="true" />
              </>
            )}
            <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => void navigate(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Go forward" onClick={() => void navigate(1)}>
              <ChevronRight />
            </Button>
          </GlassGroup>
          {crumbed && <div className="header-slot" ref={setCrumbs} />}
          {pathname === '/' && (
            <nav className="page-tabs" aria-label="Depth">
              {links.map((link) => (
                <Link key={link.depth} to={link.to} aria-current={link.depth === depth ? 'page' : undefined}>
                  {DEPTH_WORDS[link.depth]}
                </Link>
              ))}
            </nav>
          )}
          {pathname === '/' && choices.length > 0 && <FocusMenu key={depth} depth={depth} focus={focus} choices={choices} />}
        </header>
        <main id="main-content" tabIndex={-1} className="page-content">
          <Outlet context={handed} />
        </main>
      </div>
    </div>
  );
}
