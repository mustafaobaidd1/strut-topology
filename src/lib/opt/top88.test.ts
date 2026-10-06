import { describe, expect, it } from 'vitest';
import { Optimizer } from './optimizer';
import { mbbHalf } from './testProblems';
import { runTop88, Top88 } from './top88';

/**
 * Reference mode: the 88-line code of Andreassen, Clausen, Schevenels, Lazarov & Sigmund,
 * "Efficient topology optimization in MATLAB using 88 lines of code", Struct Multidisc Optim
 * 43:1–16 (2011). Section 3.4 / Fig. 3 use rmin = 0.04 · nelx (2.4 on the 60 × 20 MBB beam);
 * the published compliances for that mesh are 216.81 (ft = 1, sensitivity filter) and
 * 233.71 (ft = 2, density filter), and 189.14 for the Heaviside variant of section 5 with
 * rmin = 0.03 · nelx = 1.8 (values collected in the brief's research notes).
 */
describe('88-line reference mode (MBB beam 60 × 20, volfrac 0.5, penal 3)', () => {
  const sens = runTop88(60, 20, 0.5, 3, 2.4, 1);
  const dens = runTop88(60, 20, 0.5, 3, 2.4, 2);

  it('first iteration: uniform x = 0.5 gives the same deterministic compliance for both filters', () => {
    expect(sens.lines[0].c).toBeCloseTo(dens.lines[0].c, 9);
    expect(Top88.format(sens.lines[0])).toBe(
      ' It.:    1 Obj.:  1007.0221 Vol.:  0.500 ch.:  0.200',
    );
  });

  it('first-iteration compliance equals the solid compliance divided by E(0.5)', () => {
    // K scales uniformly with E = Emin + 0.5³(1 − Emin), so c₁ = c_solid / E(0.5).
    const solid = new Top88(60, 20, 1, 3, 2.4, 2);
    const cSolid = solid.step().c;
    const E = 1e-9 + 0.125 * (1 - 1e-9);
    expect(Math.abs(sens.lines[0].c - cSolid / E) / sens.lines[0].c).toBeLessThan(1e-10);
  });

  it('sensitivity filter (ft = 1) reproduces the published c = 216.81', () => {
    const final = sens.lines[sens.lines.length - 1];
    expect(Number(final.c.toFixed(2))).toBe(216.81);
    expect(final.change).toBeLessThanOrEqual(0.01);
    expect(final.vol).toBeCloseTo(0.5, 3);
    expect(sens.lines.length).toBe(106);
  });

  it('density filter (ft = 2) reproduces the published c = 233.71', () => {
    const final = dens.lines[dens.lines.length - 1];
    expect(Number(final.c.toFixed(2))).toBe(233.71);
    expect(dens.lines.length).toBe(144);
  });

  it('Heaviside variant (ft = 3, rmin = 1.8, β → 512) reproduces the published c = 189.14', () => {
    const heav = runTop88(60, 20, 0.5, 3, 1.8, 3);
    const final = heav.lines[heav.lines.length - 1];
    expect(Number(final.c.toFixed(2))).toBe(189.14);
    expect(final.beta).toBe(512);
  }, 60_000);

  it('the general optimiser in 88-line settings follows the port iteration by iteration', () => {
    const opt = new Optimizer(mbbHalf(60, 20), {
      volfrac: 0.5,
      penal: 3,
      rmin: 2.4,
      filter: 'density',
      projection: false,
      ocMode: 'top88',
      solver: 'direct',
      changeTol: 0.01,
      stallTol: 0,
      Emin: 1e-9,
    });
    for (const line of dens.lines) {
      const r = opt.step();
      expect(Math.abs(r.compliance - line.c) / line.c).toBeLessThan(1e-9);
    }
    expect(opt.step().compliance).toBeLessThan(dens.lines[0].c);
  }, 60_000);

  it('the interactive MGCG solver reaches the same published value', () => {
    const run = runTop88(60, 20, 0.5, 3, 2.4, 2, 2000, 'mgcg');
    expect(Number(run.lines[run.lines.length - 1].c.toFixed(2))).toBe(233.71);
  }, 60_000);
});
