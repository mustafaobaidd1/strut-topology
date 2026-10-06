import type { GridProblem } from '../opt/optimizer';
import {
  mirrorPoint,
  type Load,
  type Point,
  type Problem,
  type Region,
  type Support,
} from './model';

/**
 * Meshing a `Problem` at a given resolution: nely elements through the height (element size
 * h = 1/nely) and nelx = round(width · nely) along the width.
 */

export interface Mesh {
  nelx: number;
  nely: number;
  /** Element size in domain units. */
  h: number;
}

export function meshFor(width: number, nely: number): Mesh {
  return { nelx: Math.max(1, Math.round(width * nely)), nely, h: 1 / nely };
}

/** Grid node (column i, row j from the top) nearest to a domain point. */
export function nearestNode(mesh: Mesh, p: Point): [number, number] {
  const i = Math.min(mesh.nelx, Math.max(0, Math.round(p.x / mesh.h)));
  const j = Math.min(mesh.nely, Math.max(0, Math.round((1 - p.y) / mesh.h)));
  return [i, j];
}

/** Domain coordinates of node (i, j). */
export function nodePoint(mesh: Mesh, i: number, j: number): Point {
  return { x: i * mesh.h, y: 1 - j * mesh.h };
}

const nodeIndex = (mesh: Mesh, i: number, j: number) => i * (mesh.nely + 1) + j;

/** Nodes covered by a support. */
export function supportNodes(mesh: Mesh, s: Support): [number, number][] {
  const out = new Map<number, [number, number]>();
  const add = (i: number, j: number) => out.set(nodeIndex(mesh, i, j), [i, j]);
  if (s.shape === 'segment') {
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    const steps = Math.max(1, Math.ceil((len / mesh.h) * 2));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const [i, j] = nearestNode(mesh, {
        x: s.a.x + (s.b.x - s.a.x) * t,
        y: s.a.y + (s.b.y - s.a.y) * t,
      });
      add(i, j);
    }
  } else {
    const r = s.radius;
    const [ci, cj] = nearestNode(mesh, s.centre);
    add(ci, cj);
    const reach = Math.ceil(r / mesh.h) + 1;
    for (let i = ci - reach; i <= ci + reach; i++) {
      for (let j = cj - reach; j <= cj + reach; j++) {
        if (i < 0 || j < 0 || i > mesh.nelx || j > mesh.nely) continue;
        const p = nodePoint(mesh, i, j);
        if (Math.hypot(p.x - s.centre.x, p.y - s.centre.y) <= r + 1e-9) add(i, j);
      }
    }
  }
  return [...out.values()];
}

/** Nodes loaded by a load, with the share of the total force each one takes. */
export function loadNodes(mesh: Mesh, l: Load): { i: number; j: number; w: number }[] {
  const [ic, j] = nearestNode(mesh, l.at);
  if (!(l.length > 0)) return [{ i: ic, j, w: 1 }];
  const i0 = Math.max(0, Math.round((l.at.x - l.length / 2) / mesh.h));
  const i1 = Math.min(mesh.nelx, Math.round((l.at.x + l.length / 2) / mesh.h));
  if (i1 <= i0) return [{ i: ic, j, w: 1 }];
  // Uniform line load: consistent nodal forces are the trapezoidal weights.
  const out: { i: number; j: number; w: number }[] = [];
  const segments = i1 - i0;
  for (let i = i0; i <= i1; i++) {
    out.push({ i, j, w: (i === i0 || i === i1 ? 0.5 : 1) / segments });
  }
  return out;
}

function insideRegion(r: Region, x: number, y: number): boolean {
  switch (r.shape) {
    case 'rect': {
      const x0 = Math.min(r.a.x, r.b.x);
      const x1 = Math.max(r.a.x, r.b.x);
      const y0 = Math.min(r.a.y, r.b.y);
      const y1 = Math.max(r.a.y, r.b.y);
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    }
    case 'circle':
      return Math.hypot(x - r.centre.x, y - r.centre.y) <= r.radius;
    case 'stroke': {
      const pts = r.points;
      if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= r.radius;
      for (let k = 0; k + 1 < pts.length; k++) {
        if (distanceToSegment(x, y, pts[k], pts[k + 1]) <= r.radius) return true;
      }
      return false;
    }
  }
}

export function distanceToSegment(x: number, y: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

function mirrorRegion(r: Region, width: number): Region {
  switch (r.shape) {
    case 'rect':
      return { ...r, a: mirrorPoint(r.a, width), b: mirrorPoint(r.b, width) };
    case 'circle':
      return { ...r, centre: mirrorPoint(r.centre, width) };
    case 'stroke':
      return { ...r, points: r.points.map((p) => mirrorPoint(p, width)) };
  }
}

/**
 * Elements forming the deck under a line load: the element rows touching the loaded nodes
 * (one above and one below the load line), across the loaded span. A distributed load on
 * void-ish elements would otherwise pull individual nodes through near-empty material.
 */
export function deckElements(mesh: Mesh, l: Load): number[] {
  if (!(l.length > 0)) return [];
  const nodes = loadNodes(mesh, l);
  if (nodes.length < 2) return [];
  const j = nodes[0].j;
  const i0 = nodes[0].i;
  const i1 = nodes[nodes.length - 1].i;
  const out: number[] = [];
  for (let ex = i0; ex < i1; ex++) {
    for (const ey of [j - 1, j]) {
      if (ey >= 0 && ey < mesh.nely) out.push(ex * mesh.nely + ey);
    }
  }
  return out;
}

/** Passive mask per element (column-wise numbering): 1 solid, −1 void, 0 designable. */
export function passiveMask(problem: Problem, mesh: Mesh): Int8Array {
  const { nelx, nely, h } = mesh;
  const mask = new Int8Array(nelx * nely);
  const regions = problem.symmetric
    ? problem.regions.flatMap((r) => [r, mirrorRegion(r, problem.width)])
    : problem.regions;
  for (const r of regions) {
    const value = r.kind === 'solid' ? 1 : r.kind === 'void' ? -1 : 0;
    for (let ex = 0; ex < nelx; ex++) {
      const x = (ex + 0.5) * h;
      for (let ey = 0; ey < nely; ey++) {
        const y = 1 - (ey + 0.5) * h;
        if (insideRegion(r, x, y)) mask[ex * nely + ey] = value;
      }
    }
  }
  for (const l of problem.loads) for (const e of deckElements(mesh, l)) mask[e] = 1;
  return mask;
}

/** Converts a problem into the arrays the optimiser needs. */
export function resolveProblem(problem: Problem, nely: number): GridProblem {
  const mesh = meshFor(problem.width, nely);
  const nDofs = 2 * (mesh.nelx + 1) * (mesh.nely + 1);
  const fixed = new Uint8Array(nDofs);
  for (const s of problem.supports) {
    for (const [i, j] of supportNodes(mesh, s)) {
      const n = nodeIndex(mesh, i, j);
      if (s.kind !== 'rollerY') fixed[2 * n + 1] = 1; // holds y
      if (s.kind !== 'rollerX') fixed[2 * n] = 1; // holds x
    }
  }
  const force = new Float64Array(nDofs);
  for (const l of problem.loads) {
    for (const { i, j, w } of loadNodes(mesh, l)) {
      const n = nodeIndex(mesh, i, j);
      force[2 * n] += w * l.fx;
      force[2 * n + 1] += w * l.fy;
    }
  }
  return {
    nelx: mesh.nelx,
    nely: mesh.nely,
    fixed,
    force,
    passive: passiveMask(problem, mesh),
    symmetric: problem.symmetric,
  };
}
