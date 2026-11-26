import { useEffect } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import type { Verb } from '../model/changes.ts';

/** Class names joined by spaces, those that are not there left out. */
function join(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** The page's title in the browser: "Models · seefore". */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · seefore`;
  }, [title]);
}

/** The panel: a translucent surface with a hairline and an inner highlight. `lift` adds a drop shadow. */
export function Panel({ lift, padded, className, ...props }: ComponentProps<'div'> & { lift?: boolean; padded?: boolean }) {
  return <div className={join('panel', lift && 'panel-lift', padded && 'panel-padded', className)} {...props} />;
}

/** A text panel: the paragraphs of a text, split at its blank lines. */
export function TextPanel({ children }: { children: string }) {
  const paragraphs = children
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return (
    <Panel padded>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="panel-text">
          {paragraph}
        </p>
      ))}
    </Panel>
  );
}

/** A section: its quiet label, then its panel. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section" aria-label={title}>
      <h2 className="section-label">{title}</h2>
      {children}
    </section>
  );
}

/** The body of a page: sections stacked with one gap. */
export function SectionStack({ children }: { children: ReactNode }) {
  return <div className="section-stack">{children}</div>;
}

/** The tone of a state, beside the colour of a kind: danger, warning, caution, success or info. */
export type Tone = 'danger' | 'warning' | 'caution' | 'success' | 'info';

/** The small tinted square that leads a row, in the colour of a kind of thing or the tone of a state, or neutral. */
export function IconTile({ icon: Icon, kind, tone, size }: { icon: LucideIcon; kind?: string; tone?: Tone; size?: 'sm' | 'lg' }) {
  return (
    <span className={join('tile', size && `tile-${size}`, kind && `kind-${kind}`, tone && `tone-${tone}`)} aria-hidden="true">
      <Icon />
    </span>
  );
}

/** A pill: a mark such as a type or "External", in the colour of a kind of thing or the tone of a state, or neutral. */
export function Pill({ kind, tone, size, children }: { kind?: string; tone?: Tone; size?: 'xs'; children: ReactNode }) {
  return <span className={join('pill', size && `pill-${size}`, kind && `kind-${kind}`, tone && `tone-${tone}`)}>{children}</span>;
}

/** What a change does to a record, as its pill says it. */
const MARK: Record<Verb, { word: string; tone: Tone }> = {
  add: { word: 'Added', tone: 'success' },
  update: { word: 'Updated', tone: 'caution' },
  remove: { word: 'Removed', tone: 'danger' },
};

/** The pill of what a change does to a record or to a step: Added in green, Updated in yellow, Removed in red. */
export function MarkPill({ verb }: { verb: Verb }) {
  return <Pill tone={MARK[verb].tone}>{MARK[verb].word}</Pill>;
}

/** Label and value rows in a panel: a record's facts. */
export function Facts({ rows }: { rows: readonly { label: string; value: ReactNode }[] }) {
  return (
    <Panel>
      <dl className="facts">
        {rows.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** The heading row above rows that carry cells; the grid columns are shared with the rows. */
export function RowListHeading({ columns, cols }: { columns: readonly string[]; cols: string }) {
  return (
    <div className="row-list-heading" style={{ gridTemplateColumns: cols }} aria-hidden="true">
      {columns.map((column) => (
        <span key={column}>{column}</span>
      ))}
    </div>
  );
}

/** A list of rows inside a panel. */
export function RowList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className="row-list" aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * A row of a list: its cells on a grid shared with the heading row, the first holding a small
 * tile, the name and its marks. The whole row is a link. Each level of depth indents it by a tile.
 * What is given as `below` stands under the link, in the same row, and may hold links of its own.
 */
export function GridRow({
  to,
  cols,
  tile,
  name,
  marks,
  cells = [],
  depth = 0,
  strong,
  below,
}: {
  to: string;
  cols: string;
  tile: ReactNode;
  name: ReactNode;
  marks?: ReactNode;
  cells?: readonly ReactNode[];
  depth?: number;
  strong?: boolean;
  below?: ReactNode;
}) {
  return (
    <li className="row row-grid-item">
      <Link to={to} className="row-grid" style={{ gridTemplateColumns: cols }}>
        <span className="row-grid-name" style={depth > 0 ? { paddingLeft: depth * 26 } : undefined}>
          {tile}
          <span className={join('row-name row-name-ellipsis', strong && 'row-name-strong')}>{name}</span>
          {marks}
        </span>
        {cells.map((cell, index) => (
          <span key={index} className="row-cell">
            {cell}
          </span>
        ))}
      </Link>
      {below}
    </li>
  );
}

/** How a button looks: ghost is see-through, outline has a hairline; an icon button holds one icon, a small one is shorter. */
type Look = { variant?: 'ghost' | 'outline'; size?: 'icon' | 'sm' };
const buttonClass = ({ variant, size }: Look, className?: string): string =>
  join('button', variant && `button-${variant}`, size && `button-${size}`, className);

/** A button, a pill. */
export function Button({ variant, size, className, ...props }: ComponentProps<'button'> & Look) {
  return <button type="button" className={buttonClass({ variant, size }, className)} {...props} />;
}

/** A link to a page that looks like a button. */
export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & Look) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}

/** A pill of controls on glass, such as the top bar's arrows. */
export function GlassGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div className={join('glass-group', className)} {...props} />;
}

/** The 34px title a page opens with. */
export function LargeTitle({ children }: { children: ReactNode }) {
  return <h1 className="large-title">{children}</h1>;
}

/** A panel that says what is not there yet, in one title and one line. Bare, it has no panel. */
export function EmptyState({ title, bare, children }: { title: ReactNode; bare?: boolean; children?: ReactNode }) {
  const state = (
    <div className="empty-state">
      <h2>{title}</h2>
      {children !== undefined && <p>{children}</p>}
    </div>
  );
  return bare ? state : <div className="panel">{state}</div>;
}

/** The hatched, rounded field a diagram is drawn on. */
export function CanvasFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="canvas-frame" aria-label={label}>
      {children}
    </section>
  );
}
