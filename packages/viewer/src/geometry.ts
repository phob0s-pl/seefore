/**
 * The sizes and the paths of the shapes a box is drawn in, for the shapes themselves and for
 * where an arrow meets one. In CSS pixels, from the box's top left.
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

/**
 * How far the tab of an external system runs along the top and down the left side from its
 * corner, in CSS pixels: large enough to be seen when the picture is fitted small, and clear of
 * the text, which starts lower and further in.
 */
export const EXTERNAL_TAB = 28;

/** The tab of an external system: a solid triangle in the top left corner of a box of its size. */
export function tab(size: number): string {
  return `M0,0 L${size},0 L0,${size} Z`;
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
