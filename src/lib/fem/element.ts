/**
 * Bilinear four-node (Q4) plane-stress element on a unit square.
 *
 * Local node order follows the 88-line code (Andreassen et al. 2011): bottom-left,
 * bottom-right, top-right, top-left, i.e. counter-clockwise with y pointing up. Each node
 * carries (u_x, u_y), so the local DOF vector is
 * [BLx, BLy, BRx, BRy, TRx, TRy, TLx, TLy].
 */

/** Poisson's ratio used throughout, as in the 88-line code. */
export const POISSON = 0.3;

/**
 * Closed-form element stiffness matrix for unit Young's modulus and unit thickness
 * (Andreassen et al. 2011, lines 8-12). Returned row-major, 8 x 8.
 */
export function elementStiffness(nu: number = POISSON): Float64Array {
  const A11 = [12, 3, -6, -3, 3, 12, 3, 0, -6, 3, 12, -3, -3, 0, -3, 12];
  const A12 = [-6, -3, 0, 3, -3, -6, -3, -6, 0, -3, -6, 3, 3, -6, 3, -6];
  const B11 = [-4, 3, -2, 9, 3, -4, -9, 4, -2, -9, -4, -3, 9, 4, -3, -4];
  const B12 = [2, -3, 4, -9, -3, 2, 9, -2, 4, 9, 2, 3, -9, -2, 3, 2];
  const ke = new Float64Array(64);
  const s = 1 / (1 - nu * nu) / 24;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const br = r >> 2;
      const bc = c >> 2;
      const ir = r & 3;
      const ic = c & 3;
      let a: number;
      let b: number;
      if (br === bc) {
        a = A11[ir * 4 + ic];
        b = B11[ir * 4 + ic];
      } else if (br === 0) {
        a = A12[ir * 4 + ic];
        b = B12[ir * 4 + ic];
      } else {
        // Lower-left block is the transpose of A12 / B12.
        a = A12[ic * 4 + ir];
        b = B12[ic * 4 + ir];
      }
      ke[r * 8 + c] = s * (a + nu * b);
    }
  }
  return ke;
}

/** Plane-stress constitutive matrix D (3 x 3, row-major) for Young's modulus `E`. */
export function planeStressD(E = 1, nu: number = POISSON): Float64Array {
  const f = E / (1 - nu * nu);
  return Float64Array.from([f, f * nu, 0, f * nu, f, 0, 0, 0, (f * (1 - nu)) / 2]);
}

/**
 * Strain-displacement matrix B (3 x 8, row-major) of the unit-square Q4 element at local
 * coordinates (x, y) in [0, 1]^2, with x to the right and y up. Strain order: [εx, εy, γxy].
 */
export function strainDisplacement(x: number, y: number): Float64Array {
  // Shape functions: N_BL = (1-x)(1-y), N_BR = x(1-y), N_TR = xy, N_TL = (1-x)y.
  const dNdx = [-(1 - y), 1 - y, y, -y];
  const dNdy = [-(1 - x), -x, x, 1 - x];
  const B = new Float64Array(24);
  for (let a = 0; a < 4; a++) {
    B[0 * 8 + 2 * a] = dNdx[a];
    B[1 * 8 + 2 * a + 1] = dNdy[a];
    B[2 * 8 + 2 * a] = dNdy[a];
    B[2 * 8 + 2 * a + 1] = dNdx[a];
  }
  return B;
}

/**
 * Stress-displacement matrix S = D B evaluated at the element centre (3 x 8, row-major),
 * used to recover element stresses: σ = E_e S u_e.
 */
export function centreStressMatrix(nu: number = POISSON): Float64Array {
  const D = planeStressD(1, nu);
  const B = strainDisplacement(0.5, 0.5);
  const S = new Float64Array(24);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 8; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += D[i * 3 + k] * B[k * 8 + j];
      S[i * 8 + j] = s;
    }
  }
  return S;
}
