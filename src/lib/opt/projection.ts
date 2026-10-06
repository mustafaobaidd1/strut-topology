/**
 * Smoothed Heaviside projections that push filtered densities towards 0 or 1.
 */

/**
 * Wang, Lazarov & Sigmund (2011):
 * x̄ = (tanh(βη) + tanh(β(x̃ − η))) / (tanh(βη) + tanh(β(1 − η))).
 * β → 0 recovers the identity; β → ∞ a step at the threshold η.
 */
export function projectTanh(xt: number, beta: number, eta: number): number {
  if (beta < 1e-8) return xt;
  const a = Math.tanh(beta * eta);
  return (a + Math.tanh(beta * (xt - eta))) / (a + Math.tanh(beta * (1 - eta)));
}

/** d x̄ / d x̃ of `projectTanh`. */
export function projectTanhDerivative(xt: number, beta: number, eta: number): number {
  if (beta < 1e-8) return 1;
  const t = Math.tanh(beta * (xt - eta));
  return (beta * (1 - t * t)) / (Math.tanh(beta * eta) + Math.tanh(beta * (1 - eta)));
}

/** Guest, Prévost & Belytschko (2004) as written in the 88-line paper: 1 − e^(−βx̃) + x̃e^(−β). */
export function projectExp(xt: number, beta: number): number {
  return 1 - Math.exp(-beta * xt) + xt * Math.exp(-beta);
}

export function projectExpDerivative(xt: number, beta: number): number {
  return beta * Math.exp(-beta * xt) + Math.exp(-beta);
}

/**
 * Uniform design value whose tanh projection equals `target` (so the first frame of a
 * projected run shows exactly the requested volume fraction).
 */
export function inverseProjectTanh(target: number, beta: number, eta: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (projectTanh(mid, beta, eta) < target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}
