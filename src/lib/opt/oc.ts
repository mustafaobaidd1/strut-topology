/**
 * Optimality-criteria update (Bendsøe 1995; Sigmund 2001; Andreassen et al. 2011):
 *
 *   x_new = clamp(x · sqrt(−∂c/∂x / (λ ∂V/∂x)), max(0, x − m), min(1, x + m))
 *
 * with move limit m and the Lagrange multiplier λ found so that the physical volume meets
 * the target.
 */

export interface OCResult {
  lambda: number;
  /** Physical volume (sum of physical densities) reached. */
  volume: number;
  /** Number of volume evaluations used to find λ. */
  evaluations: number;
}

/**
 * Candidate design for multiplier λ. Elements with `design[e] === 0` keep their value.
 */
export function ocCandidate(
  x: Float64Array,
  dc: Float64Array,
  dv: Float64Array,
  design: Uint8Array | null,
  move: number,
  lambda: number,
  out: Float64Array,
): void {
  for (let e = 0; e < x.length; e++) {
    if (design && !design[e]) {
      out[e] = x[e];
      continue;
    }
    const xe = x[e];
    // −dc can only be negative through round-off; clamp so sqrt stays real.
    const b = Math.sqrt(Math.max(0, -dc[e]) / dv[e] / lambda);
    let v = xe * b;
    if (v > xe + move) v = xe + move;
    if (v > 1) v = 1;
    if (v < xe - move) v = xe - move;
    if (v < 0) v = 0;
    out[e] = v;
  }
}

/**
 * Bisection exactly as in the 88-line code: λ ∈ [0, 1e9], stop when
 * (l2 − l1)/(l1 + l2) ≤ 1e-3, moving l1 up while the volume is too large.
 */
export function ocBisect88(
  x: Float64Array,
  dc: Float64Array,
  dv: Float64Array,
  move: number,
  volumeOf: (xnew: Float64Array) => number,
  target: number,
  xnew: Float64Array,
  design: Uint8Array | null = null,
): OCResult {
  let l1 = 0;
  let l2 = 1e9;
  let lmid = 0;
  let volume = 0;
  let evaluations = 0;
  while ((l2 - l1) / (l1 + l2) > 1e-3) {
    lmid = 0.5 * (l2 + l1);
    ocCandidate(x, dc, dv, design, move, lmid, xnew);
    volume = volumeOf(xnew);
    evaluations++;
    if (volume > target) l1 = lmid;
    else l2 = lmid;
  }
  return { lambda: lmid, volume, evaluations };
}

/**
 * Faster, tighter multiplier search for interactive use: the volume is monotone in log λ, so
 * we bracket around the previous λ and refine with the Illinois variant of regula falsi.
 * The final candidate is left in `xnew`.
 */
export function ocIllinois(
  x: Float64Array,
  dc: Float64Array,
  dv: Float64Array,
  design: Uint8Array | null,
  move: number,
  volumeOf: (xnew: Float64Array) => number,
  target: number,
  lambdaGuess: number,
  xnew: Float64Array,
  volumeTol = 1e-7 * x.length,
): OCResult {
  let evaluations = 0;
  const g = (t: number): number => {
    ocCandidate(x, dc, dv, design, move, Math.exp(t), xnew);
    evaluations++;
    return volumeOf(xnew) - target; // decreasing in t
  };
  let t0 = Math.log(lambdaGuess > 0 && Number.isFinite(lambdaGuess) ? lambdaGuess : 1);
  let g0 = g(t0);
  if (Math.abs(g0) <= volumeTol) return { lambda: Math.exp(t0), volume: g0 + target, evaluations };
  // Expand a bracket [ta, tb] with g(ta) > 0 > g(tb).
  let step = g0 > 0 ? 1 : -1;
  let t1 = t0 + step;
  let g1 = g(t1);
  while (Math.sign(g1) === Math.sign(g0) && Math.abs(g1) > volumeTol && evaluations < 80) {
    t0 = t1;
    g0 = g1;
    step *= 2;
    t1 = t0 + step;
    g1 = g(t1);
  }
  if (Math.abs(g1) <= volumeTol || Math.sign(g1) === Math.sign(g0)) {
    // Either converged or the target is unreachable within the move limits (bound active).
    return { lambda: Math.exp(t1), volume: g1 + target, evaluations };
  }
  let ta = t0;
  let ga = g0;
  let tb = t1;
  let gb = g1;
  let side = 0;
  let t = tb;
  let gt = gb;
  for (let it = 0; it < 100; it++) {
    t = (ta * gb - tb * ga) / (gb - ga);
    if (!Number.isFinite(t)) t = 0.5 * (ta + tb);
    gt = g(t);
    if (Math.abs(gt) <= volumeTol || Math.abs(tb - ta) < 1e-12) break;
    if (Math.sign(gt) === Math.sign(gb)) {
      tb = t;
      gb = gt;
      if (side === -1) ga *= 0.5;
      side = -1;
    } else {
      ta = t;
      ga = gt;
      if (side === 1) gb *= 0.5;
      side = 1;
    }
  }
  return { lambda: Math.exp(t), volume: gt + target, evaluations };
}
