import { ArrowLeft, PencilRuler } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useOutletContext, useParams } from 'react-router-dom';
import type { Problem } from '../model/answer.ts';
import { addressInSystem, addressUnder } from '../model/catalogue.ts';
import type { Change, ChangeRow, Changes, Decision } from '../model/changes.ts';
import { TouchedName, TouchedTile, Unlaid } from './change-record.tsx';
import { SeverityTile, StatusPill } from './change-review.tsx';
import { Missing } from './models.tsx';
import type { ModelState } from './shell.tsx';
import { EmptyState, GridRow, IconTile, LargeTitle, MarkPill, Panel, Pill, RowList, Section, SectionStack, TextPanel, useTitle } from './ui.tsx';
import type { Tone } from './ui.tsx';

/** The name alone. */
const COLS = 'minmax(0, 1fr)';

/** The name, and the decision of a decided change at the right. */
const DECIDED_COLS = 'minmax(0, 1fr) 110px';

/** The name, and the mark at the right. */
const RECORD_COLS = 'minmax(0, 1fr) 110px';

/** A point's name, and its status at the right. */
const POINT_COLS = 'minmax(0, 1fr) 110px';

const LIST = { to: '/changes', title: 'Changes' };

/** A section of a change. */
export type Section = 'need' | 'records' | 'review';

/** The sections of a change, in their order: each with its word, and the end of its address after the change's. */
const SECTIONS: readonly { section: Section; word: string; path: string }[] = [
  { section: 'need', word: 'Need', path: '' },
  { section: 'records', word: 'Records', path: '/records' },
  { section: 'review', word: 'Review', path: '/review' },
];

/** Each decision: the word of its pill and its colour, those of a point closed and of one reopened. */
const DECISION: Record<Decision, { word: string; tone: Tone }> = {
  applied: { word: 'Applied', tone: 'success' },
  rejected: { word: 'Rejected', tone: 'danger' },
};

/** The pill of how a change is decided: Applied in green, Rejected in red. An open change has none. */
function DecisionPill({ status }: { status: Decision }) {
  return <Pill tone={DECISION[status].tone}>{DECISION[status].word}</Pill>;
}

/** What a page of the changes shows while the model is read, or why it cannot be. */
function useChanges(): { changes?: Changes; problems?: readonly Problem[]; line?: ReactNode } {
  const { answer, changes, failed } = useOutletContext<ModelState>();
  if (failed !== undefined) return { line: <p className="page-line failed">{failed}</p> };
  if (changes === undefined || answer === undefined) return { line: <p className="page-line">Reading…</p> };
  return { changes, problems: answer.problems };
}

/**
 * The list of the changes, `/changes`: a row for each, by name, that leads to the change. A
 * decided change bears the pill of its decision at the right of its row; an open one has its
 * name alone.
 */
export function ChangesList() {
  useTitle('Changes');
  const { changes, line } = useChanges();
  if (changes === undefined) return line;
  return (
    <>
      <LargeTitle>Changes</LargeTitle>
      {changes.all.length === 0 ? (
        <EmptyState title="No changes yet.">
          Write a change in <code>changes/</code>: its <code>name</code> and <code>prompt</code>, and the records it adds, updates and removes.
        </EmptyState>
      ) : (
        <Panel lift className="changes-list">
          <RowList label="Changes">
            {changes.all.map((change) => (
              <GridRow
                key={change.id}
                to={`/changes/${change.id}`}
                cols={change.status !== undefined ? DECIDED_COLS : COLS}
                tile={<IconTile icon={PencilRuler} size="sm" />}
                name={change.name}
                cells={change.status !== undefined ? [<DecisionPill status={change.status} />] : []}
              />
            ))}
          </RowList>
        </Panel>
      )}
    </>
  );
}

/**
 * What was asked for: the prompt as prose, and under it what the person answered when asked,
 * a row a line. A change with no answers has no section for them. Under them, for a rejected
 * change, why the person said no.
 */
function Need({ change }: { change: Change }) {
  return (
    <SectionStack>
      {change.prompt !== undefined && (
        <Section title="Prompt">
          <TextPanel>{change.prompt}</TextPanel>
        </Section>
      )}
      {change.given.length > 0 && (
        <Section title="Given">
          <Panel>
            <ul className="change-given">
              {change.given.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </Panel>
        </Section>
      )}
      {change.status === 'rejected' && change.why !== undefined && (
        <Section title="Why not">
          <TextPanel>{change.why}</TextPanel>
        </Section>
      )}
    </SectionStack>
  );
}

/**
 * A record of the Records page: the tile of its kind, its name, and the mark of what the change
 * does to it. It leads to the record under the change. A decided change is laid no more: its
 * record leads to its own page in the model, where the model has it today. For a change the
 * check could not lay, and a decided one's record the model does not have, it is a row alone,
 * with the same look.
 */
function RecordRow({ change, changes, row }: { change: Change; changes: Changes; row: ChangeRow }) {
  const tile = <TouchedTile folder={row.touched.folder} record={row.record} size="sm" />;
  const mark = <MarkPill verb={row.touched.verb} />;
  const today = change.status !== undefined ? changes.record(change.id, row.touched.path)?.today : undefined;
  const to = change.laid ? addressUnder(change.id, row.touched.path) : today !== undefined ? addressInSystem(today) : undefined;
  if (to !== undefined) return <GridRow to={to} cols={RECORD_COLS} tile={tile} name={<TouchedName row={row} />} cells={[mark]} />;
  return (
    <li className="row row-grid-item change-row-still">
      <div className="row-grid" style={{ gridTemplateColumns: RECORD_COLS }}>
        <span className="row-grid-name">
          {tile}
          <span className="row-name row-name-ellipsis">
            <TouchedName row={row} />
          </span>
        </span>
        <span className="row-cell">{mark}</span>
      </div>
    </li>
  );
}

/**
 * The records a change adds, updates and removes, in a section for each of the page's own lists
 * that it touches, each by name with its mark. A change that touches nothing is an input alone,
 * or, once it is decided, was decided with nothing in it. One the check could not lay is read
 * from its file, under the line that says why its rows lead nowhere; a decided one too, under
 * the line that says what the model has of its records.
 */
function Records({ change, changes }: { change: Change; changes: Changes }) {
  if (change.touched.length === 0 && change.status !== undefined) return <EmptyState title="No records.">This change is {change.status}: it adds, updates and removes nothing.</EmptyState>;
  if (change.touched.length === 0)
    return (
      <EmptyState title="No records yet.">
        This change is an input alone. Write what it adds, updates and removes under <code>add</code>, <code>update</code> and <code>remove</code> in <code>changes/{change.id}.yaml</code>.
      </EmptyState>
    );
  return (
    <SectionStack>
      {!change.laid && (
        <p className="change-note">
          <Unlaid change={change} />
        </p>
      )}
      {changes.sections(change.id).map((section) => (
        <Section key={section.title} title={section.title}>
          <Panel lift className="change-records">
            <RowList label={section.title}>
              {section.rows.map((row) => (
                <RecordRow key={row.touched.path} change={change} changes={changes} row={row} />
              ))}
            </RowList>
          </Panel>
        </Section>
      ))}
    </SectionStack>
  );
}

/**
 * The points of a change's review, a row a point in the order of the file: the tile of its
 * severity, its name, and its status at the right. A row leads to its point. A change with no
 * review, a review that found nothing, and a review whose file the check refuses each say so: a
 * refused file is no review, and the check's errors in it tell it from one that is not there.
 */
function ReviewList({ change, changes, problems }: { change: Change; changes: Changes; problems: readonly Problem[] }) {
  const review = changes.review(change.id);
  const file = `reviews/${change.id}.yaml`;
  if (review === undefined && problems.some((problem) => problem.file === file && problem.severity === 'error'))
    return (
      <EmptyState title="The review cannot be read.">
        <code>seefore check</code> says what is wrong in <code>{file}</code>.
      </EmptyState>
    );
  if (review === undefined)
    return (
      <EmptyState title="No review yet.">
        A review of this change is written in <code>{file}</code>.
      </EmptyState>
    );
  if (review.points.length === 0) return <EmptyState title="Nothing found.">The reader read the change and found nothing.</EmptyState>;
  return (
    <Panel lift className="review-list">
      <RowList label="Points">
        {review.points.map((point) => (
          <GridRow key={point.id} to={`/changes/${change.id}/review/${point.id}`} cols={POINT_COLS} tile={<SeverityTile severity={point.severity} size="sm" />} name={point.name} cells={[<StatusPill status={point.status} />]} />
        ))}
      </RowList>
    </Panel>
  );
}

/**
 * A change's name as the title of its pages. A decided change bears the pill of its decision
 * beside it, as a point bears its pills; an open change has its name alone.
 */
function ChangeTitle({ change }: { change: Change }) {
  if (change.status === undefined) return <LargeTitle>{change.name}</LargeTitle>;
  return (
    <header className="record-title">
      <h1 className="large-title">{change.name}</h1>
      <span className="record-marks">
        <DecisionPill status={change.status} />
      </span>
    </header>
  );
}

/**
 * The page of a section of a change, under the change's name as its title: `/changes/<id>` for
 * Need, which shows what was asked for, `/changes/<id>/records` for Records, the records it
 * touches, and `/changes/<id>/review` for Review, the points its reader found. The sidebar says
 * which section is open. An id that names no change is missing.
 */
export function ChangePage({ section }: { section: Section }) {
  const { id = '' } = useParams();
  const { changes, problems, line } = useChanges();
  const change = changes?.change(id);
  useTitle(change?.name ?? 'Changes');
  if (changes === undefined || problems === undefined) return line;
  if (change === undefined) return <Missing list={LIST} />;
  return (
    <section className="change-frame" aria-label={SECTIONS.find((each) => each.section === section)?.word}>
      <ChangeTitle change={change} />
      {section === 'need' ? <Need change={change} /> : section === 'records' ? <Records change={change} changes={changes} /> : <ReviewList change={change} changes={changes} problems={problems} />}
    </section>
  );
}

/**
 * The sidebar of a change, in place of the main one: an entry for each
 * section with its number in a circle, and at the foot the way back to the list. Records is
 * current on its list and on the page of each record under it, Review on its list and on the
 * page of each point.
 */
export function ChangeSidebar({ change }: { change: Change }) {
  return (
    <nav aria-label="Change sections" className="sidebar-navigation change-navigation">
      {SECTIONS.map((section, index) => (
        <NavLink key={section.section} to={`/changes/${change.id}${section.path}`} end={section.section === 'need'} className="nav-link change-section-link">
          <span className="change-section-number">{index + 1}</span>
          <span className="nav-text">{section.word}</span>
        </NavLink>
      ))}
      <div className="change-sidebar-foot">
        <Link to="/changes" className="change-all">
          <ArrowLeft aria-hidden="true" />
          <span>All changes</span>
        </Link>
      </div>
    </nav>
  );
}
