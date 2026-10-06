import { describe, expect, it } from 'vitest';
import { maxAbs, maxAbsDiff, rng } from '../testing/dense';
import { factorBand, solveBand, stencilToBand } from './banded';
import { multiplyConstrained } from './ebe';
import { elementStiffness } from './element';
import { createGrid, nodeAt, type Grid } from './grid';
import { Multigrid } from './multigrid';
import { ElasticSolver } from './solver';
import { Optimizer } from '../opt/optimizer';
import { cantileverMid } from '../opt/testProblems';
import {
  applyDirichlet,
  assembleUniform,
  createStencil,
  stencilMultiply,
  type Stencil,
} from './stencil';

const ke = elementStiffness();

/** A cantilever-like setup on `grid` with a random black-and-white-ish design. */
function randomProblem(grid: Grid, seed: number, contrast = 1e-9) {
  const rand = rng(seed);
  const Ee = new Float64Array(grid.nEl);
  for (let e = 0; e < grid.nEl; e++) {
    const r = rand();
    Ee[e] = r < 0.35 ? contrast : r < 0.45 ? 0.2 + 0.6 * rand() : 1;
  }
  const fixed = new Uint8Array(grid.nDofs);
  for (let j = 0; j <= grid.nely; j++) {
    const n = nodeAt(grid, 0, j);
    fixed[2 * n] = fixed[2 * n + 1] = 1;
  }
  const F = new Float64Array(grid.nDofs);
  F[2 * nodeAt(grid, grid.nelx, grid.nely >> 1) + 1] = -1;
  F[2 * nodeAt(grid, grid.nelx >> 1, 0)] = 0.3;
  return { Ee, fixed, F };
}

function stencilToDense(st: Stencil): Float64Array {
  const n = st.nNodes * 2;
  const A = new Float64Array(n * n);
  for (let node = 0; node < st.nNodes; node++) {
    for (let k = 0; k < 9; k++) {
      const m = st.nbr[node * 9 + k];
      if (m === node && k !== 4) continue;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          A[(2 * node + r) * n + 2 * m + c] = st.a[(node * 9 + k) * 4 + r * 2 + c];
        }
      }
    }
  }
  return A;
}

/** Dense bilinear prolongation from (nelx/2, nely/2) to (nelx, nely); fixed rows zeroed. */
function denseProlongation(nelx: number, nely: number, fixed: Uint8Array | null): Float64Array {
  const fnny = nely + 1;
  const cnny = nely / 2 + 1;
  const nf = 2 * (nelx + 1) * fnny;
  const nc = 2 * (nelx / 2 + 1) * cnny;
  const P = new Float64Array(nf * nc);
  const w = (p: number, q: number) => Math.max(0, 1 - Math.abs(p - 2 * q) / 2);
  for (let i = 0; i <= nelx; i++) {
    for (let j = 0; j <= nely; j++) {
      for (let I = 0; I <= nelx / 2; I++) {
        for (let J = 0; J <= nely / 2; J++) {
          const v = w(i, I) * w(j, J);
          if (v === 0) continue;
          for (let r = 0; r < 2; r++) {
            const fd = 2 * (i * fnny + j) + r;
            if (fixed && fixed[fd]) continue;
            P[fd * nc + 2 * (I * cnny + J) + r] = v;
          }
        }
      }
    }
  }
  return P;
}

function galerkinDense(A: Float64Array, P: Float64Array, nf: number, nc: number): Float64Array {
  const AP = new Float64Array(nf * nc);
  for (let i = 0; i < nf; i++) {
    for (let k = 0; k < nf; k++) {
      const a = A[i * nf + k];
      if (a === 0) continue;
      for (let j = 0; j < nc; j++) AP[i * nc + j] += a * P[k * nc + j];
    }
  }
  const C = new Float64Array(nc * nc);
  for (let k = 0; k < nf; k++) {
    for (let i = 0; i < nc; i++) {
      const p = P[k * nc + i];
      if (p === 0) continue;
      for (let j = 0; j < nc; j++) C[i * nc + j] += p * AP[k * nc + j];
    }
  }
  return C;
}

describe('assembled stencil', () => {
  it('equals the matrix-free element-by-element operator', () => {
    const grid = createGrid(12, 6);
    const { Ee, fixed } = randomProblem(grid, 1);
    const st = createStencil(12, 6);
    assembleUniform(st, ke, Ee);
    applyDirichlet(st, fixed);
    const rand = rng(2);
    const x = Float64Array.from({ length: grid.nDofs }, (_, d) => (fixed[d] ? 0 : rand() - 0.5));
    const y1 = new Float64Array(grid.nDofs);
    const y2 = new Float64Array(grid.nDofs);
    multiplyConstrained(grid, ke, Ee, fixed, x, y1);
    stencilMultiply(st, x, y2);
    expect(maxAbsDiff(y1, y2)).toBeLessThan(1e-14);
  });
});

describe('banded Cholesky', () => {
  it('solves the assembled system to round-off', () => {
    const grid = createGrid(10, 5);
    const { Ee, fixed, F } = randomProblem(grid, 3, 1e-3);
    const st = createStencil(10, 5);
    assembleUniform(st, ke, Ee);
    applyDirichlet(st, fixed);
    const band = stencilToBand(st);
    factorBand(band);
    const b = Float64Array.from(F, (v, d) => (fixed[d] ? 0 : v));
    const x = new Float64Array(grid.nDofs);
    solveBand(band, b, x);
    const r = new Float64Array(grid.nDofs);
    stencilMultiply(st, x, r);
    expect(maxAbsDiff(r, b) / maxAbs(b)).toBeLessThan(1e-10);
  });
});

describe('multigrid hierarchy', () => {
  it('coarse operators are exact Galerkin products PᵀAP with supports masked', () => {
    const grid = createGrid(16, 8);
    const { Ee, fixed } = randomProblem(grid, 4, 1e-3);
    const mg = new Multigrid(16, 8, { coarseNodes: 0 });
    expect(mg.depth).toBe(3);
    mg.update(ke, Ee, fixed);
    const [L0, L1, L2] = mg.levels;
    const A0 = stencilToDense(L0.stencil);
    // Undo the unit diagonal of fixed DOFs: P has zero rows there, so it never matters.
    const P0 = denseProlongation(16, 8, fixed);
    const nf0 = 2 * 17 * 9;
    const nc0 = 2 * 9 * 5;
    const C1 = galerkinDense(A0, P0, nf0, nc0);
    expect(maxAbsDiff(C1, stencilToDense(L1.stencil)) / maxAbs(C1)).toBeLessThan(1e-13);
    const P1 = denseProlongation(8, 4, null);
    const C2 = galerkinDense(stencilToDense(L1.stencil), P1, nc0, 2 * 5 * 3);
    expect(maxAbsDiff(C2, stencilToDense(L2.stencil)) / maxAbs(C2)).toBeLessThan(1e-13);
  });
});

describe('iterative solvers agree with the direct solver', () => {
  // A realistic operator: an optimised cantilever (black members in Emin = 1e-9 void).
  const opt = new Optimizer(cantileverMid(96, 32), { volfrac: 0.3, solver: 'direct' });
  for (let k = 0; k < 40; k++) opt.step();
  const grid = opt.grid;
  const Ee = Float64Array.from(opt.Ee);
  const fixed = opt.problem.fixed;
  const F = opt.problem.force;
  const direct = new Float64Array(grid.nDofs);
  new ElasticSolver(grid, ke, { kind: 'direct' }).solve(Ee, fixed, F, direct);
  const scale = maxAbs(direct);

  it('MGCG on an optimised design (contrast 1e-9) matches to 1e-7 in few iterations', () => {
    const u = new Float64Array(grid.nDofs);
    const s = new ElasticSolver(grid, ke, { kind: 'mgcg', tol: 1e-10 }).solve(Ee, fixed, F, u);
    expect(s.converged).toBe(true);
    expect(s.iterations).toBeLessThan(45);
    expect(maxAbsDiff(u, direct) / scale).toBeLessThan(1e-7);
  });

  it('Jacobi-PCG also converges (with many more iterations)', () => {
    const g2 = createGrid(24, 8);
    const p2 = randomProblem(g2, 6, 1e-3);
    const d2 = new Float64Array(g2.nDofs);
    new ElasticSolver(g2, ke, { kind: 'direct' }).solve(p2.Ee, p2.fixed, p2.F, d2);
    const u = new Float64Array(g2.nDofs);
    const s = new ElasticSolver(g2, ke, { kind: 'jacobi', tol: 1e-12, maxIter: 20000 }).solve(
      p2.Ee,
      p2.fixed,
      p2.F,
      u,
    );
    expect(s.converged).toBe(true);
    expect(maxAbsDiff(u, d2) / maxAbs(d2)).toBeLessThan(1e-8);
  });

  it('a warm start from a nearby solution saves iterations', () => {
    const solver = new ElasticSolver(grid, ke, { kind: 'mgcg', tol: 1e-8 });
    const cold = new Float64Array(grid.nDofs);
    const coldStats = solver.solve(Ee, fixed, F, cold);
    const Ee2 = Float64Array.from(Ee, (v, e) => (e % 7 === 0 ? Math.min(1, v * 1.05) : v));
    const warm = Float64Array.from(cold);
    const warmStats = solver.solve(Ee2, fixed, F, warm);
    expect(warmStats.iterations).toBeLessThan(coldStats.iterations);
  });
});
