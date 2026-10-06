import { centreStressMatrix, POISSON } from './element';
import type { Grid } from './grid';

/**
 * Element fields derived from a solved design, for the stress, energy and deformation views.
 */

/**
 * von Mises stress at element centres, σ = E_e D B u_e (the stress the SIMP model carries):
 * σ_vm = sqrt(σx² − σx σy + σy² + 3 τxy²) for plane stress.
 */
export function vonMises(grid: Grid, Ee: Float64Array, u: Float64Array, out: Float32Array): void {
  const S = centreStressMatrix(POISSON);
  const { edof, nEl } = grid;
  for (let e = 0; e < nEl; e++) {
    const o = e * 8;
    let sx = 0;
    let sy = 0;
    let txy = 0;
    for (let k = 0; k < 8; k++) {
      const ue = u[edof[o + k]];
      sx += S[k] * ue;
      sy += S[8 + k] * ue;
      txy += S[16 + k] * ue;
    }
    const E = Ee[e];
    sx *= E;
    sy *= E;
    txy *= E;
    out[e] = Math.sqrt(Math.max(0, sx * sx - sx * sy + sy * sy + 3 * txy * txy));
  }
}

/** Strain-energy density ½ E_e u_eᵀ k0 u_e per unit area (elements have unit area). */
export function strainEnergyDensity(Ee: Float64Array, ce: Float64Array, out: Float32Array): void {
  for (let e = 0; e < Ee.length; e++) out[e] = 0.5 * Ee[e] * ce[e];
}

/**
 * A robust colour-scale maximum: the given quantile of `values` over elements whose density
 * exceeds `minDensity` (falls back to all elements). Point loads and re-entrant corners create
 * singular peaks that would otherwise wash out the map.
 */
export function robustMax(
  values: ArrayLike<number>,
  density: ArrayLike<number>,
  quantile = 0.98,
  minDensity = 0.5,
): number {
  const picked: number[] = [];
  for (let e = 0; e < values.length; e++) if (density[e] > minDensity) picked.push(values[e]);
  const src = picked.length > 8 ? picked : Array.from(values);
  if (src.length === 0) return 1;
  src.sort((a, b) => a - b);
  const v = src[Math.min(src.length - 1, Math.floor(quantile * (src.length - 1)))];
  return v > 0 ? v : Math.max(1e-30, src[src.length - 1]);
}

/** Largest nodal displacement magnitude. */
export function maxDisplacement(u: ArrayLike<number>): number {
  let m = 0;
  for (let n = 0; n < u.length; n += 2) m = Math.max(m, Math.hypot(u[n], u[n + 1]));
  return m;
}
