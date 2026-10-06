import { factorBand, solveBand, stencilToBand } from './banded';
import { diagonalEBE, multiplyConstrained } from './ebe';
import type { Grid } from './grid';
import { Multigrid, type MultigridOptions } from './multigrid';
import { jacobi, pcg, PCGWorkspace } from './pcg';
import { applyDirichlet, assembleUniform, createStencil } from './stencil';

/**
 * Linear solver for K(E) u = F with homogeneous supports.
 * - `mgcg`: CG with the matrix-free element-by-element operator, preconditioned by one
 *   geometric multigrid V-cycle; warm-started from the previous displacement.
 * - `jacobi`: the same CG with a diagonal preconditioner (simple, slow on fine meshes).
 * - `direct`: banded Cholesky of the assembled matrix (reference mode and tests).
 */
export type SolverKind = 'mgcg' | 'jacobi' | 'direct';

export interface SolveStats {
  kind: SolverKind;
  iterations: number;
  relResidual: number;
  converged: boolean;
}

export interface SolverOptions {
  kind?: SolverKind;
  /** Relative residual tolerance of the iterative solvers. */
  tol?: number;
  maxIter?: number;
  multigrid?: MultigridOptions;
}

export class ElasticSolver {
  readonly kind: SolverKind;
  private readonly tol: number;
  private readonly maxIter: number;
  private readonly ws: PCGWorkspace;
  private mg: Multigrid | null = null;
  private diag: Float64Array | null = null;

  constructor(
    readonly grid: Grid,
    readonly ke: Float64Array,
    options: SolverOptions = {},
  ) {
    this.kind = options.kind ?? 'mgcg';
    this.tol = options.tol ?? 1e-8;
    this.maxIter = options.maxIter ?? 500;
    this.ws = new PCGWorkspace(grid.nDofs);
    if (this.kind === 'mgcg') this.mg = new Multigrid(grid.nelx, grid.nely, options.multigrid);
    if (this.kind === 'jacobi') this.diag = new Float64Array(grid.nDofs);
  }

  get levels(): number {
    return this.mg?.depth ?? 1;
  }

  /** Solves in place: `u` holds the warm start on entry and the solution on exit. */
  solve(Ee: Float64Array, fixed: Uint8Array, F: Float64Array, u: Float64Array): SolveStats {
    const { grid, ke } = this;
    if (this.kind === 'direct') {
      const st = createStencil(grid.nelx, grid.nely);
      assembleUniform(st, ke, Ee);
      applyDirichlet(st, fixed);
      const band = stencilToBand(st);
      factorBand(band);
      for (let d = 0; d < F.length; d++) u[d] = fixed[d] ? 0 : F[d];
      solveBand(band, u, u);
      for (let d = 0; d < F.length; d++) if (fixed[d]) u[d] = 0;
      return { kind: 'direct', iterations: 1, relResidual: 0, converged: true };
    }
    const applyA = (x: Float64Array, y: Float64Array) =>
      multiplyConstrained(grid, ke, Ee, fixed, x, y);
    let precondition: (r: Float64Array, z: Float64Array) => void;
    if (this.mg) {
      const mg = this.mg;
      mg.update(ke, Ee, fixed);
      precondition = (r, z) => mg.apply(r, z, fixed);
    } else {
      const diag = this.diag as Float64Array;
      diagonalEBE(grid, ke, Ee, fixed, diag);
      precondition = jacobi(diag, fixed);
    }
    const Fc = this.constrainedLoad(F, fixed);
    const res = pcg(applyA, precondition, Fc, u, fixed, this.tol, this.maxIter, this.ws);
    return { kind: this.kind, ...res };
  }

  private fc: Float64Array | null = null;
  private constrainedLoad(F: Float64Array, fixed: Uint8Array): Float64Array {
    if (!this.fc || this.fc.length !== F.length) this.fc = new Float64Array(F.length);
    for (let d = 0; d < F.length; d++) this.fc[d] = fixed[d] ? 0 : F[d];
    return this.fc;
  }
}
