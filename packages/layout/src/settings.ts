import type { LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import { BOUNDARY_PADDING, BOX_HEIGHT, BOX_WIDTH } from './sizes.ts';

/**
 * The settings of ELK for every view, as the research measured them (`recommendations.md`,
 * section 4, and 2.6 for what to leave out). Never set: model order on the boundary, which
 * crashes ELK; the layering strategies `STRETCH_WIDTH` and `MIN_WIDTH`, which hang, and
 * `BF_MODEL_ORDER` and `DF_MODEL_ORDER`, which crash.
 *
 * Model order is not set on the root either. ELK then breaks a tie between two boxes of a
 * column by the order they are handed over in, which is the order of id, and not by their
 * places. Where the walk and the ids disagree, a box with an arrow both ways, or with none,
 * stood the other way round from the walk: 12 pairs in 8 of the 127 trial views, all context
 * views, and a pair inside a boundary in a view made for the test. Without it no pair does,
 * for 16 more crossings on the 16 main views (2,902 to 2,918) and 0.3 % more area.
 */

/**
 * What makes ELK keep the boxes of a column in the order of the places they are given, which
 * is the order of the walk in `graph.ts`. It is set on the root and on the boundary. Measured
 * on the trial models when it was built: after one edit 84 % of the pairs of boxes kept their
 * order, where 51 % did when ELK chose the order. It costs crossings, counted two ways: an
 * edited picture had on average 1.8 times the crossings of the same picture with ELK choosing
 * the order, which is the mean of each picture's own rise over 208 edited pictures; summed
 * over the 16 main views as they are, crossings rose by 32 %, and by 33 % with model order
 * taken off the root (2,198 to 2,918). Without places to keep, the setting does nothing.
 */
export const ORDER_OPTIONS: Readonly<LayoutOptions> = {
  'elk.layered.crossingMinimization.semiInteractive': 'true',
};

/** The settings of the whole picture. */
export const ROOT_OPTIONS: Readonly<LayoutOptions> = {
  ...ORDER_OPTIONS,
  'elk.algorithm': 'layered',
  // Left to right for every view: the directions fit within 17 % of each other, and no arrow crossed a boundary's title.
  'elk.direction': 'RIGHT',
  // The boundary and its inside in one run.
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  // Up to 66 % larger at fit than the default placement, with no more crossings.
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  // 9 % fewer crossings than the default, for a third more time.
  'elk.layered.thoroughness': '20',
  // Another seed changed 14 of 22 views: the same model must give the same picture.
  'elk.randomSeed': '1',
  'elk.spacing.nodeNode': '40',
  'elk.layered.spacing.nodeNodeBetweenLayers': '70',
  'elk.spacing.edgeNode': '20',
  'elk.spacing.edgeEdge': '12',
  'elk.layered.spacing.edgeNodeBetweenLayers': '20',
  'elk.spacing.edgeLabel': '4',
  // Every place from the top left of the whole picture, as the page wants them.
  'elk.json.edgeCoords': 'ROOT',
  'elk.json.shapeCoords': 'ROOT',
};

/**
 * The settings of the root that ELK does not pass down to a nested graph: the spacing, the node
 * placement and the thoroughness. The research measured its sizes with all three set on the
 * boundary too; with the spacing alone, the largest container views come out a quarter to
 * three quarters taller.
 */
const PASSED_DOWN: Readonly<LayoutOptions> = Object.fromEntries(
  Object.entries(ROOT_OPTIONS).filter(([key]) => key.includes('spacing') || key.includes('nodePlacement') || key.includes('thoroughness')),
);

/**
 * The settings of the boundary: those of the root it does not get by itself, the order of the
 * walk, room for the title at its top, and at least the size of one box inside it, so that a
 * boundary with nothing to draw inside still shows, with its title.
 */
export const BOUNDARY_OPTIONS: Readonly<LayoutOptions> = {
  ...PASSED_DOWN,
  ...ORDER_OPTIONS,
  'elk.padding': `[top=${BOUNDARY_PADDING.top},left=${BOUNDARY_PADDING.left},bottom=${BOUNDARY_PADDING.bottom},right=${BOUNDARY_PADDING.right}]`,
  'elk.nodeSize.constraints': 'MINIMUM_SIZE',
  'elk.nodeSize.minimum': `(${BOX_WIDTH + BOUNDARY_PADDING.left + BOUNDARY_PADDING.right}, ${BOX_HEIGHT + BOUNDARY_PADDING.top + BOUNDARY_PADDING.bottom})`,
};

/** The settings of an arrow's label: its room placed by ELK on its line, half way. With these no label touched a box, a line or a label. */
export const LABEL_OPTIONS: Readonly<LayoutOptions> = {
  'elk.edgeLabels.inline': 'true',
  'elk.edgeLabels.placement': 'CENTER',
};

/** The settings of a person: in the first column. ELK put them there anyway; this keeps it so. */
export const PERSON_OPTIONS: Readonly<LayoutOptions> = {
  'elk.layered.layering.layerConstraint': 'FIRST',
};

/** What a large context view adds to the root: its long row of systems split in two. See `UNZIP_FROM`. */
export const UNZIP_OPTIONS: Readonly<LayoutOptions> = {
  'elk.layered.layerUnzipping.strategy': 'ALTERNATING',
};
