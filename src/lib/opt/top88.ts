import { elementEnergies } from '../fem/ebe';
import { elementStiffness } from '../fem/element';
import { createGrid, type Grid } from '../fem/grid';
import { ElasticSolver, type SolverKind } from '../fem/solver';
import { HatFilter } from './filter';
import { ocBisect88 } from './oc';
import { projectExp, projectExpDerivative } from './projection';

/**
 * Line-by-line port of top88.m (Andreassen, Clausen, Schevenels, Lazarov & Sigmund 2011),
 * including the paper's Heaviside extension (ft = 3, section 5). It solves the half MBB beam
 * with the same numbering, loads, supports, filter, OC bisection and stopping rule, and prints
 * the same log line per iteration. Used by the "88-line reference" mode and by the tests.
 *
 *   ft = 1: sensitivity filter, ft = 2: density filter, ft = 3: density filter + Heaviside.
 */
export type FilterType88 = 1 | 2 | 3;

export interface Top88Line {
  loop: number;
  /** Objective printed by top88 for this iteration (compliance before the update). */
  c: number;
  /** mean(xPhys) after the update. */
  vol: number;
  change: number;
  beta: number;
}

export class Top88 {
  readonly grid: Grid;
  readonly E0 = 1;
  readonly Emin = 1e-9;
  readonly ke = elementStiffness(0.3);
  readonly fixed: Uint8Array;
  readonly F: Float64Array;
  readonly U: Float64Array;
  readonly x: Float64Array;
  readonly xPhys: Float64Array;
  readonly xTilde: Float64Array;
  readonly filter: HatFilter;
  loop = 0;
  loopbeta = 0;
  beta = 1;
  change = 1;
  private readonly solver: ElasticSolver;
  private readonly Ee: Float64Array;
  private readonly ce: Float64Array;
  private readonly dc: Float64Array;
  private readonly dv: Float64Array;
  private readonly dx: Float64Array;
  private readonly xnew: Float64Array;
  private readonly tmp: Float64Array;

  constructor(
    readonly nelx: number,
    readonly nely: number,
    readonly volfrac: number,
    readonly penal: number,
    readonly rmin: number,
    readonly ft: FilterType88,
    solver: SolverKind = 'direct',
  ) {
    const grid = createGrid(nelx, nely);
    this.grid = grid;
    const nEl = grid.nEl;
    // F = sparse(2,1,-1,...): downward unit load on the y-DOF of node 1 (top-left corner).
    this.F = new Float64Array(grid.nDofs);
    this.F[1] = -1;
    this.U = new Float64Array(grid.nDofs);
    // fixeddofs = union(1:2:2*(nely+1), 2*(nelx+1)*(nely+1)): x-DOFs of the left edge
    // (symmetry line) and the y-DOF of the bottom-right node (roller).
    this.fixed = new Uint8Array(grid.nDofs);
    for (let d = 0; d < 2 * (nely + 1); d += 2) this.fixed[d] = 1;
    this.fixed[grid.nDofs - 1] = 1;
    this.filter = new HatFilter(nelx, nely, rmin);
    this.x = new Float64Array(nEl).fill(volfrac);
    this.xTilde = new Float64Array(nEl);
    this.xPhys = new Float64Array(nEl);
    if (ft === 3) {
      this.xTilde.set(this.x);
      for (let e = 0; e < nEl; e++) this.xPhys[e] = projectExp(this.xTilde[e], this.beta);
    } else {
      this.xPhys.set(this.x);
    }
    this.solver = new ElasticSolver(grid, this.ke, { kind: solver, tol: 1e-12, maxIter: 5000 });
    this.Ee = new Float64Array(nEl);
    this.ce = new Float64Array(nEl);
    this.dc = new Float64Array(nEl);
    this.dv = new Float64Array(nEl);
    this.dx = new Float64Array(nEl);
    this.xnew = new Float64Array(nEl);
    this.tmp = new Float64Array(nEl);
  }

  /** `while change > 0.01` of top88.m. */
  get finished(): boolean {
    return this.change <= 0.01;
  }

  /** One pass through the optimisation loop; returns the printed line. */
  step(): Top88Line {
    const { E0, Emin, penal, ft, filter, x, xPhys, xTilde, Ee, ce, dc, dv, xnew } = this;
    const nEl = this.grid.nEl;
    this.loop++;
    this.loopbeta++;
    // FE-ANALYSIS
    for (let e = 0; e < nEl; e++) Ee[e] = Emin + xPhys[e] ** penal * (E0 - Emin);
    this.solver.solve(Ee, this.fixed, this.F, this.U);
    // OBJECTIVE FUNCTION AND SENSITIVITY ANALYSIS
    elementEnergies(this.grid, this.ke, this.U, ce);
    let c = 0;
    for (let e = 0; e < nEl; e++) {
      c += Ee[e] * ce[e];
      dc[e] = -penal * (E0 - Emin) * xPhys[e] ** (penal - 1) * ce[e];
      dv[e] = 1;
    }
    // FILTERING/MODIFICATION OF SENSITIVITIES
    if (ft === 1) {
      filter.sensitivity(x, dc, this.tmp);
      dc.set(this.tmp);
    } else if (ft === 2) {
      filter.applyTranspose(dc, this.tmp);
      dc.set(this.tmp);
      filter.applyTranspose(dv, this.tmp);
      dv.set(this.tmp);
    } else {
      const dx = this.dx;
      for (let e = 0; e < nEl; e++) dx[e] = projectExpDerivative(xTilde[e], this.beta);
      for (let e = 0; e < nEl; e++) dc[e] *= dx[e];
      filter.applyTranspose(dc, this.tmp);
      dc.set(this.tmp);
      for (let e = 0; e < nEl; e++) dv[e] *= dx[e];
      filter.applyTranspose(dv, this.tmp);
      dv.set(this.tmp);
    }
    // OPTIMALITY CRITERIA UPDATE OF DESIGN VARIABLES AND PHYSICAL DENSITIES
    const volumeOf = (xn: Float64Array): number => {
      if (ft === 1) {
        xPhys.set(xn);
      } else if (ft === 2) {
        filter.apply(xn, xPhys);
      } else {
        filter.apply(xn, xTilde);
        for (let e = 0; e < nEl; e++) xPhys[e] = projectExp(xTilde[e], this.beta);
      }
      let s = 0;
      for (let e = 0; e < nEl; e++) s += xPhys[e];
      return s;
    };
    ocBisect88(x, dc, dv, 0.2, volumeOf, this.volfrac * nEl, xnew);
    let change = 0;
    for (let e = 0; e < nEl; e++) change = Math.max(change, Math.abs(xnew[e] - x[e]));
    x.set(xnew);
    let vol = 0;
    for (let e = 0; e < nEl; e++) vol += xPhys[e];
    this.change = change;
    const line: Top88Line = { loop: this.loop, c, vol: vol / nEl, change, beta: this.beta };
    // UPDATE HEAVISIDE REGULARIZATION PARAMETER (ft = 3)
    if (ft === 3 && this.beta < 512 && (this.loopbeta >= 50 || change <= 0.01)) {
      this.beta *= 2;
      this.loopbeta = 0;
      this.change = 1;
    }
    return line;
  }

  /** fprintf(' It.:%5i Obj.:%11.4f Vol.:%7.3f ch.:%7.3f\n', ...) */
  static format(l: Top88Line): string {
    const pad = (s: string, n: number) => s.padStart(n, ' ');
    return ` It.:${pad(String(l.loop), 5)} Obj.:${pad(l.c.toFixed(4), 11)} Vol.:${pad(
      l.vol.toFixed(3),
      7,
    )} ch.:${pad(l.change.toFixed(3), 7)}`;
  }
}

/** Runs top88 to completion (or `maxLoops`) and returns every printed line. */
export function runTop88(
  nelx: number,
  nely: number,
  volfrac: number,
  penal: number,
  rmin: number,
  ft: FilterType88,
  maxLoops = 2000,
  solver: SolverKind = 'direct',
): { lines: Top88Line[]; run: Top88 } {
  const run = new Top88(nelx, nely, volfrac, penal, rmin, ft, solver);
  const lines: Top88Line[] = [];
  while (!run.finished && run.loop < maxLoops) lines.push(run.step());
  return { lines, run };
}
