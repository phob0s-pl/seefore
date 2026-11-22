import type { BoxFamily, BoxLook, LegendKey } from '@seefore/core';

/**
 * The shape of each look of a box, so that each is told apart with no colour at all: a person
 * very round, a system with a double line, an external system with a single one, an app with
 * small round corners, a store an upright cylinder, a queue or a topic a cylinder on its side,
 * a piece of infrastructure pointed at both ends. Colour comes from the style sheet, by family.
 */

/** The radius of a person's corners, in CSS pixels: round enough to tell at a glance, not so round that it cuts the text. */
export const PERSON_RADIUS = 40;

/** The radius of an app's corners, in CSS pixels. */
export const APP_RADIUS = 10;

/** Half the height of the ellipse at a store's top and bottom, in CSS pixels. */
export const STORE_LID = 7;

/** Half the width of the ellipse at each end of a queue or a topic, in CSS pixels: narrow, so that the text keeps its room. */
export const QUEUE_LID = 7;

/** How far the top and bottom edges of a piece of infrastructure stand in from its points, in CSS pixels. */
export const INFRASTRUCTURE_POINT = 14;

/** How far the middle of a system's inner line stands in from the inner edge of its outer one, in CSS pixels. */
export const SYSTEM_GAP = 3.5;

/** The width of a system's inner line, in CSS pixels. */
export const SYSTEM_INNER = 1;

/** The width of an outline, in CSS pixels. */
export const OUTLINE = 2;

/** The width of the outline of the system a view is about: thicker than the others. */
export const SCOPE_OUTLINE = 4;

/** A rectangle whose line has its middle this far in from the edge of the box. */
function inset(width: number, height: number, at: number) {
  return { x: at, y: at, width: Math.max(width - 2 * at, 0), height: Math.max(height - 2 * at, 0) };
}

/** The path of a store's cylinder: the outline, and the near half of its lid. */
export function cylinder(width: number, height: number, lid: number, line: number): { outline: string; rim: string } {
  const left = line / 2;
  const right = width - line / 2;
  const top = lid + line / 2;
  const bottom = height - lid - line / 2;
  const radius = (right - left) / 2;
  return {
    outline: `M${left},${top} A${radius},${lid} 0 0 1 ${right},${top} L${right},${bottom} A${radius},${lid} 0 0 1 ${left},${bottom} Z`,
    rim: `M${left},${top} A${radius},${lid} 0 0 0 ${right},${top}`,
  };
}

/** The path of a cylinder on its side, for a queue or a topic: the outline, and the near half of its right end. */
export function pipe(width: number, height: number, lid: number, line: number): { outline: string; rim: string } {
  const left = lid + line / 2;
  const right = width - lid - line / 2;
  const top = line / 2;
  const bottom = height - line / 2;
  const radius = (bottom - top) / 2;
  return {
    outline: `M${left},${top} L${right},${top} A${lid},${radius} 0 0 1 ${right},${bottom} L${left},${bottom} A${lid},${radius} 0 0 1 ${left},${top} Z`,
    rim: `M${right},${top} A${lid},${radius} 0 0 0 ${right},${bottom}`,
  };
}

/** The points of a piece of infrastructure: a long hexagon, pointed at its left and right, as what an exchange passes along. */
export function hexagon(width: number, height: number, point: number, line: number): string {
  const left = line / 2;
  const right = width - line / 2;
  const top = line / 2;
  const bottom = height - line / 2;
  const middle = height / 2;
  return [
    [left + point, top],
    [right - point, top],
    [right, middle],
    [right - point, bottom],
    [left + point, bottom],
    [left, middle],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
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
    case 'system-external': {
      const line = scope ? SCOPE_OUTLINE : OUTLINE;
      return <rect className="outline" {...inset(width, height, line / 2)} strokeWidth={line} />;
    }
    case 'system':
    case 'system-scope': {
      const line = scope ? SCOPE_OUTLINE : OUTLINE;
      return (
        <>
          <rect className="outline" {...inset(width, height, line / 2)} strokeWidth={line} />
          <rect className="outline rim" {...inset(width, height, line + SYSTEM_GAP)} strokeWidth={SYSTEM_INNER} />
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
 * The sample the legend draws for a key, at the sample's size: the shape of a look of a box, the
 * boundary's dashed line, an arrow, an arrow for several connections, an arrow with its route,
 * or the mark of a box whose copies act on each other or that connections pass through.
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
    const line = height - 7;
    drawn = (
      <g className="sample-arrow sample-route">
        <text x={width / 2} y={9} textAnchor="middle" dominantBaseline="central">
          via
        </text>
        <path className="arrow-line" d={`M2,${line} L${width - 4},${line}`} />
        <polygon className="arrow-head" points={`${width - 2},${line} ${width - 10},${line - 4} ${width - 10},${line + 4}`} />
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

/** A box's shape drawn small for the legend, with lines and corners a reader can still tell apart. */
function SampleShape({ look }: { look: BoxLook }) {
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
    case 'system-external':
      return <rect className="outline" x={0.75} y={0.75} width={width - 1.5} height={height - 1.5} strokeWidth={1.5} />;
    case 'system':
    case 'system-scope': {
      const line = look === 'system-scope' ? SCOPE_OUTLINE - 1 : OUTLINE - 0.5;
      return (
        <>
          <rect className="outline" x={line / 2} y={line / 2} width={width - line} height={height - line} strokeWidth={line} />
          <rect className="outline rim" x={line + 2.5} y={line + 2.5} width={width - 2 * line - 5} height={height - 2 * line - 5} strokeWidth={1} />
        </>
      );
    }
  }
}
