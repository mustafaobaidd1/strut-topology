import { describe, expect, it } from 'vitest';
import { cantilever, eulerBernoulliTip, exactCantilever, timoshenkoTip } from './analysis';
import { nodeXY } from './grid';

/**
 * Cantilever with L/H = 8 under a parabolic end shear of resultant P = 1, E = 1, ν = 0.3,
 * refined by halving the element size (H = 2, 4, 8, 16, 32 elements through the depth).
 */
const RATIO = 8;
const MESHES = [2, 4, 8, 16, 32];

describe('cantilever tip deflection vs Timoshenko beam theory', () => {
  const L = RATIO;
  const H = 1;
  const reference = timoshenkoTip(L, H); // scale-free: depends on L/H only

  const results = MESHES.map((nely) => {
    const r = cantilever(nely, RATIO, 'clamped');
    // Deflection scales as P/E (dimensionless here) and is independent of the element size
    // for a fixed L/H, so all meshes compare against one number.
    return { nely, tip: r.tipDeflection, error: (r.tipDeflection - reference) / reference };
  });

  it('beam-theory reference values', () => {
    expect(eulerBernoulliTip(L, H)).toBeCloseTo(2048, 10);
    expect(reference).toBeCloseTo(2048 + 24.96, 10);
  });

  it('converges monotonically from the stiff side (Q4 elements lock in bending)', () => {
    for (let i = 1; i < results.length; i++) {
      expect(results[i].tip).toBeGreaterThan(results[i - 1].tip);
      expect(Math.abs(results[i].error)).toBeLessThan(Math.abs(results[i - 1].error));
    }
    expect(results[0].error).toBeLessThan(-0.1); // 2 elements deep: -11 %, badly locked
  });

  it('is within 0.5 % of Timoshenko theory with 32 elements through the depth', () => {
    expect(Math.abs(results[results.length - 1].error)).toBeLessThan(0.005);
  });
});

describe('cantilever vs the plane-stress elasticity solution (Timoshenko & Goodier)', () => {
  // With the root displacements taken from the exact solution, the only error left is the
  // discretisation error, which for Q4 elements should fall as O(h^2).
  const errors = [4, 8, 16, 32].map((nely) => {
    const r = cantilever(nely, RATIO, 'exact');
    const exact = exactCantilever(RATIO * nely, nely);
    let maxErr = 0;
    let maxRef = 0;
    for (let n = 0; n < r.grid.nNodes; n++) {
      const [x, yTop] = nodeXY(r.grid, n);
      const [ue, ve] = exact(x, yTop - nely / 2);
      maxErr = Math.max(maxErr, Math.hypot(r.u[2 * n] - ue, r.u[2 * n + 1] - ve));
      maxRef = Math.max(maxRef, Math.hypot(ue, ve));
    }
    return maxErr / maxRef;
  });

  it('displacement error decreases at second order', () => {
    for (let i = 1; i < errors.length; i++) {
      const rate = Math.log2(errors[i - 1] / errors[i]);
      expect(rate).toBeGreaterThan(1.8);
      expect(rate).toBeLessThan(2.3);
    }
    expect(errors[errors.length - 1]).toBeLessThan(1e-3);
  });
});
