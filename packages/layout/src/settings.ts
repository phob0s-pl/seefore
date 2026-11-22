import type { LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import { BOUNDARY_PADDING, BOX_HEIGHT, BOX_WIDTH } from './sizes.ts';

/**
 * The settings of ELK for every view, as the research measured them (`recommendations.md`,
 * section 4, and 2.6 for what to leave out). Never set: model order on the boundary, which
 * crashes ELK; the layering strategies `STRETCH_WIDTH`, which hangs, and `BF_MODEL_ORDER` and
 * `DF_MODEL_ORDER`, which crash.
 */

/** The settings of the whole picture. */
export const ROOT_OPTIONS: Readonly<LayoutOptions> = {
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
  // On the root only: on the boundary it crashes ELK. Without it, 4 % more crossings.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
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
 * The settings of the boundary: those of the root it does not get by itself, room for the
 * title at its top, and at least the size of one box inside it, so that a boundary with
 * nothing to draw inside still shows, with its title.
 */
export const BOUNDARY_OPTIONS: Readonly<LayoutOptions> = {
  ...PASSED_DOWN,
  'elk.padding': `[top=${BOUNDARY_PADDING.top},left=${BOUNDARY_PADDING.left},bottom=${BOUNDARY_PADDING.bottom},right=${BOUNDARY_PADDING.right}]`,
  'elk.nodeSize.constraints': 'MINIMUM_SIZE',
  'elk.nodeSize.minimum': `(${BOX_WIDTH + BOUNDARY_PADDING.left + BOUNDARY_PADDING.right}, ${BOX_HEIGHT + BOUNDARY_PADDING.top + BOUNDARY_PADDING.bottom})`,
};

/** The settings of an arrow's label: placed by ELK at its measured size, on its line, half way. With these no label touched a box, a line or a label. */
export const LABEL_OPTIONS: Readonly<LayoutOptions> = {
  'elk.edgeLabels.inline': 'true',
  'elk.edgeLabels.placement': 'CENTER',
};

/** The settings of a person: in the first column. ELK put them there anyway; this keeps it so. */
export const PERSON_OPTIONS: Readonly<LayoutOptions> = {
  'elk.layered.layering.layerConstraint': 'FIRST',
};

/** What a large context view adds to the root: its long row of systems split in two. */
export const UNZIP_OPTIONS: Readonly<LayoutOptions> = {
  'elk.layered.layerUnzipping.strategy': 'ALTERNATING',
};
