import { createGrid, nodeAt } from '../fem/grid';
import type { GridProblem } from './optimizer';

/** Small hand-built grid problems shared by tests and the validation script. */

/** Half MBB beam exactly as in top88.m. */
export function mbbHalf(nelx: number, nely: number): GridProblem {
  const g = createGrid(nelx, nely);
  const fixed = new Uint8Array(g.nDofs);
  for (let d = 0; d < 2 * (nely + 1); d += 2) fixed[d] = 1;
  fixed[g.nDofs - 1] = 1;
  const force = new Float64Array(g.nDofs);
  force[1] = -1;
  return { nelx, nely, fixed, force, passive: new Int8Array(g.nEl), symmetric: false };
}

/** Cantilever clamped on the left, unit downward load at the middle of the right edge. */
export function cantileverMid(nelx: number, nely: number): GridProblem {
  const g = createGrid(nelx, nely);
  const fixed = new Uint8Array(g.nDofs);
  for (let j = 0; j <= nely; j++) {
    const n = nodeAt(g, 0, j);
    fixed[2 * n] = fixed[2 * n + 1] = 1;
  }
  const force = new Float64Array(g.nDofs);
  force[2 * nodeAt(g, nelx, Math.floor(nely / 2)) + 1] = -1;
  return { nelx, nely, fixed, force, passive: new Int8Array(g.nEl), symmetric: false };
}

/** Pins at both bottom corners and a uniform downward deck load along the bottom edge. */
export function symmetricBridge(nelx: number, nely: number, symmetric = false): GridProblem {
  const g = createGrid(nelx, nely);
  const fixed = new Uint8Array(g.nDofs);
  for (const i of [0, nelx]) {
    const n = nodeAt(g, i, nely);
    fixed[2 * n] = fixed[2 * n + 1] = 1;
  }
  const force = new Float64Array(g.nDofs);
  for (let i = 0; i <= nelx; i++) {
    force[2 * nodeAt(g, i, nely) + 1] = -(i === 0 || i === nelx ? 0.5 : 1) / nelx;
  }
  return { nelx, nely, fixed, force, passive: new Int8Array(g.nEl), symmetric };
}
