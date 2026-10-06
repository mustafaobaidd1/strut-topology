import { CENTRE, type Stencil } from './stencil';

/**
 * Banded Cholesky factorisation (A = L Lᵀ) of a symmetric positive-definite matrix. Row i of
 * L is stored densely for columns i - bw .. i, so the dot products of the factorisation run
 * over contiguous memory. Used as the exact solver of the coarsest multigrid level and of the
 * 88-line reference mode.
 */
export interface BandedCholesky {
  readonly n: number;
  readonly bw: number;
  /** data[i * (bw + 1) + (j - i + bw)] = L[i][j] for i - bw <= j <= i. */
  readonly data: Float64Array;
}

/** Copies an assembled stencil into lower-band storage (DOF d = 2 n + component). */
export function stencilToBand(st: Stencil): BandedCholesky {
  const { a, nbr, nNodes, nny } = st;
  const n = nNodes * 2;
  // Furthest coupling: the diagonal neighbour one column away, i.e. nny + 1 nodes.
  const bw = 2 * (nny + 1) + 1;
  const w = bw + 1;
  const data = new Float64Array(n * w);
  for (let node = 0; node < nNodes; node++) {
    for (let k = 0; k < 9; k++) {
      const m = nbr[node * 9 + k];
      if (m === node && k !== CENTRE) continue; // outside the grid
      const o = (node * 9 + k) * 4;
      for (let r = 0; r < 2; r++) {
        const i = 2 * node + r;
        for (let c = 0; c < 2; c++) {
          const j = 2 * m + c;
          if (j > i) continue; // lower triangle only
          data[i * w + (j - i + bw)] = a[o + r * 2 + c];
        }
      }
    }
  }
  return { n, bw, data };
}

/**
 * In-place factorisation. Rows whose diagonal is exactly zero (structurally empty DOFs) are
 * replaced by identity rows first. Throws if the matrix is not positive definite.
 */
export function factorBand(m: BandedCholesky): void {
  const { n, bw, data } = m;
  const w = bw + 1;
  for (let i = 0; i < n; i++) {
    if (data[i * w + bw] === 0) {
      let empty = true;
      for (let p = 0; p < bw; p++) if (data[i * w + p] !== 0) empty = false;
      if (empty) data[i * w + bw] = 1;
    }
  }
  for (let i = 0; i < n; i++) {
    const ri = i * w;
    const j0 = Math.max(0, i - bw);
    for (let j = j0; j <= i; j++) {
      const rj = j * w;
      let s = data[ri + (j - i + bw)];
      // k runs over max(i, j) - bw .. j - 1 = i - bw .. j - 1 (since j <= i).
      const k0 = Math.max(0, i - bw);
      for (let k = k0; k < j; k++) s -= data[ri + (k - i + bw)] * data[rj + (k - j + bw)];
      if (j === i) {
        if (!(s > 0)) throw new Error(`Matrix is not positive definite (row ${i})`);
        data[ri + bw] = Math.sqrt(s);
      } else {
        data[ri + (j - i + bw)] = s / data[rj + bw];
      }
    }
  }
}

/** Solves L Lᵀ x = b; `x` may alias `b`. */
export function solveBand(m: BandedCholesky, b: Float64Array, x: Float64Array): void {
  const { n, bw, data } = m;
  const w = bw + 1;
  if (x !== b) x.set(b);
  for (let i = 0; i < n; i++) {
    const ri = i * w;
    let s = x[i];
    for (let k = Math.max(0, i - bw); k < i; k++) s -= data[ri + (k - i + bw)] * x[k];
    x[i] = s / data[ri + bw];
  }
  for (let i = n - 1; i >= 0; i--) {
    x[i] /= data[i * w + bw];
    const xi = x[i];
    const ri = i * w;
    for (let k = Math.max(0, i - bw); k < i; k++) x[k] -= data[ri + (k - i + bw)] * xi;
  }
}
