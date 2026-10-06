/**
 * Resolution-independent description of a design problem, in "domain units": the domain is
 * W wide and 1 high, x to the right and y up, origin at the bottom-left corner. The same
 * problem can be meshed at any resolution (see `resolve.ts`).
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * - `fixed`: holds both directions (a pin / clamp).
 * - `rollerX`: rolls along x — free in x, holds y.
 * - `rollerY`: rolls along y — free in y, holds x.
 */
export type SupportKind = 'fixed' | 'rollerX' | 'rollerY';

export interface SegmentSupport {
  id: string;
  shape: 'segment';
  kind: SupportKind;
  /** End points; a == b is a point support. */
  a: Point;
  b: Point;
}

export interface DiskSupport {
  id: string;
  shape: 'disk';
  kind: SupportKind;
  centre: Point;
  radius: number;
}

export type Support = SegmentSupport | DiskSupport;

export interface Load {
  id: string;
  /** Application point (the centre of a line load). */
  at: Point;
  /** Total force (dimensionless; the reference load has magnitude 1). */
  fx: number;
  fy: number;
  /** Length of a horizontal line load centred on `at`; 0 for a point load. */
  length: number;
}

export type RegionKind = 'void' | 'solid' | 'clear';

export interface RectRegion {
  id: string;
  shape: 'rect';
  kind: RegionKind;
  a: Point;
  b: Point;
}

export interface CircleRegion {
  id: string;
  shape: 'circle';
  kind: RegionKind;
  centre: Point;
  radius: number;
}

export interface StrokeRegion {
  id: string;
  shape: 'stroke';
  kind: RegionKind;
  points: Point[];
  radius: number;
}

export type Region = RectRegion | CircleRegion | StrokeRegion;

export interface Problem {
  /** Domain width in units of its height. */
  width: number;
  supports: Support[];
  loads: Load[];
  /** Passive regions, applied in order (later ones win). */
  regions: Region[];
  /** Enforce left-right mirror symmetry of the design. */
  symmetric: boolean;
}

let counter = 0;
/** Short unique id for new entities. */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function clonePoint(p: Point): Point {
  return { x: p.x, y: p.y };
}

/** Deep copy (problems are small plain objects). */
export function cloneProblem(p: Problem): Problem {
  return structuredClone(p);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampToDomain(p: Point, width: number): Point {
  return { x: clamp(p.x, 0, width), y: clamp(p.y, 0, 1) };
}

/** Magnitude of a load. */
export function loadMagnitude(l: Load): number {
  return Math.hypot(l.fx, l.fy);
}

/** Mirror a point about the vertical centre line. */
export function mirrorPoint(p: Point, width: number): Point {
  return { x: width - p.x, y: p.y };
}
