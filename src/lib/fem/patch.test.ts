import { describe, expect, it } from 'vitest';
import { centreStresses, solvePrescribed } from './analysis';
import { planeStressD, POISSON } from './element';
import { createGrid, nodeXY } from './grid';
import type { SolverKind } from './solver';

/**
 * Patch tests: a finite-element mesh must reproduce any state of uniform strain exactly
 * (Irons & Razzaque 1972; Zienkiewicz & Taylor, The Finite Element Method, vol. 1, ch. 9).
 */
describe('patch tests (uniform strain is reproduced exactly)', () => {
  const linear = (x: number, y: number): [number, number] => [
    0.01 + 0.002 * x - 0.003 * y,
    -0.02 + 0.004 * x + 0.001 * y,
  ];

  for (const kind of ['direct', 'mgcg', 'jacobi'] as SolverKind[]) {
    it(`displacement patch: interior nodes follow a linear field (${kind})`, () => {
      const grid = createGrid(8, 4);
      const fixed = new Uint8Array(grid.nDofs);
      const prescribed = new Float64Array(grid.nDofs);
      for (let n = 0; n < grid.nNodes; n++) {
        const [x, y] = nodeXY(grid, n);
        if (x === 0 || x === grid.nelx || y === 0 || y === grid.nely) {
          const [u, v] = linear(x, y);
          fixed[2 * n] = fixed[2 * n + 1] = 1;
          prescribed[2 * n] = u;
          prescribed[2 * n + 1] = v;
        }
      }
      const u = solvePrescribed(
        { grid, fixed, prescribed, force: new Float64Array(grid.nDofs) },
        kind,
      );
      let err = 0;
      for (let n = 0; n < grid.nNodes; n++) {
        const [x, y] = nodeXY(grid, n);
        const [ue, ve] = linear(x, y);
        err = Math.max(err, Math.abs(u[2 * n] - ue), Math.abs(u[2 * n + 1] - ve));
      }
      expect(err).toBeLessThan(1e-13);

      // Every element carries the same stress σ = D ε with ε = (0.002, 0.001, 0.001).
      const D = planeStressD(1, POISSON);
      const eps = [0.002, 0.001, -0.003 + 0.004];
      const sigma = [0, 1, 2].map(
        (i) => D[i * 3] * eps[0] + D[i * 3 + 1] * eps[1] + D[i * 3 + 2] * eps[2],
      );
      const s = centreStresses(grid, u);
      for (let e = 0; e < grid.nEl; e++) {
        for (let i = 0; i < 3; i++) expect(Math.abs(s[e * 3 + i] - sigma[i])).toBeLessThan(1e-13);
      }
    });
  }

  it('traction patch: uniform tension gives u = σx/E, v = −ν σ y/E everywhere', () => {
    const grid = createGrid(6, 3);
    const sigma = 0.7;
    const fixed = new Uint8Array(grid.nDofs);
    const force = new Float64Array(grid.nDofs);
    for (let n = 0; n < grid.nNodes; n++) {
      const [x, y] = nodeXY(grid, n);
      if (x === 0) fixed[2 * n] = 1; // rollers on the left edge
      if (x === 0 && y === 0) fixed[2 * n + 1] = 1; // one pin stops vertical drift
      if (x === grid.nelx) force[2 * n] = y === 0 || y === grid.nely ? sigma / 2 : sigma;
    }
    const u = solvePrescribed({ grid, fixed, prescribed: new Float64Array(grid.nDofs), force });
    for (let n = 0; n < grid.nNodes; n++) {
      const [x, y] = nodeXY(grid, n);
      expect(Math.abs(u[2 * n] - sigma * x)).toBeLessThan(1e-12);
      expect(Math.abs(u[2 * n + 1] + POISSON * sigma * y)).toBeLessThan(1e-12);
    }
  });
});
