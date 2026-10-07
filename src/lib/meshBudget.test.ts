import { describe, expect, it } from 'vitest';
import { meshWarning, predictIterationMs } from './meshBudget';

describe('mesh budget warning', () => {
  it('scales the measured iteration time with the element count', () => {
    expect(predictIterationMs(40, 5760, 5760)).toBeCloseTo(40, 10);
    const p = predictIterationMs(40, 5760, 40960);
    expect(p).toBeGreaterThan(40 * 7.1);
    expect(p).toBeLessThan(40 * 7.1 * 1.3);
  });

  it('warns only when the predicted iteration is slow', () => {
    expect(meshWarning(30, 5760, 40960, 32)).toBeNull();
    expect(meshWarning(120, 5760, 40960, 8)).toMatch(/about \d\.\d s per iteration/);
  });

  it('falls back on the core count before anything has been measured', () => {
    expect(meshWarning(NaN, 0, 40960, 4)).toMatch(/may be too fine/);
    expect(meshWarning(NaN, 0, 40960, 16)).toBeNull();
    expect(meshWarning(NaN, 0, 5760, 2)).toBeNull();
  });
});
