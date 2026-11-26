import { createPortal } from 'react-dom';
import { OctagonAlert, PencilRuler, StickyNote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { Change } from '../model/changes.ts';
import type { About, Severity, Status } from '../model/review.ts';
import { TouchedTile } from './change-record.tsx';
import { Missing } from './models.tsx';
import type { ModelState } from './shell.tsx';
import { GridRow, IconTile, Panel, Pill, RowList, Section, SectionStack, TextPanel, useTitle } from './ui.tsx';
import type { Tone } from './ui.tsx';

/**
 * A point of a change's review, `/changes/<change>/review/<point>`: its name with the tile and
 * the pill of its severity and the pill of its status, then what was found, what is recommended,
 * what it is about and what was said at each change of its status. The model has made out every
 * address of `about`: the page shows its name and follows where it leads.
 */

const LIST = { to: '/changes', title: 'Changes' };

/** Each severity: the icon of its tile, the word of its pill, and a block's red. A tile has no colour. */
const SEVERITY: Record<Severity, { icon: LucideIcon; word: string; tone?: Tone }> = {
  block: { icon: OctagonAlert, word: 'Block', tone: 'danger' },
  note: { icon: StickyNote, word: 'Note' },
};

/** Each status: the word of its pill and its colour. An open point has none; a settled one has the blue of what the person said. */
const STATUS: Record<Status, { word: string; tone?: Tone }> = {
  open: { word: 'Open' },
  fixed: { word: 'Fixed', tone: 'caution' },
  declined: { word: 'Declined', tone: 'warning' },
  closed: { word: 'Closed', tone: 'success' },
  reopened: { word: 'Reopened', tone: 'danger' },
  settled: { word: 'Settled', tone: 'info' },
};

/** The tile of a point: its icon says whether it is a block or a note. */
export function SeverityTile({ severity, size }: { severity: Severity; size: 'sm' | 'lg' }) {
  return <IconTile icon={SEVERITY[severity].icon} size={size} />;
}

/** The pill of a point's status. */
export function StatusPill({ status }: { status: Status }) {
  return <Pill tone={STATUS[status].tone}>{STATUS[status].word}</Pill>;
}

/** The page of one point. An id that names no change, or no point of its review, is missing. */
export function ReviewPointPage() {
  const { id = '', point: pointId = '' } = useParams();
  const { changes, failed, slots } = useOutletContext<ModelState>();
  const change = changes?.change(id);
  const point = change !== undefined ? changes?.review(id)?.points.find((each) => each.id === pointId) : undefined;
  useTitle(point?.name ?? change?.name ?? 'Changes');
  if (failed !== undefined) return <p className="page-line failed">{failed}</p>;
  if (changes === undefined) return <p className="page-line">Reading…</p>;
  if (change === undefined) return <Missing list={LIST} />;
  if (point === undefined) return <Missing list={{ to: `/changes/${change.id}/review`, title: 'Review' }} />;
  const crumbs = slots?.crumbs ?? null;
  const severity = SEVERITY[point.severity];
  return (
    <>
      {crumbs !== null && createPortal(<Crumbs change={change} name={point.name} />, crumbs)}
      {/* A point's name is a sentence: its title is set as a line of context's is. */}
      <header className="record-title context-title">
        <SeverityTile severity={point.severity} size="lg" />
        <h1 className="large-title">{point.name}</h1>
        <span className="record-marks">
          <Pill tone={severity.tone}>{severity.word}</Pill>
          <StatusPill status={point.status} />
        </span>
      </header>
      <SectionStack>
        {point.finding !== undefined && (
          <Section title="Finding">
            <TextPanel>{point.finding}</TextPanel>
          </Section>
        )}
        {point.recommendation !== undefined && (
          <Section title="Recommendation">
            <TextPanel>{point.recommendation}</TextPanel>
          </Section>
        )}
        {point.about.length > 0 && (
          <Section title="About">
            <Panel className="review-about">
              <RowList label="About">
                {point.about.map((about) => (
                  <AboutRow key={about.address} about={about} />
                ))}
              </RowList>
            </Panel>
          </Section>
        )}
        {point.comments.length > 0 && (
          <Section title="Comments">
            <Panel>
              <ul className="review-comments">
                {point.comments.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </Panel>
          </Section>
        )}
      </SectionStack>
    </>
  );
}

/** The way back, in the top bar: the change's name, to Need; "Review", to the list; the point's name. */
function Crumbs({ change, name }: { change: Change; name: string }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb change-crumbs">
      <Link to={`/changes/${change.id}`}>{change.name}</Link>
      <span className="breadcrumb-gap" aria-hidden="true">
        /
      </span>
      <Link to={`/changes/${change.id}/review`}>Review</Link>
      <span className="breadcrumb-gap" aria-hidden="true">
        /
      </span>
      <span className="breadcrumb-here" aria-current="page">
        {name}
      </span>
    </nav>
  );
}

/** A record by its name alone. */
const RECORD_COLS = 'minmax(0, 1fr)';
/** A step: the name of its flow, and the step's own words. */
const STEP_COLS = 'minmax(0, 1fr) minmax(0, 1.5fr)';

/**
 * A row of About: a record by its name with the tile of its kind, a step by its flow's name and
 * its own words, the need as "Need". It leads where the model says; with nowhere to lead it is a
 * row alone, with the same look, and what names nothing stands as written.
 */
function AboutRow({ about }: { about: About }) {
  // The need is no record: it bears the change's icon.
  const tile = about.record !== undefined ? <TouchedTile folder={about.record.kind} record={about.record} size="sm" /> : about.need === true ? <IconTile icon={PencilRuler} size="sm" /> : null;
  const cols = about.step !== undefined ? STEP_COLS : RECORD_COLS;
  const cells = about.step !== undefined ? [about.step] : [];
  if (about.to !== undefined) return <GridRow to={about.to} cols={cols} tile={tile} name={about.label} cells={cells} />;
  return (
    <li className="row row-grid-item change-row-still">
      <div className="row-grid" style={{ gridTemplateColumns: cols }}>
        <span className="row-grid-name">
          {tile}
          <span className={`row-name row-name-ellipsis${about.record === undefined ? ' dangling' : ''}`}>{about.label}</span>
        </span>
        {cells.map((cell, index) => (
          <span key={index} className="row-cell">
            {cell}
          </span>
        ))}
      </div>
    </li>
  );
}
