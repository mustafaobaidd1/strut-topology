import type { Grid } from './grid';

/**
 * Matrix-free, element-by-element products with the global stiffness matrix
 * K(E) = Σ_e E_e k0 (assembled over the elements' DOFs), never forming K.
 */

/** y = K(E) x over all DOFs (no boundary conditions applied). */
export function multiplyEBE(
  grid: Grid,
  ke: Float64Array,
  Ee: Float64Array,
  x: Float64Array,
  y: Float64Array,
): void {
  const { edof, nEl } = grid;
  y.fill(0);
  for (let e = 0; e < nEl; e++) {
    const o = e * 8;
    const s = Ee[e];
    const d0 = edof[o];
    const d1 = edof[o + 1];
    const d2 = edof[o + 2];
    const d3 = edof[o + 3];
    const d4 = edof[o + 4];
    const d5 = edof[o + 5];
    const d6 = edof[o + 6];
    const d7 = edof[o + 7];
    const u0 = x[d0];
    const u1 = x[d1];
    const u2 = x[d2];
    const u3 = x[d3];
    const u4 = x[d4];
    const u5 = x[d5];
    const u6 = x[d6];
    const u7 = x[d7];
    for (let r = 0; r < 8; r++) {
      const k = r * 8;
      const v =
        ke[k] * u0 +
        ke[k + 1] * u1 +
        ke[k + 2] * u2 +
        ke[k + 3] * u3 +
        ke[k + 4] * u4 +
        ke[k + 5] * u5 +
        ke[k + 6] * u6 +
        ke[k + 7] * u7;
      y[edof[o + r]] += s * v;
    }
  }
}

/**
 * y = K x restricted to the free DOFs: `x` must be zero on fixed DOFs, and the fixed rows of
 * the result are set to zero. This is the operator that conjugate gradients iterates with.
 */
export function multiplyConstrained(
  grid: Grid,
  ke: Float64Array,
  Ee: Float64Array,
  fixed: Uint8Array,
  x: Float64Array,
  y: Float64Array,
): void {
  multiplyEBE(grid, ke, Ee, x, y);
  for (let d = 0; d < y.length; d++) if (fixed[d]) y[d] = 0;
}

/** Diagonal of K(E), with fixed DOFs set to one. */
export function diagonalEBE(
  grid: Grid,
  ke: Float64Array,
  Ee: Float64Array,
  fixed: Uint8Array,
  diag: Float64Array,
): void {
  const { edof, nEl } = grid;
  diag.fill(0);
  for (let e = 0; e < nEl; e++) {
    const o = e * 8;
    const s = Ee[e];
    for (let r = 0; r < 8; r++) diag[edof[o + r]] += s * ke[r * 9];
  }
  for (let d = 0; d < diag.length; d++) if (fixed[d]) diag[d] = 1;
}

/**
 * Element energies ce_e = u_eᵀ k0 u_e (for unit Young's modulus), the quantity behind both the
 * compliance c = Σ E_e ce_e and its sensitivity.
 */
export function elementEnergies(
  grid: Grid,
  ke: Float64Array,
  u: Float64Array,
  out: Float64Array,
): void {
  const { edof, nEl } = grid;
  const ue = new Float64Array(8);
  for (let e = 0; e < nEl; e++) {
    const o = e * 8;
    for (let i = 0; i < 8; i++) ue[i] = u[edof[o + i]];
    let s = 0;
    for (let r = 0; r < 8; r++) {
      const k = r * 8;
      let v = 0;
      for (let c = 0; c < 8; c++) v += ke[k + c] * ue[c];
      s += ue[r] * v;
    }
    out[e] = s;
  }
}
