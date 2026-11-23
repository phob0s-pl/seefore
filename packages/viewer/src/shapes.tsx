import type { BoxFamily, BoxLook, LegendKey } from '@seefore/core';
import { RING_GAP, RING_RADIUS } from './flow.ts';
import { APP_RADIUS, EXTERNAL_TAB, INFRASTRUCTURE_POINT, OUTLINE, PERSON_RADIUS, QUEUE_LID, SCOPE_OUTLINE, STORE_LID, SYSTEM_GAP, SYSTEM_INNER, cylinder, hexagon, pipe, tab } from './geometry.ts';

/**
 * The shape of each look of a box, so that each is told apart with no colour at all: a person
 * very round, a system with a double line, an external system as a system with a solid tab in
 * its top left corner, an app with small round corners, a store an upright cylinder, a queue or
 * a topic a cylinder on its side, a piece of infrastructure pointed at both ends. Colour comes
 * from the style sheet, by family.
 */

/** A rectangle whose line has its middle this far in from the edge of the box. */
function inset(width: number, height: number, at: number) {
  return { x: at, y: at, width: Math.max(width - 2 * at, 0), height: Math.max(height - 2 * at, 0) };
}

/** The outline of a box of a look, at a size. `scope` draws the thicker line of the system a view is about. */
export function Shape({ look, scope, width, height }: { look: BoxLook; scope: boolean; width: number; height: number }) {
  switch (look) {
    case 'person':
      return <rect className="outline" {...inset(width, height, OUTLINE / 2)} rx={Math.min(PERSON_RADIUS, height / 3)} strokeWidth={OUTLINE} />;
    case 'app':
      return <rect className="outline" {...inset(width, height, OUTLINE / 2)} rx={APP_RADIUS} strokeWidth={OUTLINE} />;
    case 'store': {
      const { outline, rim } = cylinder(width, height, STORE_LID, OUTLINE);
      return (
        <>
          <path className="outline" d={outline} strokeWidth={OUTLINE} />
          <path className="outline rim" d={rim} strokeWidth={OUTLINE} />
        </>
      );
    }
    case 'queue-or-topic': {
      const { outline, rim } = pipe(width, height, QUEUE_LID, OUTLINE);
      return (
        <>
          <path className="outline" d={outline} strokeWidth={OUTLINE} />
          <path className="outline rim" d={rim} strokeWidth={OUTLINE} />
        </>
      );
    }
    case 'infrastructure':
      return <polygon className="outline" points={hexagon(width, height, INFRASTRUCTURE_POINT, OUTLINE)} strokeWidth={OUTLINE} strokeLinejoin="round" />;
    case 'system':
    case 'system-scope':
    case 'system-external': {
      const line = scope ? SCOPE_OUTLINE : OUTLINE;
      return (
        <>
          <rect className="outline" {...inset(width, height, line / 2)} strokeWidth={line} />
          <rect className="outline rim" {...inset(width, height, line + SYSTEM_GAP)} strokeWidth={SYSTEM_INNER} />
          {look === 'system-external' && <path className="tab" d={tab(EXTERNAL_TAB)} />}
        </>
      );
    }
  }
}

/** The width and height of a sample in the legend, in CSS pixels. */
export const SAMPLE = { width: 48, height: 30 } as const;

/** The family each look of the legend is drawn in, which gives its colour. */
const SAMPLE_FAMILY: Readonly<Record<BoxLook, BoxFamily>> = {
  person: 'people',
  'system-scope': 'systems',
  system: 'systems',
  'system-external': 'systems',
  app: 'apps',
  store: 'stores',
  'queue-or-topic': 'stores',
  infrastructure: 'infrastructure',
};

/** True when a key of the legend is a look of a box. */
function isLook(key: LegendKey): key is BoxLook {
  return key in SAMPLE_FAMILY;
}

/** The mark that a box carries for the connections between its copies. */
export const LOOP_MARK = '↻';

/** The mark that a box carries for the connections that pass through it. */
export const PASSING_MARK = '⇢';

/**
 * The sign in the mark an app carries for the stores it keeps: a small store, an upright
 * cylinder as a store's box is, so that the mark is told by its shape and not by its colour.
 */
export function StoreSign({ size = 12 }: { size?: number }) {
  const width = size * 0.8;
  const { outline, rim } = cylinder(width, size, size / 6, 1.2);
  return (
    <svg className="store-sign" width={width} height={size} viewBox={`0 0 ${width} ${size}`} aria-hidden="true">
      <path d={outline} />
      <path d={rim} />
    </svg>
  );
}

/** A short line of words above the line of an arrow, as a sample of a line of its label. */
function SampleWords({ words }: { words: string }) {
  const { width, height } = SAMPLE;
  const line = height - 7;
  return (
    <g className="sample-arrow sample-route">
      <text x={width / 2} y={9} textAnchor="middle" dominantBaseline="central">
        {words}
      </text>
      <path className="arrow-line" d={`M2,${line} L${width - 4},${line}`} />
      <polygon className="arrow-head" points={`${width - 2},${line} ${width - 10},${line - 4} ${width - 10},${line + 4}`} />
    </g>
  );
}

/**
 * The sample the legend draws for a key, at the sample's size: the shape of a look of a box, an
 * external system as the view about it draws it, the boundary's dashed line, an arrow, an arrow
 * for several connections, an arrow with its route, a name in brackets on a route, an arrow with
 * the ring of a channel the far side opened, a line of words of a label, or the mark of a box
 * whose copies act on each other, that connections pass through, or that keeps stores.
 */
export function Sample({ name }: { name: LegendKey }) {
  const { width, height } = SAMPLE;
  const middle = height / 2;
  let drawn;
  if (isLook(name)) {
    drawn = (
      <g className={`sample-box family-${SAMPLE_FAMILY[name]}`}>
        <SampleShape look={name} />
      </g>
    );
  } else if (name === 'system-scope-external') {
    drawn = (
      <g className="sample-box family-systems">
        <SampleShape look="system-external" scope />
      </g>
    );
  } else if (name === 'boundary') {
    drawn = <rect className="sample-boundary" x={1} y={1} width={width - 2} height={height - 2} rx={4} />;
  } else if (name === 'arrow' || name === 'arrow-many') {
    drawn = (
      <g className={`sample-arrow${name === 'arrow-many' ? ' arrow-many' : ''}`}>
        <path className="arrow-line" d={`M2,${middle} L${width - 4},${middle}`} />
        <polygon className="arrow-head" points={`${width - 2},${middle} ${width - 10},${middle - 4} ${width - 10},${middle + 4}`} />
      </g>
    );
  } else if (name === 'route') {
    drawn = <SampleWords words="via" />;
  } else if (name === 'route-only') {
    drawn = <SampleWords words="via (…)" />;
  } else if (name === 'opened-some') {
    drawn = <SampleWords words="opened" />;
  } else if (name === 'only') {
    drawn = (
      <g className="sample-only">
        <text x={width / 2} y={middle} textAnchor="middle" dominantBaseline="central">
          only …
        </text>
      </g>
    );
  } else if (name === 'opened') {
    const ring = width - 10 - RING_GAP - RING_RADIUS;
    drawn = (
      <g className="sample-arrow">
        <path className="arrow-line" d={`M2,${middle} L${width - 4},${middle}`} />
        <circle className="arrow-ring" cx={ring} cy={middle} r={RING_RADIUS} />
        <polygon className="arrow-head" points={`${width - 2},${middle} ${width - 10},${middle - 4} ${width - 10},${middle + 4}`} />
      </g>
    );
  } else if (name === 'kept') {
    const sign = cylinder(9.6, 12, 2, 1.2);
    drawn = (
      <g className="sample-mark">
        <rect x={6} y={6} width={width - 12} height={height - 12} rx={(height - 12) / 2} />
        <g transform={`translate(${width / 2 - 10}, ${middle - 6})`}>
          <path className="sample-store-sign" d={sign.outline} />
          <path className="sample-store-sign" d={sign.rim} />
        </g>
        <text x={width / 2 + 7} y={middle} textAnchor="middle" dominantBaseline="central">
          2
        </text>
      </g>
    );
  } else {
    drawn = (
      <g className="sample-mark">
        <rect x={6} y={6} width={width - 12} height={height - 12} rx={(height - 12) / 2} />
        <text x={width / 2} y={middle} textAnchor="middle" dominantBaseline="central">
          {`${name === 'passing' ? PASSING_MARK : LOOP_MARK} 2`}
        </text>
      </g>
    );
  }
  return (
    <svg className="sample" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {drawn}
    </svg>
  );
}

/** How far the tab of an external system runs from its corner in a sample of the legend. */
const SAMPLE_TAB = 16;

/**
 * A box's shape drawn small for the legend, with lines and corners a reader can still tell
 * apart. `scope` draws the thicker line of the system a view is about.
 */
function SampleShape({ look, scope = false }: { look: BoxLook; scope?: boolean }) {
  const { width, height } = SAMPLE;
  switch (look) {
    case 'person':
      return <rect className="outline" x={1} y={1} width={width - 2} height={height - 2} rx={11} strokeWidth={OUTLINE} />;
    case 'app':
      return <rect className="outline" x={1} y={1} width={width - 2} height={height - 2} rx={4} strokeWidth={OUTLINE} />;
    case 'store': {
      const { outline, rim } = cylinder(width, height, 4, OUTLINE);
      return (
        <>
          <path className="outline" d={outline} strokeWidth={OUTLINE} />
          <path className="outline rim" d={rim} strokeWidth={OUTLINE} />
        </>
      );
    }
    case 'queue-or-topic': {
      const { outline, rim } = pipe(width, height, 5, OUTLINE);
      return (
        <>
          <path className="outline" d={outline} strokeWidth={OUTLINE} />
          <path className="outline rim" d={rim} strokeWidth={OUTLINE} />
        </>
      );
    }
    case 'infrastructure':
      return <polygon className="outline" points={hexagon(width, height, 8, OUTLINE)} strokeWidth={OUTLINE} strokeLinejoin="round" />;
    case 'system':
    case 'system-scope':
    case 'system-external': {
      const line = look === 'system-scope' || scope ? SCOPE_OUTLINE - 1 : OUTLINE - 0.5;
      return (
        <>
          <rect className="outline" x={line / 2} y={line / 2} width={width - line} height={height - line} strokeWidth={line} />
          <rect className="outline rim" x={line + 2.5} y={line + 2.5} width={width - 2 * line - 5} height={height - 2 * line - 5} strokeWidth={1} />
          {look === 'system-external' && <path className="tab" d={tab(SAMPLE_TAB)} />}
        </>
      );
    }
  }
}
