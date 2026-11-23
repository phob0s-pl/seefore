import type { ComponentProps, ReactNode } from 'react';

/** Class names joined by spaces, those that are not there left out. */
function join(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** A button, a pill. Ghost is see-through; an icon button holds one icon. */
export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<'button'> & { variant?: 'ghost'; size?: 'icon' }) {
  return (
    <button
      type="button"
      className={join('button', variant && `button-${variant}`, size && `button-${size}`, className)}
      {...props}
    />
  );
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
