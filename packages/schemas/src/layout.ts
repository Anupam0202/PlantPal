import { z } from 'zod';
import { EpochMs, Id, ShortText } from './primitives';

/**
 * Space Designer layouts (§6.7). Coordinates are metres in a named local frame: x to the right, y
 * down the screen, and `rotationDeg` is the compass bearing of "up" (0 = north). A layout is never
 * GeoJSON unless a documented georeference exists.
 */
export const LocalFrame = z.object({
  frame: z.literal('local-metric'),
  unit: z.literal('m'),
  origin: z.tuple([z.literal(0), z.literal(0)]),
  /** Bearing of the layout's "up" direction, degrees clockwise from true north. */
  rotationDeg: z.number().min(0).lt(360),
});
export type LocalFrame = z.infer<typeof LocalFrame>;

export const LAYOUT_KINDS = [
  'wall',
  'railing',
  'door',
  'window',
  'overhang',
  'path',
  'container',
  'bed',
  'trellis',
  'tank',
  'compost',
  'insect-hotel',
  'bird-bath',
  'seating',
  'plant',
  'note',
] as const;
export type LayoutKind = (typeof LAYOUT_KINDS)[number];
export const LAYOUT_SHAPES = ['rect', 'round', 'line'] as const;
export type LayoutShape = (typeof LAYOUT_SHAPES)[number];
export const LAYOUT_LAYERS = ['structure', 'containers', 'plants', 'sun', 'notes'] as const;
export type LayoutLayer = (typeof LAYOUT_LAYERS)[number];

const m = z.number().finite();
const len = z.number().finite().nonnegative().max(1000);

/** One thing on the plan. Rect and round items are positioned by their centre; lines by both ends. */
export const LayoutItem = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(LAYOUT_KINDS),
  label: z.string().max(80),
  shape: z.enum(LAYOUT_SHAPES),
  x: m,
  y: m,
  /** Line end (lines only). */
  x2: m,
  y2: m,
  lengthM: len,
  widthM: len,
  diameterM: len,
  rotationDeg: z.number().finite(),
  /** Walls, railings, trellises: top height. Overhangs: height of the slab above the floor. */
  heightM: len.nullable(),
  /** Containers and beds: substrate depth. */
  depthM: len.nullable(),
  /** Water tanks: capacity. */
  volumeL: len.nullable(),
  /** Casts a solid shadow (walls, overhangs; railings are open by default). */
  solid: z.boolean(),
  specimenId: Id.nullable(),
  taxonId: z.string().max(80).nullable(),
  containerId: Id.nullable(),
  /** For plants: the container or bed it grows in. */
  inId: z.string().max(40).nullable(),
  note: z.string().max(200),
});
export type LayoutItem = z.infer<typeof LayoutItem>;

export const LayoutBody = z.object({
  name: ShortText.min(1),
  frame: LocalFrame,
  /** Space outline, at least three corners, in metres. */
  outline: z
    .array(z.tuple([m, m]))
    .min(3)
    .max(64),
  items: z.array(LayoutItem).max(400),
});
export type LayoutBody = z.infer<typeof LayoutBody>;

export const Layout = LayoutBody.extend({
  id: Id,
  workspaceId: Id,
  createdAt: EpochMs,
  updatedAt: EpochMs,
  version: z.number().int().positive(),
  deletedAt: EpochMs.nullable(),
  gardenId: Id,
  zoneId: Id.nullable(),
});
export type Layout = z.infer<typeof Layout>;

/** A saved snapshot, for the compare view. */
export const LayoutVersion = z.object({
  id: Id,
  workspaceId: Id,
  layoutId: Id,
  version: z.number().int().positive(),
  savedAt: EpochMs,
  note: z.string().max(200),
  body: LayoutBody,
});
export type LayoutVersion = z.infer<typeof LayoutVersion>;

/** JSON export in the named local frame (round-trips through `LayoutBody`). */
export const LayoutExport = z.object({
  type: z.literal('plantpal-layout'),
  schema: z.literal(1),
  frame: LocalFrame,
  name: z.string(),
  outline: LayoutBody.shape.outline,
  items: LayoutBody.shape.items,
});
export type LayoutExport = z.infer<typeof LayoutExport>;

/** F9 Photo-to-Plan detections (experimental). Boxes are [ymin, xmin, ymax, xmax] normalised to 0–1000. */
export const SPACE_LABELS = [
  'pot',
  'planter',
  'railing',
  'wall',
  'door',
  'window',
  'bed',
  'seating',
  'tank',
  'other',
] as const;
export type SpaceLabel = (typeof SPACE_LABELS)[number];
export const SpaceDetections = z.object({
  items: z
    .array(
      z.object({
        label: z.enum(SPACE_LABELS),
        /** [ymin, xmin, ymax, xmax], 0–1000 (Gemini's detection convention). An array, not a tuple:
         * the structured-output schema subset has no prefixItems. */
        box_2d: z.array(z.number().min(0).max(1000)).length(4),
        note: z.string().max(120),
      }),
    )
    .max(30),
  imageUsable: z.boolean(),
  abstainReason: z.string().max(200).nullable(),
});
export type SpaceDetections = z.infer<typeof SpaceDetections>;
