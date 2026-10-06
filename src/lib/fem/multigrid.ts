import { factorBand, solveBand, stencilToBand, type BandedCholesky } from './banded';
import { LOCAL_NODE_OFFSETS } from './grid';
import {
  applyDirichlet,
  assembleElementMatrices,
  assembleUniform,
  blockDiagonalInverse,
  createStencil,
  gaussSeidelBackward,
  gaussSeidelForward,
  stencilResidual,
  type Stencil,
} from './stencil';

/**
 * Geometric multigrid V-cycle used as the preconditioner of conjugate gradients (MGCG, in the
 * spirit of Amir, Aage & Lazarov 2014).
 *
 * - Levels halve the grid while both element counts stay even.
 * - Prolongation P is bilinear interpolation; rows of fixed fine DOFs are zeroed, so coarse
 *   corrections never touch supports.
 * - Coarse operators are Galerkin products A_c = Pᵀ A P, formed element by element: inside a
 *   coarse element, bilinear interpolation only uses that element's four nodes, so A_c is the
 *   assembly of Σ_children P_childᵀ K_child P_child. This keeps the 1e-9 stiffness contrast of
 *   void regions intact on every level.
 * - Smoothing is symmetric point-block Gauss-Seidel (forward before, backward after the coarse
 *   correction) and the coarsest level is solved exactly by banded Cholesky, which makes the
 *   V-cycle a symmetric positive-definite preconditioner.
 */

export interface MultigridOptions {
  /** Upper bound on the number of levels, including the finest. */
  maxLevels?: number;
  /** Stop coarsening once a level has at most this many nodes. */
  coarseNodes?: number;
  /** Gauss-Seidel sweeps before and after the coarse-grid correction. */
  sweeps?: number;
}

interface Level {
  nelx: number;
  nely: number;
  stencil: Stencil;
  dinv: Float64Array;
  /** Explicit element matrices (nEl * 64) of a coarse level; unused on the finest level. */
  mats: Float64Array | null;
  x: Float64Array;
  b: Float64Array;
  r: Float64Array;
}

/** Bilinear weight of coarse node offset `O` (0/1) for a fine node at offset `p` (0..2). */
function weight(p: number, O: number): number {
  return 1 - Math.abs(p - 2 * O) / 2;
}

/**
 * Prolongation of one fine child element (position fx, fy inside its coarse parent) from the
 * parent's 8 DOFs to the child's 8 DOFs, row-major 8 x 8.
 */
function childProlongation(fx: number, fy: number): Float64Array {
  const P = new Float64Array(64);
  for (let a = 0; a < 4; a++) {
    const [oi, oj] = LOCAL_NODE_OFFSETS[a];
    const px = fx + oi;
    const py = fy + oj;
    for (let A = 0; A < 4; A++) {
      const [OI, OJ] = LOCAL_NODE_OFFSETS[A];
      const w = weight(px, OI) * weight(py, OJ);
      if (w === 0) continue;
      P[2 * a * 8 + 2 * A] = w;
      P[(2 * a + 1) * 8 + 2 * A + 1] = w;
    }
  }
  return P;
}

/** out[off..off+64] += scale * Pᵀ K P for 8 x 8 matrices (K read at kOff). */
function addGalerkin(
  P: Float64Array,
  K: Float64Array,
  kOff: number,
  scale: number,
  out: Float64Array,
  off: number,
  tmp: Float64Array,
): void {
  // tmp = K P
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      let s = 0;
      for (let k = 0; k < 8; k++) s += K[kOff + i * 8 + k] * P[k * 8 + j];
      tmp[i * 8 + j] = s;
    }
  }
  // out += scale * Pᵀ tmp
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      let s = 0;
      for (let k = 0; k < 8; k++) s += P[k * 8 + i] * tmp[k * 8 + j];
      out[off + i * 8 + j] += scale * s;
    }
  }
}

export class Multigrid {
  readonly levels: Level[] = [];
  private readonly sweeps: number;
  private readonly P: Float64Array[] = [];
  private coarse: BandedCholesky | null = null;
  private readonly tmp = new Float64Array(64);
  private readonly masked = new Float64Array(64);
  /** Galerkin products of the uniform fine element matrix for the four child positions. */
  private G: Float64Array[] = [];
  private keForG: Float64Array | null = null;

  constructor(nelx: number, nely: number, options: MultigridOptions = {}) {
    const maxLevels = options.maxLevels ?? 6;
    const coarseNodes = options.coarseNodes ?? 300;
    this.sweeps = options.sweeps ?? 1;
    let ex = nelx;
    let ey = nely;
    for (;;) {
      const nDofs = 2 * (ex + 1) * (ey + 1);
      this.levels.push({
        nelx: ex,
        nely: ey,
        stencil: createStencil(ex, ey),
        dinv: new Float64Array((ex + 1) * (ey + 1) * 4),
        mats: this.levels.length === 0 ? null : new Float64Array(ex * ey * 64),
        x: new Float64Array(nDofs),
        b: new Float64Array(nDofs),
        r: new Float64Array(nDofs),
      });
      const canHalve = ex % 2 === 0 && ey % 2 === 0 && ex >= 4 && ey >= 4;
      if (!canHalve || this.levels.length >= maxLevels || (ex + 1) * (ey + 1) <= coarseNodes) {
        break;
      }
      ex /= 2;
      ey /= 2;
    }
    for (let fx = 0; fx < 2; fx++) {
      for (let fy = 0; fy < 2; fy++) this.P[fx * 2 + fy] = childProlongation(fx, fy);
    }
  }

  get depth(): number {
    return this.levels.length;
  }

  /** Rebuilds every level for new element moduli `Ee` and fixed-DOF mask `fixed`. */
  update(ke: Float64Array, Ee: Float64Array, fixed: Uint8Array): void {
    const L0 = this.levels[0];
    assembleUniform(L0.stencil, ke, Ee);
    applyDirichlet(L0.stencil, fixed);
    blockDiagonalInverse(L0.stencil, L0.dinv);

    if (this.keForG !== ke) {
      this.G = this.P.map((P) => {
        const g = new Float64Array(64);
        addGalerkin(P, ke, 0, 1, g, 0, this.tmp);
        return g;
      });
      this.keForG = ke;
    }

    for (let l = 1; l < this.levels.length; l++) {
      const fine = this.levels[l - 1];
      const lev = this.levels[l];
      const mats = lev.mats as Float64Array;
      mats.fill(0);
      const fnny = fine.nely + 1;
      for (let cx = 0; cx < lev.nelx; cx++) {
        for (let cy = 0; cy < lev.nely; cy++) {
          const off = (cx * lev.nely + cy) * 64;
          for (let fx = 0; fx < 2; fx++) {
            for (let fy = 0; fy < 2; fy++) {
              const ex = 2 * cx + fx;
              const ey = 2 * cy + fy;
              const e = ex * fine.nely + ey;
              const pos = fx * 2 + fy;
              if (l === 1) {
                if (this.touchesFixed(ex, ey, fnny, fixed)) {
                  // Zero the prolongation rows of fixed fine DOFs for this child.
                  this.maskedProlongation(pos, ex, ey, fnny, fixed);
                  addGalerkin(this.masked, ke, 0, Ee[e], mats, off, this.tmp);
                } else {
                  const g = this.G[pos];
                  const s = Ee[e];
                  for (let q = 0; q < 64; q++) mats[off + q] += s * g[q];
                }
              } else {
                addGalerkin(this.P[pos], fine.mats as Float64Array, e * 64, 1, mats, off, this.tmp);
              }
            }
          }
        }
      }
      assembleElementMatrices(lev.stencil, mats);
      blockDiagonalInverse(lev.stencil, lev.dinv);
    }

    this.coarse = stencilToBand(this.levels[this.levels.length - 1].stencil);
    factorBand(this.coarse);
  }

  private touchesFixed(ex: number, ey: number, nny: number, fixed: Uint8Array): boolean {
    const n0 = ex * nny + ey;
    for (const [oi, oj] of LOCAL_NODE_OFFSETS) {
      const n = n0 + oi * nny + oj;
      if (fixed[2 * n] || fixed[2 * n + 1]) return true;
    }
    return false;
  }

  private maskedProlongation(
    pos: number,
    ex: number,
    ey: number,
    nny: number,
    fixed: Uint8Array,
  ): void {
    this.masked.set(this.P[pos]);
    const n0 = ex * nny + ey;
    for (let a = 0; a < 4; a++) {
      const [oi, oj] = LOCAL_NODE_OFFSETS[a];
      const n = n0 + oi * nny + oj;
      for (let r = 0; r < 2; r++) {
        if (fixed[2 * n + r]) this.masked.fill(0, (2 * a + r) * 8, (2 * a + r) * 8 + 8);
      }
    }
  }

  /** z = M⁻¹ r: one V-cycle with zero initial guess. `r` must vanish on fixed DOFs. */
  apply(r: Float64Array, z: Float64Array, fixed: Uint8Array): void {
    const L0 = this.levels[0];
    L0.b.set(r);
    this.cycle(0, fixed);
    z.set(L0.x);
  }

  private cycle(l: number, fixed: Uint8Array): void {
    const lev = this.levels[l];
    if (l === this.levels.length - 1) {
      solveBand(this.coarse as BandedCholesky, lev.b, lev.x);
      return;
    }
    lev.x.fill(0);
    for (let s = 0; s < this.sweeps; s++) gaussSeidelForward(lev.stencil, lev.dinv, lev.b, lev.x);
    stencilResidual(lev.stencil, lev.b, lev.x, lev.r);
    const next = this.levels[l + 1];
    this.restrict(lev, next);
    this.cycle(l + 1, fixed);
    this.prolongAdd(next, lev, l === 0 ? fixed : null);
    for (let s = 0; s < this.sweeps; s++) gaussSeidelBackward(lev.stencil, lev.dinv, lev.b, lev.x);
  }

  /** next.b = Pᵀ fine.r (full weighting). */
  private restrict(fine: Level, next: Level): void {
    const fnny = fine.nely + 1;
    const cnny = next.nely + 1;
    const cb = next.b;
    cb.fill(0);
    const fr = fine.r;
    for (let i = 0; i <= fine.nelx; i++) {
      const I0 = i >> 1;
      const oddI = i & 1;
      for (let j = 0; j <= fine.nely; j++) {
        const J0 = j >> 1;
        const oddJ = j & 1;
        const f = 2 * (i * fnny + j);
        const rx = fr[f];
        const ry = fr[f + 1];
        if (rx === 0 && ry === 0) continue;
        const wi0 = oddI ? 0.5 : 1;
        const wj0 = oddJ ? 0.5 : 1;
        let c = 2 * (I0 * cnny + J0);
        let w = wi0 * wj0;
        cb[c] += w * rx;
        cb[c + 1] += w * ry;
        if (oddJ) {
          c = 2 * (I0 * cnny + J0 + 1);
          cb[c] += w * rx;
          cb[c + 1] += w * ry;
        }
        if (oddI) {
          c = 2 * ((I0 + 1) * cnny + J0);
          cb[c] += w * rx;
          cb[c + 1] += w * ry;
          if (oddJ) {
            w = 0.25;
            c = 2 * ((I0 + 1) * cnny + J0 + 1);
            cb[c] += w * rx;
            cb[c + 1] += w * ry;
          }
        }
      }
    }
  }

  /** fine.x += P next.x, zeroing fixed DOFs on the finest level. */
  private prolongAdd(next: Level, fine: Level, fixed: Uint8Array | null): void {
    const fnny = fine.nely + 1;
    const cnny = next.nely + 1;
    const cx = next.x;
    const fx = fine.x;
    for (let i = 0; i <= fine.nelx; i++) {
      const I0 = i >> 1;
      const oddI = i & 1;
      for (let j = 0; j <= fine.nely; j++) {
        const J0 = j >> 1;
        const oddJ = j & 1;
        const c00 = 2 * (I0 * cnny + J0);
        let vx = cx[c00];
        let vy = cx[c00 + 1];
        if (oddI && oddJ) {
          const c10 = 2 * ((I0 + 1) * cnny + J0);
          const c01 = c00 + 2;
          const c11 = c10 + 2;
          vx = 0.25 * (vx + cx[c10] + cx[c01] + cx[c11]);
          vy = 0.25 * (vy + cx[c10 + 1] + cx[c01 + 1] + cx[c11 + 1]);
        } else if (oddI) {
          const c10 = 2 * ((I0 + 1) * cnny + J0);
          vx = 0.5 * (vx + cx[c10]);
          vy = 0.5 * (vy + cx[c10 + 1]);
        } else if (oddJ) {
          const c01 = c00 + 2;
          vx = 0.5 * (vx + cx[c01]);
          vy = 0.5 * (vy + cx[c01 + 1]);
        }
        const f = 2 * (i * fnny + j);
        if (fixed) {
          if (!fixed[f]) fx[f] += vx;
          if (!fixed[f + 1]) fx[f + 1] += vy;
        } else {
          fx[f] += vx;
          fx[f + 1] += vy;
        }
      }
    }
  }
}
