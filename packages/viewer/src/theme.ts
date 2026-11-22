/**
 * The colours and sizes of the page, in a light and a dark theme. The colours are those of
 * `research/diagrams/recommendations.md`, section 4: outlines and dark text on a plain ground,
 * each checked against the contrast rule of WCAG 2.2. The faded ones are for what a hover or a
 * selection does not light; they still meet the rule on their ground.
 */

/** The colours of one theme, by what each is for. */
export interface Colours {
  /** The ground of the page, of the canvas and of each box and label. */
  ground: string;
  /** The light tint inside a boundary. */
  tint: string;
  /** The ground of the sidebar, the panel and the bars around the canvas. */
  side: string;
  /** Text: names, labels, the panel. */
  text: string;
  /** The kind line of a box, the technology of an arrow, and quieter text. */
  quiet: string;
  person: string;
  app: string;
  store: string;
  /** A piece of infrastructure. */
  infrastructure: string;
  /** A system, in scope or not, ours or external: an external one is told by its outline. */
  system: string;
  arrow: string;
  /** The dashed line of a boundary. */
  boundary: string;
  /** Text that a hover or a selection does not light. */
  fadedText: string;
  /** Lines that a hover or a selection does not light. */
  fadedLine: string;
  /** The ring of what is chosen, and of what has the keyboard's focus. */
  accent: string;
  /** Lines between parts of the page. */
  rule: string;
  /** An error in the list of problems. */
  error: string;
}

/** The light theme: outlines on white. */
export const LIGHT: Colours = {
  ground: '#ffffff',
  tint: '#f6f8fb',
  side: '#f3f4f6',
  text: '#1d2633', // 15.3 on white
  quiet: '#444444', // 9.7 on white
  person: '#08427b', // 10.1 on white
  app: '#1565c0', // 5.8 on white
  store: '#2e7d5b', // 5.0 on white
  infrastructure: '#7b3fa0', // 6.9 on white
  system: '#6b6b6b', // 5.3 on white
  arrow: '#555555', // 7.5 on white, 7.0 on the tint
  boundary: '#5a6472', // 5.6 on the tint
  fadedText: '#707070', // 4.95 on white, 4.65 on the tint
  fadedLine: '#858585', // 3.47 on the tint
  accent: '#0b57d0', // 6.0 on the tint
  rule: '#d0d4da',
  error: '#b3261e',
};

/** The dark theme: its own tokens on a dark ground, not the light ones turned round. */
export const DARK: Colours = {
  ground: '#14171c',
  tint: '#1b2028',
  side: '#1a1d23',
  text: '#e6e9ee', // 14.8 on the ground
  quiet: '#b8bec7', // 9.6 on the ground
  person: '#6ea8f0', // 7.3 on the ground
  app: '#4f9cf5', // 6.3 on the ground
  store: '#4cc08e', // 7.9 on the ground
  infrastructure: '#c39bdf', // 7.8 on the ground
  system: '#9aa0a6', // 6.8 on the ground
  arrow: '#9aa0a6', // 6.8 on the ground
  boundary: '#8a93a0', // 5.3 on the tint
  fadedText: '#8b9098', // 5.1 on the tint
  fadedLine: '#6b7280', // 3.4 on the tint
  accent: '#8ab4f8', // 7.8 on the tint
  rule: '#343a44',
  error: '#f2b8b5',
};

/** The family of fonts the engine measures text for, so that what it breaks fits where it is drawn. */
export const FONT = 'Arial, Helvetica, "Liberation Sans", sans-serif';

/** Sizes of text in a picture, in CSS pixels at full size, as the engine measured them. */
export const TEXT = {
  /** The name of a box, in bold. */
  name: 15,
  /** The kind line of a box. */
  line: 11,
  /** The first sentence of a box. */
  sentence: 12,
  /** The names on an arrow. */
  label: 12,
  /** The technology line of an arrow. */
  technology: 11,
  /** The route line of an arrow. */
  route: 11,
  /** The title of a boundary, in bold. */
  boundary: 16,
} as const;

/** The height of a line of each text, in CSS pixels: about one and a fifth of its size. */
export const LINE_HEIGHT = {
  name: 18,
  line: 14,
  sentence: 15,
  label: 15,
  technology: 14,
  route: 14,
} as const;

/**
 * How much more room the page gives a box's text on each side than the layout broke its lines
 * for, in CSS pixels, so that a browser whose font is a hair wider than the one measured does
 * not clip a line. The shape of each look leaves this room clear.
 */
export const TEXT_SLACK = 2;

/** The CSS custom properties of one theme. */
function properties(colours: Colours): string {
  return Object.entries(colours)
    .map(([name, value]) => `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${value};`)
    .join(' ');
}

/**
 * The style sheet that sets the tokens: light, dark when the reader's setting asks for it, and
 * the font and sizes. The rest of the page's style reads them.
 */
export function themeCss(): string {
  const sizes = Object.entries(TEXT)
    .map(([name, value]) => `--size-${name}: ${value}px;`)
    .join(' ');
  const heights = Object.entries(LINE_HEIGHT)
    .map(([name, value]) => `--height-${name}: ${value}px;`)
    .join(' ');
  return [
    `:root { color-scheme: light dark; --font: ${FONT}; ${sizes} ${heights} ${properties(LIGHT)} }`,
    `@media (prefers-color-scheme: dark) { :root { ${properties(DARK)} } }`,
  ].join('\n');
}

/** The relative luminance of a colour written `#rrggbb`, as WCAG 2.2 defines it. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const [red, green, blue] = channels.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

/** The contrast ratio of two colours written `#rrggbb`, from 1 to 21, as WCAG 2.2 defines it. */
export function contrast(one: string, other: string): number {
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}
