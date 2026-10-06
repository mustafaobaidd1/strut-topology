/**
 * Linear "hat" filter of radius rmin (in element widths) on a structured grid, exactly as in
 * the 88-line code: H_ei = max(0, rmin − Δ(e, i)) over the (2⌈rmin⌉ − 1)² neighbourhood,
 * normalised by Hs_e = Σ_i H_ei. Elements are numbered column-wise (e = ex · nely + ey).
 */
export class HatFilter {
  readonly dx: Int32Array;
  readonly dy: Int32Array;
  readonly w: Float64Array;
  readonly Hs: Float64Array;
  private readonly tmp: Float64Array;

  constructor(
    readonly nelx: number,
    readonly nely: number,
    readonly rmin: number,
  ) {
    const reach = Math.ceil(rmin) - 1;
    const dx: number[] = [];
    const dy: number[] = [];
    const w: number[] = [];
    // Same visiting order as the 88-line code: i2 (columns) outer, j2 (rows) inner.
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        const h = Math.max(0, rmin - Math.sqrt(i * i + j * j));
        if (h > 0) {
          dx.push(i);
          dy.push(j);
          w.push(h);
        }
      }
    }
    this.dx = Int32Array.from(dx);
    this.dy = Int32Array.from(dy);
    this.w = Float64Array.from(w);
    this.Hs = new Float64Array(nelx * nely);
    this.tmp = new Float64Array(nelx * nely);
    const ones = new Float64Array(nelx * nely).fill(1);
    this.sum(ones, this.Hs);
  }

  /** out_e = Σ_i H_ei v_i (un-normalised). */
  private sum(v: Float64Array, out: Float64Array): void {
    const { nelx, nely, dx, dy, w } = this;
    const m = w.length;
    for (let ex = 0; ex < nelx; ex++) {
      for (let ey = 0; ey < nely; ey++) {
        let s = 0;
        for (let k = 0; k < m; k++) {
          const x = ex + dx[k];
          const y = ey + dy[k];
          if (x < 0 || x >= nelx || y < 0 || y >= nely) continue;
          s += w[k] * v[x * nely + y];
        }
        out[ex * nely + ey] = s;
      }
    }
  }

  /** Density filter: out = (H v) ./ Hs. */
  apply(v: Float64Array, out: Float64Array): void {
    this.sum(v, out);
    const Hs = this.Hs;
    for (let e = 0; e < out.length; e++) out[e] /= Hs[e];
  }

  /**
   * Chain rule through the density filter: out = H (g ./ Hs), i.e. ∂ψ/∂x given ∂ψ/∂x̃
   * (H is symmetric).
   */
  applyTranspose(g: Float64Array, out: Float64Array): void {
    const t = this.tmp;
    const Hs = this.Hs;
    for (let e = 0; e < g.length; e++) t[e] = g[e] / Hs[e];
    this.sum(t, out);
  }

  /** Sensitivity filter (Sigmund 1994): out = H (x .* dc) ./ Hs ./ max(1e-3, x). */
  sensitivity(x: Float64Array, dc: Float64Array, out: Float64Array): void {
    const t = this.tmp;
    for (let e = 0; e < x.length; e++) t[e] = x[e] * dc[e];
    this.sum(t, out);
    const Hs = this.Hs;
    for (let e = 0; e < out.length; e++) out[e] = out[e] / Hs[e] / Math.max(1e-3, x[e]);
  }

  /**
   * Weights c_j with Σ_{e ∉ skip} x̃_e = Σ_j c_j x_j: the physical volume is linear in the design
   * variables when no projection is used, which makes the OC bisection O(N) per step.
   */
  volumeWeights(skip: Int8Array | null): Float64Array {
    const g = new Float64Array(this.nelx * this.nely);
    for (let e = 0; e < g.length; e++) g[e] = skip && skip[e] !== 0 ? 0 : 1;
    const out = new Float64Array(g.length);
    this.applyTranspose(g, out);
    return out;
  }
}
