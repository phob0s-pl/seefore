import { Lock, Scale } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { Catalogue } from '../model/catalogue.ts';
import { countWords } from '../model/context.ts';
import type { Context, ContextKind, ContextLine } from '../model/context.ts';
import { KindTile, Missing, RecordLink } from './models.tsx';
import type { ModelState } from './shell.tsx';
import { EmptyState, Facts, GridRow, IconTile, LargeTitle, Panel, Pill, RowList, Section, SectionStack, TextPanel, useTitle } from './ui.tsx';

/** A line and, at its right, its kind. */
const COLS = 'minmax(0, 1fr) 150px';

const LIST = { to: '/context', title: 'Context' };

/** Each kind of line: its word, what it means, and the icon that leads its rows. */
const KINDS: Record<ContextKind, { word: string; means: string; icon: LucideIcon }> = {
  must: {
    word: 'Must',
    means: 'A design that goes against it is wrong.',
    icon: Lock,
  },
  prefer: {
    word: 'Prefer',
    means: 'It decides between designs that are allowed, and may yield.',
    icon: Scale,
  },
};

/** What a page of the context shows while the model is read, or why it cannot be. */
function useModel(): {
  context?: Context;
  catalogue?: Catalogue;
  crumbs?: HTMLElement | null;
  line?: ReactNode;
} {
  const { context, catalogue, failed, slots } = useOutletContext<ModelState>();
  if (failed !== undefined) return { line: <p className="page-line failed">{failed}</p> };
  if (context === undefined || catalogue === undefined) return { line: <p className="page-line">Reading…</p> };
  return { context, catalogue, crumbs: slots?.crumbs ?? null };
}

/** A line as a row of a list: its sentence, and its kind at the right. It leads to the line's page. */
function LineRow({ line, depth }: { line: ContextLine; depth?: number }) {
  const kind = KINDS[line.kind];
  return <GridRow to={`/context/${line.id}`} cols={COLS} tile={<IconTile icon={kind.icon} size="sm" />} name={line.sentence} cells={[<Pill>{kind.word}</Pill>]} depth={depth} />;
}

/** Lines as rows in one panel. */
function Lines({ label, lines }: { label: string; lines: readonly ContextLine[] }) {
  return (
    <Panel lift className="context-list">
      <RowList label={label}>
        {lines.map((line) => (
          <LineRow key={line.id} line={line} />
        ))}
      </RowList>
    </Panel>
  );
}

/**
 * The list of the context, `/context`: first the lines about the whole model, then each system
 * that lines name, the team's own first, with its lines set in under it. In each group the
 * lines that bind stand first. A line leads to its page, where its reason stands.
 */
export function ContextList() {
  useTitle('Context');
  const { context, catalogue, line } = useModel();
  if (context === undefined || catalogue === undefined) return line;
  const { global, systems } = context;
  return (
    <>
      <LargeTitle>Context</LargeTitle>
      {global.length === 0 && systems.length === 0 ? (
        <EmptyState title="No context yet.">
          Write a line in <code>context/</code>: a file with <code>must</code> or <code>prefer</code> and its <code>why</code>, and <code>system</code> when it is about one system only.
        </EmptyState>
      ) : (
        <SectionStack>
          {global.length > 0 && (
            <Section title="Global">
              <Lines label="Global" lines={global} />
            </Section>
          )}
          {systems.length > 0 && (
            <Section title="Of one system">
              <Panel lift className="context-list">
                <RowList label="Of one system">
                  {systems.map((system) => (
                    <Fragment key={system.id}>
                      <GridRow
                        to={`/models/${system.id}`}
                        cols={COLS}
                        tile={<KindTile kind="systems" size="sm" />}
                        name={system.known ? system.name : <span className="dangling">{system.id}</span>}
                        marks={system.external && <Pill size="xs">External</Pill>}
                        cells={[countWords(system.lines)]}
                        strong
                      />
                      {system.lines.map((each) => (
                        <LineRow key={each.id} line={each} depth={1} />
                      ))}
                    </Fragment>
                  ))}
                </RowList>
              </Panel>
            </Section>
          )}
        </SectionStack>
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
 * The page of one line, `/context/<id>`: its sentence, its kind, why it stands, what it is
 * about, and the other lines of its group. An id that names no line is missing.
 */
export function ContextLinePage() {
  const { id = '' } = useParams();
  const { context, catalogue, crumbs, line: waiting } = useModel();
  const line = context?.line(id);
  useTitle(line?.sentence ?? 'Context');
  if (context === undefined || catalogue === undefined) return waiting;
  if (line === undefined) return <Missing list={LIST} />;
  const kind = KINDS[line.kind];
  const system = line.system !== undefined ? context.system(line.system) : undefined;
  const others = context.beside(line);
  const beside = system === undefined ? 'The other global lines' : `The other lines of ${system.name}`;
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
              label: 'About',
              value:
                system === undefined ? (
                  'Every system'
                ) : (
                  <span className="context-system">
                    <RecordLink catalogue={catalogue} id={system.id} />
                    {system.external && <Pill size="xs">External</Pill>}
                  </span>
                ),
            },
          ]}
        />
        {others.length > 0 && (
          <Section title={beside}>
            <Lines label={beside} lines={others} />
          </Section>
        )}
      </SectionStack>
    </>
  );
}
