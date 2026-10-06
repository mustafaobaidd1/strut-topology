import { describe, expect, it } from 'vitest';
import { rng } from '../testing/dense';
import { HatFilter } from './filter';
import { inverseProjectTanh, projectTanh, projectTanhDerivative } from './projection';
import { ocBisect88, ocCandidate, ocIllinois } from './oc';

describe('hat filter (88-line construction)', () => {
  it('uses the 3 x 3 neighbourhood of rmin = 1.5 with weights max(0, rmin − distance)', () => {
    const f = new HatFilter(5, 4, 1.5);
    const weights = new Map<string, number>();
    for (let k = 0; k < f.w.length; k++) weights.set(`${f.dx[k]},${f.dy[k]}`, f.w[k]);
    expect(weights.size).toBe(9);
    expect(weights.get('0,0')).toBeCloseTo(1.5, 15);
    expect(weights.get('1,0')).toBeCloseTo(0.5, 15);
    expect(weights.get('1,1')).toBeCloseTo(1.5 - Math.SQRT2, 15);
    // Interior Hs = 1.5 + 4·0.5 + 4·(1.5 − √2); a corner keeps 4 of the 9 terms.
    const interior = 1.5 + 2 + 4 * (1.5 - Math.SQRT2);
    expect(f.Hs[1 * 4 + 1]).toBeCloseTo(interior, 14);
    expect(f.Hs[0]).toBeCloseTo(1.5 + 1 + (1.5 - Math.SQRT2), 14);
  });

  it('leaves a uniform field unchanged and is consistent with its transpose', () => {
    const f = new HatFilter(17, 9, 2.7);
    const n = 17 * 9;
    const out = new Float64Array(n);
    f.apply(new Float64Array(n).fill(0.37), out);
    for (const v of out) expect(v).toBeCloseTo(0.37, 14);
    const rand = rng(11);
    const x = Float64Array.from({ length: n }, () => rand());
    const y = Float64Array.from({ length: n }, () => rand());
    const Fx = new Float64Array(n);
    const FTy = new Float64Array(n);
    f.apply(x, Fx);
    f.applyTranspose(y, FTy);
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      a += Fx[i] * y[i];
      b += x[i] * FTy[i];
    }
    expect(Math.abs(a - b) / Math.abs(a)).toBeLessThan(1e-13);
  });

  it('volume weights reproduce the filtered volume exactly (passive elements skipped)', () => {
    const f = new HatFilter(12, 6, 2.2);
    const n = 72;
    const rand = rng(3);
    const x = Float64Array.from({ length: n }, () => rand());
    const passive = new Int8Array(n);
    passive[5] = 1;
    passive[40] = -1;
    const xt = new Float64Array(n);
    f.apply(x, xt);
    let direct = 0;
    for (let e = 0; e < n; e++) if (!passive[e]) direct += xt[e];
    const w = f.volumeWeights(passive);
    let viaWeights = 0;
    for (let e = 0; e < n; e++) viaWeights += w[e] * x[e];
    expect(viaWeights).toBeCloseTo(direct, 12);
  });
});

describe('tanh projection (Wang, Lazarov & Sigmund 2011)', () => {
  it('maps 0 → 0, 1 → 1, η → η and sharpens with β', () => {
    for (const beta of [1, 8, 64]) {
      expect(projectTanh(0, beta, 0.5)).toBeCloseTo(0, 14);
      expect(projectTanh(1, beta, 0.5)).toBeCloseTo(1, 14);
      expect(projectTanh(0.5, beta, 0.5)).toBeCloseTo(0.5, 14);
    }
    expect(projectTanh(0.6, 64, 0.5)).toBeGreaterThan(0.99);
    expect(projectTanh(0.4, 64, 0.5)).toBeLessThan(0.01);
  });

  it('has the right derivative and inverse', () => {
    for (const beta of [1, 4, 16]) {
      for (const x of [0.1, 0.45, 0.5, 0.8]) {
        const h = 1e-6;
        const fd = (projectTanh(x + h, beta, 0.4) - projectTanh(x - h, beta, 0.4)) / (2 * h);
        expect(Math.abs(fd - projectTanhDerivative(x, beta, 0.4))).toBeLessThan(1e-7 * beta);
      }
      expect(projectTanh(inverseProjectTanh(0.3, beta, 0.5), beta, 0.5)).toBeCloseTo(0.3, 12);
    }
  });
});

describe('optimality-criteria update', () => {
  const n = 200;
  const rand = rng(9);
  const x = Float64Array.from({ length: n }, () => 0.2 + 0.6 * rand());
  const dc = Float64Array.from({ length: n }, () => -0.1 - 10 * rand());
  const dv = new Float64Array(n).fill(1);
  const target = 0.45 * n;
  const sum = (v: Float64Array) => v.reduce((s, a) => s + a, 0);

  it('the 88-line bisection meets the volume and respects bounds and move limits', () => {
    const xnew = new Float64Array(n);
    const r = ocBisect88(x, dc, dv, 0.2, sum, target, xnew);
    expect(Math.abs(r.volume - target) / target).toBeLessThan(2e-3);
    for (let e = 0; e < n; e++) {
      expect(xnew[e]).toBeGreaterThanOrEqual(Math.max(0, x[e] - 0.2) - 1e-15);
      expect(xnew[e]).toBeLessThanOrEqual(Math.min(1, x[e] + 0.2) + 1e-15);
    }
  });

  it('the bracketed Illinois search finds the same multiplier far more tightly', () => {
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    const bis = ocBisect88(x, dc, dv, 0.2, sum, target, a);
    const ill = ocIllinois(x, dc, dv, null, 0.2, sum, target, 1, b);
    expect(Math.abs(ill.volume - target)).toBeLessThan(1e-7 * n);
    expect(Math.abs(Math.log(ill.lambda / bis.lambda))).toBeLessThan(5e-3);
    expect(ill.evaluations).toBeLessThan(bis.evaluations);
  });

  it('keeps non-design elements fixed', () => {
    const design = new Uint8Array(n).fill(1);
    design[3] = 0;
    const out = new Float64Array(n);
    ocCandidate(x, dc, dv, design, 0.2, 0.5, out);
    expect(out[3]).toBe(x[3]);
  });
});
