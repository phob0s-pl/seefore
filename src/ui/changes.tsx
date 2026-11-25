import { ArrowLeft, PencilRuler } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useOutletContext, useParams } from 'react-router-dom';
import type { Change, Changes } from '../model/changes.ts';
import { Missing } from './models.tsx';
import type { ModelState } from './shell.tsx';
import { EmptyState, GridRow, IconTile, LargeTitle, Panel, RowList, Section, SectionStack, TextPanel, useTitle } from './ui.tsx';

/** The name alone. */
const COLS = 'minmax(0, 1fr)';

const LIST = { to: '/changes', title: 'Changes' };

/** A section of a change. */
export type Section = 'need' | 'records';

/** The sections of a change, in their order: each with its word, and the end of its address after the change's. */
const SECTIONS: readonly { section: Section; word: string; path: string }[] = [
  { section: 'need', word: 'Need', path: '' },
  { section: 'records', word: 'Records', path: '/records' },
];

/** What a page of the changes shows while the model is read, or why it cannot be. */
function useChanges(): { changes?: Changes; line?: ReactNode } {
  const { changes, failed } = useOutletContext<ModelState>();
  if (failed !== undefined) return { line: <p className="page-line failed">{failed}</p> };
  if (changes === undefined) return { line: <p className="page-line">Reading…</p> };
  return { changes };
}

/** The list of the changes, `/changes`: a row for each, by name, that leads to the change. */
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
              <GridRow key={change.id} to={`/changes/${change.id}`} cols={COLS} tile={<IconTile icon={PencilRuler} size="sm" />} name={change.name} />
            ))}
          </RowList>
        </Panel>
      )}
    </>
  );
}

/**
 * What was asked for: the prompt as prose, and under it what the person answered when asked,
 * a row a line. A change with no answers has no section for them.
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
    </SectionStack>
  );
}

/**
 * The page of a section of a change, under the change's name as its title: `/changes/<id>` for
 * Need, which shows what was asked for, and `/changes/<id>/records` for Records, for now only a
 * frame. The sidebar says which section is open. An id that names no change is missing.
 */
export function ChangePage({ section }: { section: Section }) {
  const { id = '' } = useParams();
  const { changes, line } = useChanges();
  const change = changes?.change(id);
  useTitle(change?.name ?? 'Changes');
  if (changes === undefined) return line;
  if (change === undefined) return <Missing list={LIST} />;
  return (
    <section className="change-frame" aria-label={SECTIONS.find((each) => each.section === section)?.word}>
      <LargeTitle>{change.name}</LargeTitle>
      {section === 'need' && <Need change={change} />}
    </section>
  );
}

/**
 * The sidebar of a change, in place of the main one: an entry for each
 * section with its number in a circle, and at the foot the way back to the list.
 */
export function ChangeSidebar({ change }: { change: Change }) {
  return (
    <nav aria-label="Change sections" className="sidebar-navigation change-navigation">
      {SECTIONS.map((section, index) => (
        <NavLink key={section.section} to={`/changes/${change.id}${section.path}`} end className="nav-link change-section-link">
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
