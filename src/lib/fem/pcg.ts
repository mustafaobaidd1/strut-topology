/**
 * Preconditioned conjugate gradients on the free DOFs. All vectors are full-length; entries of
 * fixed DOFs are kept at zero, so the iteration lives in the free subspace.
 */

export interface PCGResult {
  iterations: number;
  /** ‖b − A x‖ / ‖b‖ at exit. */
  relResidual: number;
  converged: boolean;
}

export type LinearOperator = (x: Float64Array, y: Float64Array) => void;

export class PCGWorkspace {
  readonly r: Float64Array;
  readonly z: Float64Array;
  readonly p: Float64Array;
  readonly q: Float64Array;
  constructor(readonly n: number) {
    this.r = new Float64Array(n);
    this.z = new Float64Array(n);
    this.p = new Float64Array(n);
    this.q = new Float64Array(n);
  }
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Solves A x = b starting from the given `x` (warm start). `applyA` must return zero on fixed
 * DOFs for inputs that are zero there; `precondition` likewise.
 */
export function pcg(
  applyA: LinearOperator,
  precondition: LinearOperator,
  b: Float64Array,
  x: Float64Array,
  fixed: Uint8Array,
  tol: number,
  maxIter: number,
  ws: PCGWorkspace = new PCGWorkspace(b.length),
): PCGResult {
  const { r, z, p, q } = ws;
  const n = b.length;
  for (let i = 0; i < n; i++) if (fixed[i]) x[i] = 0;
  const bnorm = Math.sqrt(dot(b, b));
  if (bnorm === 0) {
    x.fill(0);
    return { iterations: 0, relResidual: 0, converged: true };
  }
  applyA(x, q);
  for (let i = 0; i < n; i++) r[i] = fixed[i] ? 0 : b[i] - q[i];
  let rnorm = Math.sqrt(dot(r, r));
  if (rnorm <= tol * bnorm) return { iterations: 0, relResidual: rnorm / bnorm, converged: true };
  precondition(r, z);
  p.set(z);
  let rz = dot(r, z);
  let it = 0;
  while (it < maxIter) {
    it++;
    applyA(p, q);
    const pq = dot(p, q);
    if (!(pq > 0)) break; // loss of positive definiteness: give up gracefully
    const alpha = rz / pq;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * q[i];
    }
    rnorm = Math.sqrt(dot(r, r));
    if (rnorm <= tol * bnorm) break;
    precondition(r, z);
    const rzNew = dot(r, z);
    const beta = rzNew / rz;
    rz = rzNew;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  return { iterations: it, relResidual: rnorm / bnorm, converged: rnorm <= tol * bnorm };
}

/** Jacobi (diagonal) preconditioner from a precomputed diagonal. */
export function jacobi(diag: Float64Array, fixed: Uint8Array): LinearOperator {
  return (r, z) => {
    for (let i = 0; i < r.length; i++) z[i] = fixed[i] ? 0 : r[i] / diag[i];
  };
}
