import type { Failed, View, ViewerState } from '@seefore/core';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Diagram, LightContext } from './diagram.tsx';
import type { Light } from './diagram.tsx';
import { keptSelection, viewOf } from './follow.ts';
import type { Selection } from './follow.ts';
import { holds, holdsBox, litBy, litByKept } from './light.ts';
import type { Target } from './light.ts';
import { Listing } from './listing.tsx';
import type { Shown } from './live.ts';
import { Panel } from './panel.tsx';
import { ProblemList, Problems } from './problems.tsx';
import { keepersOf } from './records.ts';
import { Sidebar } from './sidebar.tsx';
import { themeCss } from './theme.ts';
import type { Room } from './zoom.ts';

/**
 * The page: the sidebar, what the address names in the middle, and the panel when something is
 * chosen. It draws what it is shown and keeps only what the reader does: what is pointed at,
 * focused and chosen.
 */

export interface PageProps {
  shown: Shown;
  /** The room for the picture, when it is known before the page is laid out, as on the server. */
  room?: Room;
  /** What is chosen when the page opens. */
  initialSelection?: Selection | null;
}

/** The title of the browser's tab: what is shown, the model's name, and the tool's. */
export function pageTitle(shown: Shown): string {
  const { state, route } = shown;
  const view = state === null ? undefined : viewOf(state, route);
  const what = view?.title ?? (route.page === 'model' ? 'Model' : route.page === 'problems' ? 'Problems' : undefined);
  return [what, state?.name ?? undefined, 'seefore'].filter((part) => part !== undefined).join(' · ');
}

/** The connections of the model that start or end at a record. */
function connectionsOf(state: ViewerState, id: string): Set<string> {
  return new Set(state.model.connections.filter((connection) => connection.from === id || connection.to === id).map((connection) => connection.id));
}

/** The element of the picture, or of the list of what it passes through, that stands for a target, to give the focus back to. */
function elementOf(target: Selection): HTMLElement | null {
  if (target.kind === 'record') return null;
  if (target.kind === 'passed') return document.querySelector<HTMLElement>(`.passes-through button[data-id="${CSS.escape(target.id)}"]`);
  const kind = target.kind === 'box' ? 'node' : 'edge';
  return document.querySelector<HTMLElement>(`.react-flow__${kind}[data-id="${CSS.escape(target.id)}"]`);
}

export function Page({ shown, room, initialSelection = null }: PageProps) {
  const { state, route, picture, trouble } = shown;
  const [selection, setSelection] = useState<Selection | null>(initialSelection);
  const [pointed, setPointed] = useState<Target | null>(null);
  const [focused, setFocused] = useState<Target | null>(null);
  const [focusPanel, setFocusPanel] = useState(false);
  // Where the focus was when the keyboard opened the panel, to give it back there.
  const returnTo = useRef<HTMLElement | null>(null);

  // A selection whose record, box or arrow is gone from a new state is cleared.
  const kept = state === null ? null : keptSelection(state, route, selection);
  useEffect(() => {
    if (kept !== selection) setSelection(kept);
  }, [kept, selection]);

  // What is chosen now, for the listener of Escape, which is set once.
  const chosenNow = useRef(kept);
  chosenNow.current = kept;
  // Escape clears what is chosen and lit, and gives the focus back to where it was.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const was = chosenNow.current;
      const inPanel = document.activeElement?.closest('.panel') != null;
      setSelection(null);
      setFocused(null);
      setFocusPanel(false);
      if (!inPanel || was === null) return;
      const back = returnTo.current?.isConnected ? returnTo.current : elementOf(was);
      back?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Chooses something and opens its panel. From the keyboard the panel takes the focus. */
  const choose = (chosen: Selection, byKeyboard: boolean) => {
    returnTo.current = byKeyboard && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelection(chosen);
    setFocusPanel(byKeyboard);
  };
  const clear = () => {
    setSelection(null);
    setFocusPanel(false);
  };

  const view = state === null ? undefined : viewOf(state, route);
  // In another view nothing is pointed at or focused yet.
  const viewId = view?.id;
  useEffect(() => {
    setPointed(null);
    setFocused(null);
  }, [viewId]);
  const chosen = kept !== null && kept.kind !== 'record' ? kept : null;
  // A store that an app keeps is drawn at its app: chosen on a panel, it lights the app and the arrows of its own connections.
  const keeper = state !== null && kept?.kind === 'record' ? keepersOf(state.outline).get(kept.id) : undefined;
  const keptLit = state !== null && kept !== null && keeper !== undefined && view !== undefined && holdsBox(view, keeper) ? litByKept(view, keeper, connectionsOf(state, kept.id)) : null;
  const pointer = pointed ?? focused ?? chosen;
  const light: Light = { lit: view !== undefined && pointer !== null && holds(view, pointer) ? litBy(view, pointer) : keptLit, chosen };

  let main: ReactNode;
  if (state === null) {
    main = <p className="waiting">Reading the model…</p>;
  } else if (route.page === 'model') {
    main = <Listing state={state} onOpen={(id, byKeyboard) => choose({ kind: 'record', id }, byKeyboard)} />;
  } else if (route.page === 'problems') {
    main = <Problems problems={state.problems} />;
  } else if (view === undefined) {
    main = <NoViews state={state} />;
  } else if (picture === null || picture.view !== view.id) {
    main = <Waiting view={view} />;
  } else if ('failed' in picture) {
    main = <FailedView view={view} picture={picture} />;
  } else {
    main = (
      <LightContext.Provider value={light}>
        <Diagram
          key={view.id}
          view={view}
          drawn={picture}
          chosen={chosen}
          {...(room === undefined ? {} : { room })}
          onPoint={setPointed}
          onFocusTarget={setFocused}
          onChoose={choose}
          onClear={clear}
        />
      </LightContext.Provider>
    );
  }

  return (
    <div className={`page${kept !== null ? ' with-panel' : ''}`}>
      <style>{themeCss()}</style>
      <Sidebar state={state} route={route} />
      <main className="main">
        {trouble !== null && (
          <p className="trouble" role="status">
            {trouble}
          </p>
        )}
        {main}
      </main>
      {kept !== null && state !== null && (
        <Panel state={state} view={view} selection={kept} focus={focusPanel} onClose={clear} onOpen={(id, byKeyboard) => choose({ kind: 'record', id }, byKeyboard)} />
      )}
    </div>
  );
}

/** The head of a view with no picture to draw: its title, over what stands in the picture's place. */
function ViewHead({ view }: { view: View }) {
  return (
    <header className="diagram-head">
      <div className="diagram-top">
        <h1 className="view-title">{view.title}</h1>
      </div>
    </header>
  );
}

/** A view whose picture is being laid out. */
function Waiting({ view }: { view: View }) {
  return (
    <div className="diagram">
      <ViewHead view={view} />
      <p className="waiting" role="status">
        Laying out the view…
      </p>
    </div>
  );
}

/** A view whose layout failed: its message in place of the picture. */
function FailedView({ view, picture }: { view: View; picture: Failed }) {
  return (
    <div className="diagram">
      <ViewHead view={view} />
      <div className="failed" role="alert">
        <p>{picture.failed.message}</p>
        <p>The other views still draw.</p>
      </div>
    </div>
  );
}

/** What stands in place of the views when there are none: why, and what the page waits for. */
function NoViews({ state }: { state: ViewerState }) {
  if (!state.available && state.problems.length > 0) {
    return (
      <article className="no-views">
        <h1>No views</h1>
        <p>{`The marker file of ${state.directory} cannot be read, so there is no model to draw. Once it is mended the page takes the model in.`}</p>
        <ProblemList problems={state.problems} />
      </article>
    );
  }
  if (!state.available) {
    return (
      <article className="no-views">
        <h1>The directory is gone</h1>
        <p>{`${state.directory} is not there any more. The page waits for it to come back, and draws it again then.`}</p>
      </article>
    );
  }
  return (
    <article className="no-views">
      <h1>No views</h1>
      <p>The model has no system yet, so there is nothing to draw. A view is drawn for every system.</p>
    </article>
  );
}
