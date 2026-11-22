import type { BoxFamily, LegendKey } from '@seefore/core';

/**
 * The shape of each kind of box, so that a person, a system, an app and a store are told apart
 * with no colour at all: a person very round, a system with a double line, an app with small
 * round corners, a store a cylinder. Colour comes from the style sheet, by family.
 */

/** The radius of a person's corners, in CSS pixels: round enough to tell at a glance, not so round that it cuts the text. */
export const PERSON_RADIUS = 40;

/** The radius of an app's corners, in CSS pixels. */
export const APP_RADIUS = 10;

/** Half the height of the ellipse at a store's top and bottom, in CSS pixels. */
export const STORE_LID = 7;

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

/** The outline of a box of a family, at a size. `scope` draws the thicker line of the system a view is about. */
export function Shape({ family, scope, width, height }: { family: BoxFamily; scope: boolean; width: number; height: number }) {
  switch (family) {
    case 'people':
      return <rect className="outline" {...inset(width, height, OUTLINE / 2)} rx={Math.min(PERSON_RADIUS, height / 3)} strokeWidth={OUTLINE} />;
    case 'apps':
      return <rect className="outline" {...inset(width, height, OUTLINE / 2)} rx={APP_RADIUS} strokeWidth={OUTLINE} />;
    case 'stores': {
      const { outline, rim } = cylinder(width, height, STORE_LID, OUTLINE);
      return (
        <>
          <path className="outline" d={outline} strokeWidth={OUTLINE} />
          <path className="outline rim" d={rim} strokeWidth={OUTLINE} />
        </>
      );
    }
    case 'systems': {
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

/** The family each box key of the legend stands for. */
const SAMPLE_FAMILY: Partial<Record<LegendKey, BoxFamily>> = {
  person: 'people',
  'system-scope': 'systems',
  system: 'systems',
  app: 'apps',
  store: 'stores',
};

/**
 * The sample the legend draws for a key, at the sample's size: the shape of a kind of box, the
 * boundary's dashed line, an arrow, an arrow for several connections, or the mark of a box
 * whose copies act on each other.
 */
export function Sample({ name }: { name: LegendKey }) {
  const { width, height } = SAMPLE;
  const family = SAMPLE_FAMILY[name];
  const middle = height / 2;
  let drawn;
  if (family !== undefined) {
    drawn = (
      <g className={`sample-box family-${family}`}>
        <SampleShape family={family} scope={name === 'system-scope'} />
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
  } else {
    drawn = (
      <g className="sample-mark">
        <rect x={6} y={6} width={width - 12} height={height - 12} rx={(height - 12) / 2} />
        <text x={width / 2} y={middle} textAnchor="middle" dominantBaseline="central">
          ↻ 2
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
function SampleShape({ family, scope }: { family: BoxFamily; scope: boolean }) {
  const { width, height } = SAMPLE;
  switch (family) {
    case 'people':
      return <rect className="outline" x={1} y={1} width={width - 2} height={height - 2} rx={11} strokeWidth={OUTLINE} />;
    case 'apps':
      return <rect className="outline" x={1} y={1} width={width - 2} height={height - 2} rx={4} strokeWidth={OUTLINE} />;
    case 'stores': {
      const { outline, rim } = cylinder(width, height, 4, OUTLINE);
      return (
        <>
          <path className="outline" d={outline} strokeWidth={OUTLINE} />
          <path className="outline rim" d={rim} strokeWidth={OUTLINE} />
        </>
      );
    }
    case 'systems': {
      const line = scope ? SCOPE_OUTLINE - 1 : OUTLINE - 0.5;
      return (
        <>
          <rect className="outline" x={line / 2} y={line / 2} width={width - line} height={height - line} strokeWidth={line} />
          <rect className="outline rim" x={line + 2.5} y={line + 2.5} width={width - 2 * line - 5} height={height - 2 * line - 5} strokeWidth={1} />
        </>
      );
    }
  }
}
