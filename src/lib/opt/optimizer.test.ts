import { describe, expect, it } from 'vitest';
import { mirrorMap, Optimizer, resampleDesign } from './optimizer';
import { cantileverMid, symmetricBridge } from './testProblems';

function asymmetry(x: Float64Array, nelx: number, nely: number): number {
  const m = mirrorMap(nelx, nely);
  let a = 0;
  for (let e = 0; e < x.length; e++) a = Math.max(a, Math.abs(x[e] - x[m[e]]));
  return a;
}

describe('optimiser behaviour', () => {
  it('meets the volume constraint every iteration and lowers the compliance', () => {
    const opt = new Optimizer(cantileverMid(48, 24), { volfrac: 0.4, rmin: 1.8 });
    const first = opt.step();
    let last = first;
    for (let k = 0; k < 60; k++) {
      last = opt.step();
      expect(Math.abs(last.volume - 0.4)).toBeLessThan(1e-6);
    }
    expect(last.compliance).toBeLessThan(0.25 * first.compliance);
    expect(last.grayness).toBeLessThan(first.grayness);
  });

  it('keeps passive regions at their prescribed densities', () => {
    const p = cantileverMid(32, 16);
    for (let ey = 0; ey < 16; ey++) p.passive[20 * 16 + ey] = -1; // a void column
    for (let ex = 0; ex < 4; ex++) p.passive[ex * 16 + 15] = 1; // a solid strip
    const opt = new Optimizer(p, { volfrac: 0.5, projection: true });
    for (let k = 0; k < 30; k++) opt.step();
    for (let e = 0; e < p.passive.length; e++) {
      if (p.passive[e] === 1) expect(opt.xPhys[e]).toBe(1);
      if (p.passive[e] === -1) expect(opt.xPhys[e]).toBe(0);
    }
  });

  it('a symmetric problem yields a symmetric design without enforcing symmetry', () => {
    const nelx = 64;
    const nely = 24;
    const direct = new Optimizer(symmetricBridge(nelx, nely), { solver: 'direct', volfrac: 0.3 });
    for (let k = 0; k < 60; k++) direct.step();
    expect(asymmetry(direct.xPhys, nelx, nely)).toBeLessThan(1e-8);
    // With the iterative solver the asymmetry stays at the level of its tolerance.
    const mgcg = new Optimizer(symmetricBridge(nelx, nely), { volfrac: 0.3 });
    for (let k = 0; k < 60; k++) mgcg.step();
    expect(asymmetry(mgcg.xPhys, nelx, nely)).toBeLessThan(1e-3);
  });

  it('the symmetry option makes the design exactly symmetric even under asymmetric load', () => {
    const p = cantileverMid(40, 20);
    p.symmetric = true;
    const opt = new Optimizer(p, { volfrac: 0.4 });
    for (let k = 0; k < 25; k++) opt.step();
    expect(asymmetry(opt.x, 40, 20)).toBe(0);
  });

  it('warm-starts after an edit and resamples the design onto a new grid', () => {
    const opt = new Optimizer(cantileverMid(32, 16), { volfrac: 0.4 });
    for (let k = 0; k < 30; k++) opt.step();
    const before = Float64Array.from(opt.x);
    const moved = cantileverMid(32, 16);
    moved.force.fill(0);
    moved.force[2 * (32 * 17 + 4) + 1] = -1; // load moves up the right edge
    opt.setProblem(moved);
    expect(opt.runIteration).toBe(0);
    expect(Array.from(opt.x)).toEqual(Array.from(before));
    const r = opt.step();
    expect(r.solve.converged).toBe(true);
    opt.setProblem(cantileverMid(64, 32));
    expect(opt.x.length).toBe(64 * 32);
    expect(Math.abs(opt.volume - 0.4)).toBeLessThan(0.05);
  });

  it('bilinear resampling preserves constants', () => {
    const out = resampleDesign(new Float64Array(12).fill(0.3), 4, 3, 8, 6);
    for (const v of out) expect(v).toBeCloseTo(0.3, 14);
  });

  it('reports convergence by the change rule or by a compliance stall', () => {
    const opt = new Optimizer(cantileverMid(30, 15), { volfrac: 0.5, rmin: 1.5, maxIter: 400 });
    let r = opt.step();
    while (!r.converged && opt.runIteration < 400) r = opt.step();
    expect(r.converged).toBe(true);
    expect(['change', 'stall']).toContain(r.convergedBy);
  });
});
