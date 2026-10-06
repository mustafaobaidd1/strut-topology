import { LOCAL_NODE_OFFSETS } from './grid';

/**
 * Assembled stiffness matrix of a structured Q4 grid, stored as a 9-point stencil of 2 x 2
 * blocks: every node couples only to itself and its eight neighbours. This format is used for
 * the multigrid levels (Gauss-Seidel smoothing, residuals, Galerkin products and the coarse
 * direct solve). Neighbour k of a node is at column offset di and row offset dj with
 * k = (di + 1) * 3 + (dj + 1); k = 4 is the node itself.
 */
export interface Stencil {
  readonly nelx: number;
  readonly nely: number;
  readonly nnx: number;
  readonly nny: number;
  readonly nNodes: number;
  /** a[(n * 9 + k) * 4 + r * 2 + c] couples DOF (n, r) to DOF (neighbour k of n, c). */
  readonly a: Float64Array;
  /** Neighbour node per (n, k); neighbours outside the grid map to n with a zero block. */
  readonly nbr: Int32Array;
}

export const CENTRE = 4;

export function createStencil(nelx: number, nely: number): Stencil {
  const nnx = nelx + 1;
  const nny = nely + 1;
  const nNodes = nnx * nny;
  const nbr = new Int32Array(nNodes * 9);
  for (let i = 0; i < nnx; i++) {
    for (let j = 0; j < nny; j++) {
      const n = i * nny + j;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const k = (di + 1) * 3 + (dj + 1);
          const ii = i + di;
          const jj = j + dj;
          nbr[n * 9 + k] = ii >= 0 && ii < nnx && jj >= 0 && jj < nny ? ii * nny + jj : n;
        }
      }
    }
  }
  return { nelx, nely, nnx, nny, nNodes, a: new Float64Array(nNodes * 36), nbr };
}

/**
 * Adds one element's 8 x 8 matrix (row-major, local order BL, BR, TR, TL) scaled by `scale`
 * into the stencil. `ex`, `ey` are the element's column and row (from the top).
 */
export function addElementMatrix(
  st: Stencil,
  ex: number,
  ey: number,
  m: Float64Array,
  mOffset: number,
  scale: number,
): void {
  const { a, nny } = st;
  const n0 = ex * nny + ey;
  for (let la = 0; la < 4; la++) {
    const [ia, ja] = LOCAL_NODE_OFFSETS[la];
    const na = n0 + ia * nny + ja;
    for (let lb = 0; lb < 4; lb++) {
      const [ib, jb] = LOCAL_NODE_OFFSETS[lb];
      const k = (ib - ia + 1) * 3 + (jb - ja + 1);
      const o = (na * 9 + k) * 4;
      const r0 = mOffset + 2 * la * 8 + 2 * lb;
      const r1 = r0 + 8;
      a[o] += scale * m[r0];
      a[o + 1] += scale * m[r0 + 1];
      a[o + 2] += scale * m[r1];
      a[o + 3] += scale * m[r1 + 1];
    }
  }
}

/** Assembles K = Σ E_e k0 for a uniform element matrix `ke` (no boundary conditions). */
export function assembleUniform(st: Stencil, ke: Float64Array, Ee: Float64Array): void {
  st.a.fill(0);
  const { nelx, nely } = st;
  for (let ex = 0; ex < nelx; ex++) {
    for (let ey = 0; ey < nely; ey++) {
      addElementMatrix(st, ex, ey, ke, 0, Ee[ex * nely + ey]);
    }
  }
}

/** Assembles K from one explicit 8 x 8 matrix per element (`mats` holds nEl * 64 values). */
export function assembleElementMatrices(st: Stencil, mats: Float64Array): void {
  st.a.fill(0);
  const { nelx, nely } = st;
  for (let ex = 0; ex < nelx; ex++) {
    for (let ey = 0; ey < nely; ey++) {
      addElementMatrix(st, ex, ey, mats, (ex * nely + ey) * 64, 1);
    }
  }
}

/**
 * Imposes homogeneous Dirichlet conditions: rows and columns of fixed DOFs are zeroed and a
 * unit diagonal is placed, so u = 0 there and the free equations are unchanged.
 */
export function applyDirichlet(st: Stencil, fixed: Uint8Array): void {
  const { a, nnx, nny } = st;
  for (let i = 0; i < nnx; i++) {
    for (let j = 0; j < nny; j++) {
      const n = i * nny + j;
      for (let r = 0; r < 2; r++) {
        if (!fixed[2 * n + r]) continue;
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || ii >= nnx || jj < 0 || jj >= nny) continue;
            const k = (di + 1) * 3 + (dj + 1);
            const o = (n * 9 + k) * 4 + r * 2;
            a[o] = 0;
            a[o + 1] = 0;
            // Column entries in the neighbour's row that point back at (n, r).
            const m = ii * nny + jj;
            const ob = (m * 9 + (8 - k)) * 4;
            a[ob + r] = 0;
            a[ob + 2 + r] = 0;
          }
        }
        a[(n * 9 + CENTRE) * 4 + r * 3] = 1;
      }
    }
  }
}

/** y = A x. */
export function stencilMultiply(st: Stencil, x: Float64Array, y: Float64Array): void {
  const { a, nbr, nNodes } = st;
  for (let n = 0; n < nNodes; n++) {
    let y0 = 0;
    let y1 = 0;
    const base = n * 9;
    for (let k = 0; k < 9; k++) {
      const m = nbr[base + k] * 2;
      const o = (base + k) * 4;
      const x0 = x[m];
      const x1 = x[m + 1];
      y0 += a[o] * x0 + a[o + 1] * x1;
      y1 += a[o + 2] * x0 + a[o + 3] * x1;
    }
    y[2 * n] = y0;
    y[2 * n + 1] = y1;
  }
}

/** r = b - A x. */
export function stencilResidual(
  st: Stencil,
  b: Float64Array,
  x: Float64Array,
  r: Float64Array,
): void {
  stencilMultiply(st, x, r);
  for (let d = 0; d < r.length; d++) r[d] = b[d] - r[d];
}

/**
 * Inverses of the 2 x 2 diagonal blocks for block Gauss-Seidel. A component whose diagonal is
 * exactly zero (a coarse DOF whose basis function only touches fixed fine DOFs) is held at
 * zero instead of being inverted.
 */
export function blockDiagonalInverse(st: Stencil, out: Float64Array): void {
  const { a, nNodes } = st;
  for (let n = 0; n < nNodes; n++) {
    const o = (n * 9 + CENTRE) * 4;
    const p = a[o];
    const q = a[o + 1];
    const s = a[o + 2];
    const t = a[o + 3];
    const w = n * 4;
    const zp = !(p > 0);
    const zt = !(t > 0);
    if (zp && zt) {
      out[w] = out[w + 1] = out[w + 2] = out[w + 3] = 0;
    } else if (zp) {
      out[w] = out[w + 1] = out[w + 2] = 0;
      out[w + 3] = 1 / t;
    } else if (zt) {
      out[w] = 1 / p;
      out[w + 1] = out[w + 2] = out[w + 3] = 0;
    } else {
      const det = p * t - q * s;
      out[w] = t / det;
      out[w + 1] = -q / det;
      out[w + 2] = -s / det;
      out[w + 3] = p / det;
    }
  }
}

function relaxNode(
  a: Float64Array,
  nbr: Int32Array,
  dinv: Float64Array,
  b: Float64Array,
  x: Float64Array,
  n: number,
): void {
  const base = n * 9;
  let s0 = b[2 * n];
  let s1 = b[2 * n + 1];
  for (let k = 0; k < 9; k++) {
    if (k === CENTRE) continue;
    const m = nbr[base + k] * 2;
    const o = (base + k) * 4;
    const x0 = x[m];
    const x1 = x[m + 1];
    s0 -= a[o] * x0 + a[o + 1] * x1;
    s1 -= a[o + 2] * x0 + a[o + 3] * x1;
  }
  const w = n * 4;
  x[2 * n] = dinv[w] * s0 + dinv[w + 1] * s1;
  x[2 * n + 1] = dinv[w + 2] * s0 + dinv[w + 3] * s1;
}

/** One forward sweep of point-block Gauss-Seidel (nodes in increasing order). */
export function gaussSeidelForward(
  st: Stencil,
  dinv: Float64Array,
  b: Float64Array,
  x: Float64Array,
): void {
  const { a, nbr, nNodes } = st;
  for (let n = 0; n < nNodes; n++) relaxNode(a, nbr, dinv, b, x, n);
}

/** One backward sweep (nodes in decreasing order); pairs with the forward sweep symmetrically. */
export function gaussSeidelBackward(
  st: Stencil,
  dinv: Float64Array,
  b: Float64Array,
  x: Float64Array,
): void {
  const { a, nbr, nNodes } = st;
  for (let n = nNodes - 1; n >= 0; n--) relaxNode(a, nbr, dinv, b, x, n);
}
