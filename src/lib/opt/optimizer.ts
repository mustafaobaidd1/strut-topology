import { elementEnergies } from '../fem/ebe';
import { elementStiffness, POISSON } from '../fem/element';
import { createGrid, type Grid } from '../fem/grid';
import { ElasticSolver, type SolveStats, type SolverKind } from '../fem/solver';
import { HatFilter } from './filter';
import { ocBisect88, ocIllinois } from './oc';
import { inverseProjectTanh, projectTanh, projectTanhDerivative } from './projection';

/**
 * Minimum-compliance topology optimisation with modified SIMP, a density (or sensitivity)
 * filter, optional tanh Heaviside projection with β continuation, and the optimality-criteria
 * update — the method of the 88-line code, generalised to arbitrary supports, loads, passive
 * regions and a left-right symmetry constraint, and driven one iteration at a time so the UI
 * can watch, pause and edit while it runs.
 */

export type FilterKind = 'density' | 'sensitivity';

export interface OptimizerParams {
  /** Target volume fraction of the whole domain. */
  volfrac: number;
  /** SIMP penalisation exponent p. */
  penal: number;
  /** Filter radius in element widths. */
  rmin: number;
  filter: FilterKind;
  /** tanh projection with β continuation (density filter only). */
  projection: boolean;
  /** Final β of the continuation (β starts at 1 and doubles). */
  betaMax: number;
  /** Double β at least this often (iterations), or earlier once the design settles. */
  betaInterval: number;
  /** Projection threshold η. */
  eta: number;
  /** OC move limit. */
  move: number;
  /** Converged when max |Δx| ≤ this (and β has reached βmax). */
  changeTol: number;
  /**
   * Also stop when the compliance has changed by less than this fraction over the last
   * 10 iterations (density-filtered runs often creep with change ≈ 0.01–0.02). 0 disables it,
   * as in the 88-line reference mode.
   */
  stallTol: number;
  /** Iteration budget per run (counted since the last reset or edit). */
  maxIter: number;
  Emin: number;
  solver: SolverKind;
  /** Relative residual tolerance of CG. */
  cgTol: number;
  /** `top88`: λ bisection exactly as the paper; `fast`: bracketed Illinois search. */
  ocMode: 'top88' | 'fast';
}

export const DEFAULT_PARAMS: OptimizerParams = {
  volfrac: 0.3,
  penal: 3,
  rmin: 2,
  filter: 'density',
  projection: false,
  betaMax: 32,
  betaInterval: 25,
  eta: 0.5,
  move: 0.2,
  changeTol: 0.01,
  stallTol: 1e-4,
  maxIter: 300,
  Emin: 1e-9,
  solver: 'mgcg',
  cgTol: 1e-6,
  ocMode: 'fast',
};

/** A problem resolved onto a grid: what the optimiser actually needs. */
export interface GridProblem {
  nelx: number;
  nely: number;
  /** 1 for each DOF held at zero. */
  fixed: Uint8Array;
  /** Nodal force vector (length 2 (nelx+1)(nely+1)). */
  force: Float64Array;
  /** Per element: 0 designable, 1 passive solid, −1 passive void. */
  passive: Int8Array;
  /** Enforce left-right mirror symmetry of the design. */
  symmetric: boolean;
}

export interface IterationResult {
  /** Iterations since construction (never reset by edits). */
  iteration: number;
  /** Iterations since the last reset or edit. */
  runIteration: number;
  /** Compliance c = Σ E_e u_eᵀ k0 u_e of the design analysed in this iteration. */
  compliance: number;
  /** Volume fraction of the updated design. */
  volume: number;
  /** max |x_new − x| over the designable elements. */
  change: number;
  beta: number;
  /** Non-discreteness 4 Σ x̄(1 − x̄)/N in percent (Sigmund 2007). */
  grayness: number;
  solve: SolveStats;
  /** True once a stopping rule holds (and β has reached its final value). */
  converged: boolean;
  /** Which rule stopped the run. */
  convergedBy: 'change' | 'stall' | null;
  /** Wall time of this iteration in milliseconds. */
  ms: number;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Optimizer {
  grid: Grid;
  problem: GridProblem;
  params: OptimizerParams;
  readonly ke = elementStiffness(POISSON);
  /** Design variables x. */
  x: Float64Array;
  /** Filtered densities x̃. */
  xTilde: Float64Array;
  /** Physical densities x̄ (what is analysed and shown). */
  xPhys: Float64Array;
  /** Displacements of the last analysis (also the warm start of the next solve). */
  u: Float64Array;
  /** Element energies u_eᵀ k0 u_e of the last analysis. */
  ce: Float64Array;
  /** Young's moduli of the last analysis. */
  Ee: Float64Array;
  iteration = 0;
  runIteration = 0;
  beta = 1;
  private loopBeta = 0;
  private lambda = 1;
  /** Compliances of the current run (since the last reset, edit or β change). */
  private history: number[] = [];
  private filter: HatFilter;
  private solver: ElasticSolver;
  private design: Uint8Array;
  private volumeWeights: Float64Array | null = null;
  private dc: Float64Array;
  private dv: Float64Array;
  private tmp: Float64Array;
  private xnew: Float64Array;
  private dproj: Float64Array;
  private mirror: Int32Array;

  constructor(problem: GridProblem, params: Partial<OptimizerParams> = {}) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.problem = problem;
    this.grid = createGrid(problem.nelx, problem.nely);
    const n = this.grid.nEl;
    this.x = new Float64Array(n);
    this.xTilde = new Float64Array(n);
    this.xPhys = new Float64Array(n);
    this.u = new Float64Array(this.grid.nDofs);
    this.ce = new Float64Array(n);
    this.Ee = new Float64Array(n);
    this.dc = new Float64Array(n);
    this.dv = new Float64Array(n);
    this.tmp = new Float64Array(n);
    this.xnew = new Float64Array(n);
    this.dproj = new Float64Array(n);
    this.design = new Uint8Array(n);
    this.mirror = mirrorMap(problem.nelx, problem.nely);
    this.filter = new HatFilter(problem.nelx, problem.nely, this.params.rmin);
    this.solver = this.makeSolver();
    this.applyPassive();
    this.reset();
  }

  private makeSolver(): ElasticSolver {
    return new ElasticSolver(this.grid, this.ke, {
      kind: this.params.solver,
      tol: this.params.cgTol,
      maxIter: 400,
      multigrid: { coarseNodes: 1200 },
    });
  }

  get solverLevels(): number {
    return this.solver.levels;
  }

  /** Uniform start that already meets the volume target (passive regions included). */
  reset(): void {
    const { passive } = this.problem;
    const n = this.grid.nEl;
    let solid = 0;
    let free = 0;
    for (let e = 0; e < n; e++) {
      if (passive[e] === 1) solid++;
      else if (passive[e] === 0) free++;
    }
    let target = free > 0 ? (this.params.volfrac * n - solid) / free : 0;
    target = Math.min(1, Math.max(0, target));
    let x0 = target;
    if (this.usesProjection()) x0 = inverseProjectTanh(target, 1, this.params.eta);
    for (let e = 0; e < n; e++) this.x[e] = passive[e] === 1 ? 1 : passive[e] === -1 ? 0 : x0;
    this.u.fill(0);
    this.iteration = 0;
    this.runIteration = 0;
    this.beta = 1;
    this.loopBeta = 0;
    this.lambda = 1;
    this.history = [];
    this.updatePhysical(this.x);
  }

  /** Sets the design variables directly (passive values are re-imposed). */
  setDesign(x: ArrayLike<number>): void {
    const { passive } = this.problem;
    for (let e = 0; e < this.grid.nEl; e++) {
      this.x[e] = passive[e] === 1 ? 1 : passive[e] === -1 ? 0 : x[e];
    }
    this.updatePhysical(this.x);
  }

  /** Physical volume fraction of the current design. */
  get volume(): number {
    let s = 0;
    for (let e = 0; e < this.grid.nEl; e++) s += this.xPhys[e];
    return s / this.grid.nEl;
  }

  private usesProjection(): boolean {
    return this.params.projection && this.params.filter === 'density';
  }

  private applyPassive(): void {
    const { passive } = this.problem;
    for (let e = 0; e < this.grid.nEl; e++) this.design[e] = passive[e] === 0 ? 1 : 0;
    this.volumeWeights = null;
  }

  /**
   * Replaces loads, supports, passive regions or symmetry. On the same grid the current design
   * and displacements are kept (warm start); on a new grid the design is resampled.
   */
  setProblem(problem: GridProblem): void {
    const sameGrid = problem.nelx === this.grid.nelx && problem.nely === this.grid.nely;
    if (!sameGrid) {
      const resampled = resampleDesign(
        this.x,
        this.grid.nelx,
        this.grid.nely,
        problem.nelx,
        problem.nely,
      );
      this.problem = problem;
      this.grid = createGrid(problem.nelx, problem.nely);
      const n = this.grid.nEl;
      this.x = resampled;
      this.xTilde = new Float64Array(n);
      this.xPhys = new Float64Array(n);
      this.u = new Float64Array(this.grid.nDofs);
      this.ce = new Float64Array(n);
      this.Ee = new Float64Array(n);
      this.dc = new Float64Array(n);
      this.dv = new Float64Array(n);
      this.tmp = new Float64Array(n);
      this.xnew = new Float64Array(n);
      this.dproj = new Float64Array(n);
      this.design = new Uint8Array(n);
      this.mirror = mirrorMap(problem.nelx, problem.nely);
      this.filter = new HatFilter(problem.nelx, problem.nely, this.params.rmin);
      this.solver = this.makeSolver();
    } else {
      this.problem = problem;
    }
    this.applyPassive();
    const { passive } = problem;
    if (problem.symmetric) this.symmetrise(this.x);
    for (let e = 0; e < this.grid.nEl; e++) {
      if (passive[e] === 1) this.x[e] = 1;
      else if (passive[e] === -1) this.x[e] = 0;
    }
    this.runIteration = 0;
    this.restartContinuation(true);
    this.updatePhysical(this.x);
  }

  /** Changes parameters, keeping the current design as the starting point. */
  setParams(next: Partial<OptimizerParams>): void {
    const prev = this.params;
    this.params = { ...prev, ...next };
    if (this.params.rmin !== prev.rmin) {
      this.filter = new HatFilter(this.grid.nelx, this.grid.nely, this.params.rmin);
      this.volumeWeights = null;
    }
    if (this.params.solver !== prev.solver || this.params.cgTol !== prev.cgTol) {
      this.solver = this.makeSolver();
    }
    if (
      this.params.projection !== prev.projection ||
      this.params.filter !== prev.filter ||
      this.params.betaMax !== prev.betaMax
    ) {
      this.restartContinuation(false);
    }
    this.runIteration = 0;
    this.history = [];
    this.updatePhysical(this.x);
  }

  /**
   * A crisp projected design can hardly change topology, so after an edit β falls back to a
   * soft value (at most 2) and the continuation is replayed; a parameter change that alters
   * the projection itself restarts it from β = 1.
   */
  private restartContinuation(soft: boolean): void {
    this.beta = soft ? Math.min(this.beta, 2) : 1;
    this.loopBeta = 0;
    this.history = [];
  }

  /** x → x̃ → x̄ for the current filter, projection and passive regions. */
  private updatePhysical(x: Float64Array): void {
    const { passive } = this.problem;
    const n = this.grid.nEl;
    if (this.params.filter === 'density') {
      this.filter.apply(x, this.xTilde);
    } else {
      this.xTilde.set(x);
    }
    if (this.usesProjection()) {
      const { eta } = this.params;
      for (let e = 0; e < n; e++) this.xPhys[e] = projectTanh(this.xTilde[e], this.beta, eta);
    } else {
      this.xPhys.set(this.xTilde);
    }
    for (let e = 0; e < n; e++) {
      if (passive[e] === 1) this.xPhys[e] = 1;
      else if (passive[e] === -1) this.xPhys[e] = 0;
    }
  }

  private physicalVolume(x: Float64Array): number {
    // Without projection the physical volume is linear in x: Σ c_j x_j + #solid.
    const { passive } = this.problem;
    if (this.params.filter === 'density' && !this.usesProjection()) {
      if (!this.volumeWeights) this.volumeWeights = this.filter.volumeWeights(passive);
      const w = this.volumeWeights;
      let s = 0;
      for (let e = 0; e < x.length; e++) {
        s += w[e] * x[e];
        if (passive[e] === 1) s += 1;
      }
      return s;
    }
    this.updatePhysical(x);
    let s = 0;
    for (let e = 0; e < x.length; e++) s += this.xPhys[e];
    return s;
  }

  private symmetrise(v: Float64Array): void {
    const m = this.mirror;
    for (let e = 0; e < v.length; e++) {
      const f = m[e];
      if (f > e) {
        const avg = 0.5 * (v[e] + v[f]);
        v[e] = avg;
        v[f] = avg;
      }
    }
  }

  /** Compliance and its gradient with respect to the design variables x (for tests too). */
  analyse(): { compliance: number; dc: Float64Array; dv: Float64Array; solve: SolveStats } {
    const { penal, Emin } = this.params;
    const { passive, fixed, force } = this.problem;
    const n = this.grid.nEl;
    const { xPhys, Ee, ce, dc, dv } = this;
    for (let e = 0; e < n; e++) Ee[e] = Emin + xPhys[e] ** penal * (1 - Emin);
    const solve = this.solver.solve(Ee, fixed, force, this.u);
    elementEnergies(this.grid, this.ke, this.u, ce);
    let c = 0;
    for (let e = 0; e < n; e++) {
      c += Ee[e] * ce[e];
      dc[e] = -penal * (1 - Emin) * xPhys[e] ** (penal - 1) * ce[e];
      dv[e] = 1;
    }
    if (this.params.filter === 'density') {
      // Passive physical densities do not depend on x: their chain-rule terms vanish.
      for (let e = 0; e < n; e++) {
        if (passive[e] !== 0) {
          dc[e] = 0;
          dv[e] = 0;
        }
      }
      if (this.usesProjection()) {
        const { eta } = this.params;
        for (let e = 0; e < n; e++) {
          this.dproj[e] = projectTanhDerivative(this.xTilde[e], this.beta, eta);
          dc[e] *= this.dproj[e];
          dv[e] *= this.dproj[e];
        }
      }
      this.filter.applyTranspose(dc, this.tmp);
      dc.set(this.tmp);
      this.filter.applyTranspose(dv, this.tmp);
      dv.set(this.tmp);
    } else {
      this.filter.sensitivity(this.x, dc, this.tmp);
      dc.set(this.tmp);
      for (let e = 0; e < n; e++) dv[e] = 1;
    }
    if (this.problem.symmetric) {
      this.symmetrise(dc);
      this.symmetrise(dv);
    }
    return { compliance: c, dc, dv, solve };
  }

  /**
   * OC move limit. With a sharp projection (β > 4) boundary elements otherwise flip by the full
   * move limit every iteration while the compliance stays flat, so the limit shrinks as 4/β;
   * without projection it is exactly `params.move` (0.2, as in the 88-line code).
   */
  effectiveMove(): number {
    const p = this.params;
    if (!this.usesProjection()) return p.move;
    return p.move * Math.min(1, 4 / this.beta);
  }

  /** One optimisation iteration: analyse, filter sensitivities, OC update, continuation. */
  step(): IterationResult {
    const t0 = now();
    const p = this.params;
    const n = this.grid.nEl;
    this.iteration++;
    this.runIteration++;
    this.loopBeta++;
    const { compliance, dc, dv, solve } = this.analyse();
    const target = p.volfrac * n;
    const volumeOf = (xn: Float64Array) => this.physicalVolume(xn);
    const move = this.effectiveMove();
    let oc;
    if (p.ocMode === 'top88') {
      oc = ocBisect88(this.x, dc, dv, move, volumeOf, target, this.xnew, this.design);
    } else {
      oc = ocIllinois(this.x, dc, dv, this.design, move, volumeOf, target, this.lambda, this.xnew);
    }
    this.lambda = oc.lambda;
    if (this.problem.symmetric) {
      this.symmetrise(this.xnew);
      for (let e = 0; e < n; e++) if (!this.design[e]) this.xnew[e] = this.x[e];
    }
    let change = 0;
    for (let e = 0; e < n; e++) {
      if (this.design[e]) change = Math.max(change, Math.abs(this.xnew[e] - this.x[e]));
    }
    this.x.set(this.xnew);
    this.updatePhysical(this.x);
    let vol = 0;
    let gray = 0;
    let free = 0;
    for (let e = 0; e < n; e++) {
      const v = this.xPhys[e];
      vol += v;
      if (this.design[e]) {
        gray += 4 * v * (1 - v);
        free++;
      }
    }
    const projecting = this.usesProjection();
    const beta = this.beta;
    this.history.push(compliance);
    const h = this.history;
    const stalled =
      p.stallTol > 0 &&
      h.length > 10 &&
      Math.abs(h[h.length - 11] - compliance) <= p.stallTol * Math.abs(compliance);
    const settled = change <= p.changeTol || stalled;
    const betaDone = !projecting || this.beta >= p.betaMax;
    let converged = settled && betaDone;
    const convergedBy: IterationResult['convergedBy'] = converged
      ? change <= p.changeTol
        ? 'change'
        : 'stall'
      : null;
    if (projecting && this.beta < p.betaMax && (this.loopBeta >= p.betaInterval || settled)) {
      this.beta = Math.min(p.betaMax, this.beta * 2);
      this.loopBeta = 0;
      this.history = [];
      converged = false;
      this.updatePhysical(this.x);
    }
    return {
      iteration: this.iteration,
      runIteration: this.runIteration,
      compliance,
      volume: vol / n,
      change,
      beta,
      grayness: free > 0 ? (100 * gray) / free : 0,
      solve,
      converged,
      convergedBy: converged ? convergedBy : null,
      ms: now() - t0,
    };
  }
}

/** Index of each element's mirror image about the vertical centre line. */
export function mirrorMap(nelx: number, nely: number): Int32Array {
  const m = new Int32Array(nelx * nely);
  for (let ex = 0; ex < nelx; ex++) {
    for (let ey = 0; ey < nely; ey++) m[ex * nely + ey] = (nelx - 1 - ex) * nely + ey;
  }
  return m;
}

/** Bilinear resampling of an element field onto a new grid (cell-centred). */
export function resampleDesign(
  x: Float64Array,
  nelx: number,
  nely: number,
  nx: number,
  ny: number,
): Float64Array {
  const out = new Float64Array(nx * ny);
  for (let ex = 0; ex < nx; ex++) {
    const fx = ((ex + 0.5) * nelx) / nx - 0.5;
    const x0 = Math.max(0, Math.min(nelx - 1, Math.floor(fx)));
    const x1 = Math.min(nelx - 1, x0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0));
    for (let ey = 0; ey < ny; ey++) {
      const fy = ((ey + 0.5) * nely) / ny - 0.5;
      const y0 = Math.max(0, Math.min(nely - 1, Math.floor(fy)));
      const y1 = Math.min(nely - 1, y0 + 1);
      const ty = Math.max(0, Math.min(1, fy - y0));
      const a = x[x0 * nely + y0] * (1 - ty) + x[x0 * nely + y1] * ty;
      const b = x[x1 * nely + y0] * (1 - ty) + x[x1 * nely + y1] * ty;
      out[ex * ny + ey] = a * (1 - tx) + b * tx;
    }
  }
  return out;
}
