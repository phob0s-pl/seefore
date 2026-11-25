import { Lock, Scale } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { Catalogue } from '../model/catalogue.ts';
import { countWords } from '../model/context.ts';
import type { Context, ContextKind, ContextLine, SystemContext } from '../model/context.ts';
import { KindTile, Missing, RecordLink } from './models.tsx';
import type { ModelState } from './shell.tsx';
import { EmptyState, Facts, GridRow, IconTile, LargeTitle, Panel, Pill, RowList, Section, SectionStack, TextPanel, useTitle } from './ui.tsx';

/** A line and, at its right, its kind. */
const COLS = 'minmax(0, 1fr) 150px';

const LIST = { to: '/context', title: 'Context' };

/** Each kind of line: its word, what it means, and the icon that leads its rows. */
const KINDS: Record<ContextKind, { word: string; means: string; icon: LucideIcon }> = {
  must: { word: 'Must', means: 'A design that goes against it is wrong.', icon: Lock },
  prefer: { word: 'Prefer', means: 'It decides between designs that are allowed, and may yield.', icon: Scale },
};

/** What a page of the context shows while the model is read, or why it cannot be. */
function useModel(): { context?: Context; catalogue?: Catalogue; crumbs?: HTMLElement | null; line?: ReactNode } {
  const { context, catalogue, failed, slots } = useOutletContext<ModelState>();
  if (failed !== undefined) return { line: <p className="page-line failed">{failed}</p> };
  if (context === undefined || catalogue === undefined) return { line: <p className="page-line">Reading…</p> };
  return { context, catalogue, crumbs: slots?.crumbs ?? null };
}

/** A line as a row of a list: its sentence, and its kind at the right. It leads to the line's page. */
function LineRow({ system, line, depth }: { system: SystemContext; line: ContextLine; depth?: number }) {
  const kind = KINDS[line.kind];
  return <GridRow to={`/context/${system.id}/${line.place}`} cols={COLS} tile={<IconTile icon={kind.icon} size="sm" />} name={line.sentence} cells={[<Pill>{kind.word}</Pill>]} depth={depth} />;
}

/**
 * The list of the context, `/context`: each system that has lines, the team's own first, and
 * under it its lines, those that bind first. A line leads to its page, where its reason stands.
 */
export function ContextList() {
  useTitle('Context');
  const { context, catalogue, line } = useModel();
  if (context === undefined || catalogue === undefined) return line;
  return (
    <>
      <LargeTitle>Context</LargeTitle>
      {context.systems.length === 0 ? (
        <EmptyState title="No context yet.">
          Write <code>context</code> in a system's file in <code>systems/</code>: lines of <code>must</code> or <code>prefer</code>, each with its <code>why</code>.
        </EmptyState>
      ) : (
        <Panel lift className="context-list">
          <RowList label="Context">
            {context.systems.map((system) => (
              <Fragment key={system.id}>
                <GridRow
                  to={`/models/${system.id}`}
                  cols={COLS}
                  tile={<KindTile kind="systems" size="sm" />}
                  name={system.name}
                  marks={system.external && <Pill size="xs">External</Pill>}
                  cells={[countWords(system)]}
                  strong
                />
                {system.lines.map((each) => (
                  <LineRow key={each.place} system={system} line={each} depth={1} />
                ))}
              </Fragment>
            ))}
          </RowList>
        </Panel>
      )}
    </>
  );
}

/** The way back, in the top bar: "Context / <the sentence>". */
function Crumbs({ title }: { title: string }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <Link to="/context">Context</Link>
      <span className="breadcrumb-gap" aria-hidden="true">
        /
      </span>
      <span className="breadcrumb-here" aria-current="page">
        {title}
      </span>
    </nav>
  );
}

/**
 * The page of one line, `/context/<system>/<place>`: its sentence, its kind, why it stands, the
 * system it is of, and that system's other lines. An address that names no line is missing.
 */
export function ContextLinePage() {
  const { system: id = '', place = '' } = useParams();
  const { context, catalogue, crumbs, line: waiting } = useModel();
  const system = context?.system(id);
  const line = /^[1-9]\d*$/.test(place) ? context?.line(id, Number(place)) : undefined;
  useTitle(line?.sentence ?? 'Context');
  if (context === undefined || catalogue === undefined) return waiting;
  if (system === undefined || line === undefined) return <Missing list={LIST} />;
  const kind = KINDS[line.kind];
  const others = system.lines.filter((each) => each.place !== line.place);
  return (
    <>
      {crumbs != null && createPortal(<Crumbs title={line.sentence} />, crumbs)}
      <header className="record-title context-title">
        <IconTile icon={kind.icon} size="lg" />
        <h1 className="large-title">{line.sentence}</h1>
        <span className="record-marks">
          <Pill>{kind.word}</Pill>
        </span>
      </header>
      <SectionStack>
        {line.reason !== undefined && (
          <Section title="Why">
            <TextPanel>{line.reason}</TextPanel>
          </Section>
        )}
        <Facts
          rows={[
            { label: 'Kind', value: `${kind.word}. ${kind.means}` },
            {
              label: 'System',
              value: (
                <span className="context-system">
                  <RecordLink catalogue={catalogue} id={system.id} />
                  {system.external && <Pill size="xs">External</Pill>}
                </span>
              ),
            },
          ]}
        />
        {others.length > 0 && (
          <Section title={`The other lines of ${system.name}`}>
            <Panel className="context-list">
              <RowList label={`The other lines of ${system.name}`}>
                {others.map((each) => (
                  <LineRow key={each.place} system={system} line={each} />
                ))}
              </RowList>
            </Panel>
          </Section>
        )}
      </SectionStack>
    </>
  );
}
