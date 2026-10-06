import type { GridProblem } from '../opt/optimizer';

/**
 * Checks that a meshed problem is well posed before it is handed to the solver: the supports
 * must stop every rigid-body motion (otherwise K is singular), something must load the
 * structure, and the passive regions must leave a feasible material budget.
 */

export type IssueCode =
  | 'no-supports'
  | 'mechanism'
  | 'no-loads'
  | 'loads-on-supports'
  | 'too-much-solid'
  | 'no-design-space';

export interface Issue {
  code: IssueCode;
  title: string;
  detail: string;
}

export interface Warning {
  code: 'load-in-void' | 'support-in-void';
  detail: string;
}

export interface Validation {
  ok: boolean;
  issue: Issue | null;
  warnings: Warning[];
}

/**
 * Rank (0..3) of the rigid-body constraints imposed by the fixed DOFs: a fixed x-DOF at (X, Y)
 * removes the combination [1, 0, −Y] of (translation x, translation y, rotation), a fixed
 * y-DOF removes [0, 1, X].
 */
export function rigidBodyRank(p: GridProblem): number {
  const { nelx, nely, fixed } = p;
  const nny = nely + 1;
  const scale = Math.max(nelx, nely);
  const cx = nelx / 2;
  const cy = nely / 2;
  // Accumulate the 3 x 3 Gram matrix Σ r rᵀ of the constraint rows.
  const G = new Float64Array(9);
  let count = 0;
  for (let d = 0; d < fixed.length; d++) {
    if (!fixed[d]) continue;
    count++;
    const n = d >> 1;
    const i = Math.floor(n / nny);
    const j = n - i * nny;
    const X = (i - cx) / scale;
    const Y = (nely - j - cy) / scale;
    const r = d & 1 ? [0, 1, X] : [1, 0, -Y];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) G[a * 3 + b] += r[a] * r[b];
  }
  if (count === 0) return 0;
  // Rank via Gaussian elimination with pivoting on the symmetric Gram matrix.
  const m = Array.from(G);
  const tol = 1e-10 * Math.max(...m.map(Math.abs));
  let rank = 0;
  const used = [false, false, false];
  for (let col = 0; col < 3; col++) {
    let piv = -1;
    let best = tol;
    for (let row = 0; row < 3; row++) {
      if (!used[row] && Math.abs(m[row * 3 + col]) > best) {
        best = Math.abs(m[row * 3 + col]);
        piv = row;
      }
    }
    if (piv < 0) continue;
    used[piv] = true;
    rank++;
    for (let row = 0; row < 3; row++) {
      if (row === piv) continue;
      const f = m[row * 3 + col] / m[piv * 3 + col];
      for (let k = 0; k < 3; k++) m[row * 3 + k] -= f * m[piv * 3 + k];
    }
  }
  return rank;
}

export function validateProblem(p: GridProblem, volfrac: number): Validation {
  const warnings: Warning[] = [];
  const { fixed, force, passive, nelx, nely } = p;
  let anyFixed = false;
  for (let d = 0; d < fixed.length; d++) if (fixed[d]) anyFixed = true;
  if (!anyFixed) {
    return fail(
      'no-supports',
      'The structure can fly away — add at least one fixed support',
      'Without supports nothing stops the part from moving as a whole, so the stiffness matrix is singular.',
      warnings,
    );
  }
  const rank = rigidBodyRank(p);
  if (rank < 3) {
    return fail(
      'mechanism',
      'The supports still let it slide or spin — add another support',
      rank === 2
        ? 'A single pin, or rollers that all point through one spot, leave a rotation free. Add a second support away from the first.'
        : 'Rollers that all roll the same way leave a sliding motion free. Add a fixed support or a roller facing the other way.',
      warnings,
    );
  }
  let anyLoad = false;
  let freeLoad = false;
  for (let d = 0; d < force.length; d++) {
    if (force[d] !== 0) {
      anyLoad = true;
      if (!fixed[d]) freeLoad = true;
    }
  }
  if (!anyLoad) {
    return fail(
      'no-loads',
      'Nothing to resist — add a load',
      'With no load every design is equally stiff, so there is nothing to optimise.',
      warnings,
    );
  }
  if (!freeLoad) {
    return fail(
      'loads-on-supports',
      'Nothing to resist — every load sits on a support',
      'Loads applied straight into a support never reach the structure. Move a load away from the supports.',
      warnings,
    );
  }
  const n = nelx * nely;
  let solid = 0;
  let free = 0;
  for (let e = 0; e < n; e++) {
    if (passive[e] === 1) solid++;
    else if (passive[e] === 0) free++;
  }
  if (free === 0) {
    return fail(
      'no-design-space',
      'There is no room left to design',
      'Passive regions cover the whole domain. Erase part of a void or solid region.',
      warnings,
    );
  }
  if (solid > volfrac * n + 1e-9) {
    return fail(
      'too-much-solid',
      'The solid regions use up the whole material budget',
      `Solid regions fill ${((100 * solid) / n).toFixed(0)} % of the domain but the volume fraction allows ${(100 * volfrac).toFixed(0)} %. Raise the volume fraction or shrink the solid regions.`,
      warnings,
    );
  }
  // Loads or supports surrounded only by void elements act on (almost) nothing.
  const nny = nely + 1;
  const surroundedByVoid = (nodeIdx: number): boolean => {
    const i = Math.floor(nodeIdx / nny);
    const j = nodeIdx - i * nny;
    let any = false;
    for (const [ex, ey] of [
      [i - 1, j - 1],
      [i, j - 1],
      [i - 1, j],
      [i, j],
    ]) {
      if (ex < 0 || ey < 0 || ex >= nelx || ey >= nely) continue;
      any = true;
      if (passive[ex * nely + ey] !== -1) return false;
    }
    return any;
  };
  for (let d = 0; d < force.length; d += 2) {
    if ((force[d] !== 0 || force[d + 1] !== 0) && surroundedByVoid(d >> 1)) {
      warnings.push({
        code: 'load-in-void',
        detail: 'A load sits inside a void region, where there is no material to push on.',
      });
      break;
    }
  }
  for (let d = 0; d < fixed.length; d += 2) {
    if ((fixed[d] || fixed[d + 1]) && surroundedByVoid(d >> 1)) {
      warnings.push({
        code: 'support-in-void',
        detail: 'A support sits inside a void region and cannot hold any material.',
      });
      break;
    }
  }
  return { ok: true, issue: null, warnings };
}

function fail(code: IssueCode, title: string, detail: string, warnings: Warning[]): Validation {
  return { ok: false, issue: { code, title, detail }, warnings };
}
