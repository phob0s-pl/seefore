import { Fragment, useEffect } from 'react';
import { Link, useLocation, useOutletContext } from 'react-router-dom';
import type { Band, ContextLine } from '../model/context.ts';
import { KindTile } from './models.tsx';
import type { ModelState } from './shell.tsx';
import { EmptyState, LargeTitle, Panel, Pill, useTitle } from './ui.tsx';

/** What each kind of line means, beside its word over its column. */
const KINDS = [
  { key: 'must', word: 'Must', means: 'A design that goes against one of these is wrong.' },
  { key: 'prefer', word: 'Prefer', means: 'Each decides between allowed designs, and may yield.' },
] as const;

/** The id an address names after `#`, or none. */
function idInHash(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return '';
  }
}

/**
 * The page of the context, `/context`: under its title a band for each system that has lines,
 * the team's own first, each with what binds it and what it prefers, side by side, and why.
 * While the model is read, and when it cannot be, it says so as the rules do.
 */
export function ContextPage() {
  useTitle('Context');
  const { context, failed } = useOutletContext<ModelState>();
  if (failed !== undefined) return <p className="page-line failed">{failed}</p>;
  if (context === undefined) return <p className="page-line">Reading…</p>;
  return (
    <>
      <LargeTitle>Context</LargeTitle>
      {context.bands.length === 0 ? (
        <EmptyState title="No context yet.">
          Write <code>context</code> in a system's file in <code>systems/</code>: lines of <code>must</code> or <code>prefer</code>, each with its <code>why</code>.
        </EmptyState>
      ) : (
        <Bands bands={context.bands} />
      )}
    </>
  );
}

/**
 * The bands, and with more than one the names that lead to each. The band the address names is
 * brought into view once the bands are drawn, and again at each link to it, also at a link to
 * the band the address already names: the address is the same, but the place is new.
 */
function Bands({ bands }: { bands: readonly Band[] }) {
  const { hash, key } = useLocation();
  useEffect(() => {
    const id = idInHash(hash);
    // Among the bands only: a system may have the id of another part of the window.
    if (id !== '') document.querySelector(`.context-band[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' });
  }, [hash, key]);
  return (
    <>
      {bands.length > 1 && (
        <nav className="context-index" aria-label="Systems">
          {bands.map((band, index) => (
            <Fragment key={band.id}>
              {index > 0 && <span aria-hidden="true"> · </span>}
              <Link to={`/context#${band.id}`}>{band.name}</Link>
            </Fragment>
          ))}
        </nav>
      )}
      <div className="context-bands">
        {bands.map((band) => (
          <BandOf key={band.id} band={band} />
        ))}
      </div>
    </>
  );
}

/** One system's band: its tile and name, then a column for each kind it has lines of, Must first. */
function BandOf({ band }: { band: Band }) {
  return (
    <section id={band.id} className="context-band" aria-label={band.name}>
      <header className="context-band-row">
        <KindTile kind="systems" />
        <h2 className="context-band-name">
          <Link to={`/models/${band.id}`}>{band.name}</Link>
        </h2>
        {band.external && <Pill>External</Pill>}
      </header>
      <div className="context-columns">
        {KINDS.map((kind) => (band[kind.key].length > 0 ? <Column key={kind.key} word={kind.word} means={kind.means} lines={band[kind.key]} /> : null))}
      </div>
    </section>
  );
}

/** A column: its word and what it means, then its lines in one panel, in the order of the file. */
function Column({ word, means, lines }: { word: string; means: string; lines: readonly ContextLine[] }) {
  return (
    <section className="context-column" aria-label={word}>
      <header className="context-heading">
        <h3>{word}</h3>
        <p>{means}</p>
      </header>
      <Panel>
        <ul className="context-lines">
          {lines.map((line, index) => (
            <li key={index} className="context-line">
              <p className="context-sentence">{line.sentence}</p>
              {line.reason !== undefined && <p className="context-reason">{line.reason}</p>}
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}
