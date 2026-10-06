import { centreStressMatrix, elementStiffness, POISSON } from './element';
import { multiplyEBE } from './ebe';
import { createGrid, nodeAt, type Grid } from './grid';
import { ElasticSolver, type SolverKind } from './solver';

/**
 * Small linear-elastic analyses on a uniform, fully solid grid, used to validate the element
 * and the solvers against closed-form solutions (patch tests, cantilever beams).
 */

export interface PrescribedProblem {
  grid: Grid;
  /** 1 where the DOF is prescribed. */
  fixed: Uint8Array;
  /** Prescribed displacement values (ignored where not fixed). */
  prescribed: Float64Array;
  /** External nodal forces. */
  force: Float64Array;
}

/** Solves K u = F with inhomogeneous Dirichlet data: K_ff u_f = F_f − K_fp u_p. */
export function solvePrescribed(p: PrescribedProblem, kind: SolverKind = 'direct'): Float64Array {
  const { grid, fixed, prescribed, force } = p;
  const ke = elementStiffness();
  const Ee = new Float64Array(grid.nEl).fill(1);
  const up = new Float64Array(grid.nDofs);
  for (let d = 0; d < grid.nDofs; d++) if (fixed[d]) up[d] = prescribed[d];
  const Kup = new Float64Array(grid.nDofs);
  multiplyEBE(grid, ke, Ee, up, Kup);
  const rhs = new Float64Array(grid.nDofs);
  for (let d = 0; d < grid.nDofs; d++) rhs[d] = fixed[d] ? 0 : force[d] - Kup[d];
  const du = new Float64Array(grid.nDofs);
  new ElasticSolver(grid, ke, { kind, tol: 1e-13, maxIter: 5000 }).solve(Ee, fixed, rhs, du);
  for (let d = 0; d < grid.nDofs; d++) du[d] += up[d];
  return du;
}

/** Element-centre stresses [σx, σy, τxy] for unit modulus. */
export function centreStresses(grid: Grid, u: Float64Array): Float64Array {
  const S = centreStressMatrix();
  const out = new Float64Array(grid.nEl * 3);
  for (let e = 0; e < grid.nEl; e++) {
    for (let i = 0; i < 3; i++) {
      let s = 0;
      for (let k = 0; k < 8; k++) s += S[i * 8 + k] * u[grid.edof[e * 8 + k]];
      out[e * 3 + i] = s;
    }
  }
  return out;
}

/**
 * Consistent nodal forces for a traction t(s) along a straight chain of nodes spaced one
 * element apart; `t` is evaluated at the chain coordinate s in [0, count].
 * Simpson's rule integrates t·N exactly for cubic integrands (quadratic tractions).
 */
export function consistentEdgeLoads(count: number, t: (s: number) => number): Float64Array {
  const f = new Float64Array(count + 1);
  for (let k = 0; k < count; k++) {
    const a = k;
    const b = k + 1;
    const m = (a + b) / 2;
    // N_a = (b − s), N_b = (s − a) on a unit segment.
    f[k] += (t(a) * 1 + 4 * t(m) * 0.5 + t(b) * 0) / 6;
    f[k + 1] += (t(a) * 0 + 4 * t(m) * 0.5 + t(b) * 1) / 6;
  }
  return f;
}

export interface CantileverResult {
  nelx: number;
  nely: number;
  /** Downward deflection of the neutral axis at the loaded end (positive number). */
  tipDeflection: number;
  u: Float64Array;
  grid: Grid;
}

export type RootCondition = 'clamped' | 'exact';

/**
 * Cantilever of depth H = nely and length L = ratio·H (element size 1), loaded at the free
 * end by a parabolic shear traction with resultant P (downward).
 * - `clamped`: every root node fixed (the usual engineering idealisation).
 * - `exact`: root nodes follow the plane-stress elasticity solution (see `exactCantilever`).
 */
export function cantilever(
  nely: number,
  ratio: number,
  root: RootCondition,
  P = 1,
  kind: SolverKind = 'direct',
): CantileverResult {
  const H = nely;
  const L = ratio * nely;
  const nelx = L;
  const grid = createGrid(nelx, nely);
  const fixed = new Uint8Array(grid.nDofs);
  const prescribed = new Float64Array(grid.nDofs);
  const force = new Float64Array(grid.nDofs);
  const I = H ** 3 / 12;
  const exact = exactCantilever(L, H, P);
  for (let j = 0; j <= nely; j++) {
    const n = nodeAt(grid, 0, j);
    fixed[2 * n] = 1;
    fixed[2 * n + 1] = 1;
    if (root === 'exact') {
      const yAxis = nely - j - H / 2;
      const [ux, uy] = exact(0, yAxis);
      prescribed[2 * n] = ux;
      prescribed[2 * n + 1] = uy;
    }
  }
  // Chain coordinate s runs from the bottom (s = 0) to the top (s = H) of the loaded end.
  const traction = (s: number) => {
    const y = s - H / 2;
    return (P / (2 * I)) * (y * y - (H * H) / 4);
  };
  const f = consistentEdgeLoads(nely, traction);
  for (let k = 0; k <= nely; k++) {
    const j = nely - k;
    force[2 * nodeAt(grid, nelx, j) + 1] += f[k];
  }
  const u = solvePrescribed({ grid, fixed, prescribed, force }, kind);
  const mid = nodeAt(grid, nelx, nely / 2);
  return { nelx, nely, tipDeflection: -u[2 * mid + 1], u, grid };
}

/**
 * Plane-stress elasticity solution for an end-loaded cantilever (Timoshenko & Goodier;
 * form of Augarde & Deeks 2008): root at x = 0, load P downward at x = L, y measured from
 * the neutral axis, unit thickness and unit Young's modulus.
 */
export function exactCantilever(
  L: number,
  H: number,
  P = 1,
  nu = POISSON,
): (x: number, y: number) => [number, number] {
  const I = H ** 3 / 12;
  return (x, y) => [
    ((P * y) / (6 * I)) * ((6 * L - 3 * x) * x + (2 + nu) * y * y - 1.5 * H * H * (1 + nu)),
    (-P / (6 * I)) * (3 * nu * y * y * (L - x) + (3 * L - x) * x * x),
  ];
}

/** Timoshenko beam theory: δ = PL³/(3EI) + PL/(κGA), κ = 5/6 (unit thickness, E = 1). */
export function timoshenkoTip(L: number, H: number, P = 1, nu = POISSON, kappa = 5 / 6): number {
  const I = H ** 3 / 12;
  const G = 1 / (2 * (1 + nu));
  return (P * L ** 3) / (3 * I) + (P * L) / (kappa * G * H);
}

/** Euler-Bernoulli beam theory: δ = PL³/(3EI). */
export function eulerBernoulliTip(L: number, H: number, P = 1): number {
  return (P * L ** 3) / (3 * (H ** 3 / 12));
}
