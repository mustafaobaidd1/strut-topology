import { describe, expect, it } from 'vitest';
import { rng } from '../testing/dense';
import { Optimizer, type OptimizerParams } from './optimizer';
import { cantileverMid } from './testProblems';

/**
 * Finite-difference check of the analytic compliance gradient ∂c/∂x (through SIMP, the
 * density filter and, optionally, the tanh projection). The direct solver keeps the
 * analysis exact, so central differences are limited only by truncation and round-off.
 */
function checkGradient(params: Partial<OptimizerParams>, passive: boolean, beta = 1) {
  const problem = cantileverMid(16, 8);
  if (passive) {
    problem.passive[3 * 8 + 2] = 1; // a solid element
    problem.passive[10 * 8 + 6] = -1; // a void element
  }
  const opt = new Optimizer(problem, { solver: 'direct', ...params });
  opt.beta = beta; // setDesign keeps β
  const rand = rng(21);
  const x0 = Float64Array.from({ length: opt.grid.nEl }, () => 0.2 + 0.7 * rand());
  opt.setDesign(x0);
  const { dc } = opt.analyse();
  const analytic = Float64Array.from(dc);
  const errors: number[] = [];
  for (const e of [0, 17, 45, 64, 99, 127]) {
    if (problem.passive[e] !== 0) continue;
    // h = 1e-4: truncation error O(h²) ≈ 1e-8 relative; much smaller steps are dominated by
    // round-off in the compliance (≈ 1e-12 c / h).
    const h = 1e-4;
    const xp = Float64Array.from(x0);
    xp[e] += h;
    opt.setDesign(xp);
    const cp = opt.analyse().compliance;
    const xm = Float64Array.from(x0);
    xm[e] -= h;
    opt.setDesign(xm);
    const cm = opt.analyse().compliance;
    const fd = (cp - cm) / (2 * h);
    errors.push(Math.abs(fd - analytic[e]) / Math.abs(fd));
  }
  return errors;
}

describe('compliance sensitivity vs central finite differences', () => {
  it('density filter: relative error < 1e-5', () => {
    for (const err of checkGradient({ filter: 'density', projection: false }, false)) {
      expect(err).toBeLessThan(1e-5);
    }
  });

  it('density filter + tanh projection (β = 4): relative error < 1e-5', () => {
    for (const err of checkGradient({ filter: 'density', projection: true }, false, 4)) {
      expect(err).toBeLessThan(1e-5);
    }
  });

  it('with passive solid and void elements: relative error < 1e-5', () => {
    for (const err of checkGradient({ filter: 'density', projection: true }, true, 2)) {
      expect(err).toBeLessThan(1e-5);
    }
  });
});
