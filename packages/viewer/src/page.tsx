import type { Failed, View, ViewerState } from '@seefore/core';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Route } from './address.ts';
import { Diagram, GoneLine, LAYING, LayingLine, LightContext, NOTHING_TO_DRAW } from './diagram.tsx';
import type { Light, Reading } from './diagram.tsx';
import { keptSelection, settingFor } from './follow.ts';
import type { Selection } from './follow.ts';
import { holdsBox, litBy, litByKept, speakingOf } from './light.ts';
import type { Act, Pointed } from './light.ts';
import { Listing } from './listing.tsx';
import type { Shown } from './live.ts';
import { Panel } from './panel.tsx';
import { ProblemList, Problems } from './problems.tsx';
import { keptReading, readingOf } from './reading.ts';
import { keepersOf } from './records.ts';
import { Sidebar } from './sidebar.tsx';
import { themeCss } from './theme.ts';
import type { Room } from './zoom.ts';

/**
 * The page: the sidebar with its two controls, what the address names in the middle, and the
 * panel when something is chosen. It draws what it is shown and keeps only what the reader does:
 * what is pointed at, focused and chosen.
 */

export interface PageProps {
  shown: Shown;
  /** The room for the picture, when it is known before the page is laid out, as on the server. */
  room?: Room;
  /** What is chosen when the page opens. */
  initialSelection?: Selection | null;
  /** Opens what the reader chose with a control or a button: a setting, in one step. */
  onGo?(route: Route): void;
}

/** The view drawn, when the page shows a view. */
function viewShown(shown: Shown): View | undefined {
  return shown.route.page === 'view' ? shown.shot?.view : undefined;
}

/** The title of the browser's tab: what is shown, the model's name, and the tool's. */
export function pageTitle(shown: Shown): string {
  const { state, route } = shown;
  const what = viewShown(shown)?.title ?? (route.page === 'model' ? 'Model' : route.page === 'problems' ? 'Problems' : undefined);
  return [what, state?.name ?? undefined, 'seefore'].filter((part) => part !== undefined).join(' · ');
}

/** The connections of the model that start or end at a record. */
function connectionsOf(state: ViewerState, id: string): Set<string> {
  return new Set(state.model.connections.filter((connection) => connection.from === id || connection.to === id).map((connection) => connection.id));
}

/** How far a finger may move between touching and lifting for it to be a tap, and not a drag, in CSS pixels. */
const TAP_SLOP = 10;

/** The element of the picture, or of the list of what it passes through, that stands for a target, to give the focus back to. */
function elementOf(target: Selection): HTMLElement | null {
  if (target.kind === 'record') return null;
  if (target.kind === 'passed') return document.querySelector<HTMLElement>(`.passes-through button[data-id="${CSS.escape(target.id)}"]`);
  const kind = target.kind === 'box' ? 'node' : 'edge';
  return document.querySelector<HTMLElement>(`.react-flow__${kind}[data-id="${CSS.escape(target.id)}"]`);
}

/** Nothing to do, for a page drawn where nothing can be chosen. */
function stay(): void {}

export function Page({ shown, room, initialSelection = null, onGo = stay }: PageProps) {
  const { state, route, shot, laying, gone, setting, trouble } = shown;
  const [selection, setSelection] = useState<Selection | null>(initialSelection);
  // What the reader last pointed at, moved the focus to and tapped, each with when.
  const [pointed, setPointed] = useState<Act | null>(null);
  const [focused, setFocused] = useState<Act | null>(null);
  const [tapped, setTapped] = useState<Act | null>(null);
  const acts = useRef(0);
  // The tap that lit a line of the legend, which is not a tap elsewhere.
  const tapping = useRef<PointerEvent | null>(null);
  const [focusPanel, setFocusPanel] = useState(false);
  // Where the focus was when the keyboard opened the panel, to give it back there.
  const returnTo = useRef<HTMLElement | null>(null);

  /** Something the reader did to a target, stamped with when, or nothing. */
  const act = (target: Pointed | null, whole: boolean): Act | null => (target === null ? null : { target, at: ++acts.current, whole });
  const point = (target: Pointed | null) => setPointed(act(target, false));
  const focus = (target: Pointed | null, visible: boolean) => setFocused(act(target, visible));
  const tap = (target: Pointed, event: PointerEvent) => {
    tapping.current = event;
    setTapped(act(target, true));
  };

  // A tap of a finger anywhere but on the line it lit takes that light away. A drag is no tap.
  useEffect(() => {
    const down = new Map<number, { x: number; y: number }>();
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') down.set(event.pointerId, { x: event.clientX, y: event.clientY });
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const from = down.get(event.pointerId);
      down.delete(event.pointerId);
      if (from === undefined || Math.hypot(event.clientX - from.x, event.clientY - from.y) > TAP_SLOP) return;
      if (event !== tapping.current) setTapped(null);
    };
    const onCancel = (event: PointerEvent) => down.delete(event.pointerId);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  const view = viewShown(shown);
  // A selection whose record, box or arrow is gone from a new state or a new picture is cleared.
  const kept = state === null ? null : keptSelection(state, view, selection);
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
      setTapped(null);
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
  /** Makes a box the scope, from its panel: at the present depth, or at its own when that is deeper. */
  const scopeTo = (id: string) => {
    const next = state === null ? undefined : settingFor(state, id, setting.depth);
    if (next !== undefined) onGo({ page: 'view', setting: next });
  };

  // In another picture nothing is pointed at, focused or tapped yet.
  const viewId = view?.id;
  useEffect(() => {
    setPointed(null);
    setFocused(null);
    setTapped(null);
  }, [viewId]);
  const chosen = kept !== null && kept.kind !== 'record' ? kept : null;
  // A store that an app keeps is drawn at its app: chosen on a panel, it lights the app and the arrows of its own connections, and says its name and its app.
  const keeper = state !== null && kept?.kind === 'record' ? keepersOf(state.outline).get(kept.id) : undefined;
  const keptHere = state !== null && kept !== null && keeper !== undefined && view !== undefined && holdsBox(view, keeper);
  const keptLit = keptHere ? litByKept(view, keeper, connectionsOf(state, kept.id)) : null;
  // Of what is pointed at, focused and tapped the latest the view holds wins, and over what is chosen, which lights and speaks again once they leave.
  const speaking = view === undefined ? null : speakingOf(view, [pointed, focused, tapped], chosen);
  const light: Light = { lit: view !== undefined && speaking !== null ? litBy(view, speaking.target) : keptLit, chosen };
  const reading: Reading =
    view !== undefined && speaking !== null
      ? { words: readingOf(view, speaking.target), whole: speaking.whole }
      : { words: keptHere ? keptReading(state, kept.id, keeper) : '', whole: false };

  let main: ReactNode;
  if (state === null) {
    main = <p className="waiting">Reading the model…</p>;
  } else if (route.page === 'model') {
    main = <Listing state={state} onOpen={(id, byKeyboard) => choose({ kind: 'record', id }, byKeyboard)} />;
  } else if (route.page === 'problems') {
    main = <Problems problems={state.problems} c4={state.c4} />;
  } else if (route.page === 'start') {
    main = <NoModel state={state} />;
  } else if (shot === null || view === undefined) {
    main = (
      <p className="waiting" role="status">
        {LAYING}
      </p>
    );
  } else if ('failed' in shot.picture) {
    main = <FailedView view={view} picture={shot.picture} laying={laying} gone={gone} />;
  } else if (view.boxes.length === 0 && view.boundaries.length === 0) {
    main = <EmptyView view={view} laying={laying} gone={gone} />;
  } else {
    main = (
      <LightContext.Provider value={light}>
        <Diagram
          view={view}
          drawn={shot.picture}
          chosen={chosen}
          speaking={speaking?.target ?? null}
          reading={reading}
          laying={laying}
          gone={gone}
          {...(room === undefined ? {} : { room })}
          onPoint={point}
          onFocusTarget={focus}
          onTap={tap}
          onChoose={choose}
          onClear={clear}
        />
      </LightContext.Provider>
    );
  }

  return (
    <div className={`page${kept !== null ? ' with-panel' : ''}`}>
      <style>{themeCss()}</style>
      <Sidebar state={state} route={route} setting={setting} onGo={onGo} />
      <main className="main">
        {trouble !== null && (
          <p className="trouble" role="status">
            {trouble}
          </p>
        )}
        {main}
      </main>
      {kept !== null && state !== null && (
        <Panel
          state={state}
          view={view}
          selection={kept}
          focus={focusPanel}
          present={setting.scope}
          onClose={clear}
          onOpen={(id, byKeyboard) => choose({ kind: 'record', id }, byKeyboard)}
          onScope={scopeTo}
        />
      )}
    </div>
  );
}

/** The head of a view with no picture to draw: its title, the line for a box gone, over what stands in the picture's place, and whether another is laid out. */
function ViewHead({ view, laying, gone }: { view: View; laying: boolean; gone: boolean }) {
  return (
    <header className="diagram-head">
      <div className="diagram-top">
        <h1 className="view-title">{view.title}</h1>
      </div>
      <GoneLine gone={gone} />
      <LayingLine laying={laying} />
    </header>
  );
}

/**
 * A view whose layout failed: its message in place of the picture. The layout's message says
 * that the other views still draw, so the page does not say it again.
 */
function FailedView({ view, picture, laying, gone }: { view: View; picture: Failed; laying: boolean; gone: boolean }) {
  return (
    <div className="diagram">
      <ViewHead view={view} laying={laying} gone={gone} />
      <div className="failed" role="alert">
        <p>{picture.failed.message}</p>
      </div>
    </div>
  );
}

/** A view with nothing in it, as everything is in a model with no person and no system. */
function EmptyView({ view, laying, gone }: { view: View; laying: boolean; gone: boolean }) {
  return (
    <div className="diagram">
      <ViewHead view={view} laying={laying} gone={gone} />
      <p className="nothing">{NOTHING_TO_DRAW}</p>
    </div>
  );
}

/** What stands in place of the picture when there is no model: why, and what the page waits for. */
function NoModel({ state }: { state: ViewerState }) {
  if (state.problems.length > 0 && state.problems[0]?.code !== 'directory-gone') {
    return (
      <article className="no-views">
        <h1>No views</h1>
        <p>{`The marker file of ${state.directory} cannot be read, so there is no model to draw. Once it is mended the page takes the model in.`}</p>
        <ProblemList problems={state.problems} />
      </article>
    );
  }
  return (
    <article className="no-views">
      <h1>The directory is gone</h1>
      <p>{`${state.directory} is not there any more. The page waits for it to come back, and draws it again then.`}</p>
    </article>
  );
}
