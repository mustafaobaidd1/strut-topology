import { describe, expect, it } from 'vitest';
import { maxAbsDiff, symmetricEigenvalues } from '../testing/dense';
import { elementStiffness, planeStressD, POISSON, strainDisplacement } from './element';

describe('Q4 element stiffness (Andreassen et al. 2011, closed form)', () => {
  const ke = elementStiffness();

  it('is symmetric', () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) expect(ke[r * 8 + c]).toBeCloseTo(ke[c * 8 + r], 15);
    }
  });

  it('matches 2 x 2 Gauss integration of Bᵀ D B over the unit square', () => {
    const D = planeStressD(1, POISSON);
    const g = 0.5 / Math.sqrt(3);
    const K = new Float64Array(64);
    for (const x of [0.5 - g, 0.5 + g]) {
      for (const y of [0.5 - g, 0.5 + g]) {
        const B = strainDisplacement(x, y);
        for (let i = 0; i < 8; i++) {
          for (let j = 0; j < 8; j++) {
            let s = 0;
            for (let p = 0; p < 3; p++) {
              for (let q = 0; q < 3; q++) s += B[p * 8 + i] * D[p * 3 + q] * B[q * 8 + j];
            }
            K[i * 8 + j] += 0.25 * s;
          }
        }
      }
    }
    expect(maxAbsDiff(K, ke)).toBeLessThan(1e-14);
  });

  it('has exactly three rigid-body modes and is positive semi-definite', () => {
    // Node coordinates BL(0,0) BR(1,0) TR(1,1) TL(0,1).
    const xy = [0, 0, 1, 0, 1, 1, 0, 1];
    const modes = [
      [1, 0, 1, 0, 1, 0, 1, 0],
      [0, 1, 0, 1, 0, 1, 0, 1],
      xy.flatMap((_, i) => (i % 2 === 0 ? [-xy[i + 1], xy[i]] : [])),
    ];
    for (const m of modes) {
      for (let r = 0; r < 8; r++) {
        let s = 0;
        for (let c = 0; c < 8; c++) s += ke[r * 8 + c] * m[c];
        expect(Math.abs(s)).toBeLessThan(1e-14);
      }
    }
    const ev = symmetricEigenvalues(ke, 8);
    expect(ev.filter((v) => Math.abs(v) < 1e-12)).toHaveLength(3);
    expect(ev.filter((v) => v > 1e-3)).toHaveLength(5);
  });
});
