/**
 * Structured grid of unit-square elements, numbered exactly like the 88-line code:
 * nodes and elements column-wise from the top-left corner, DOFs 2n (x) and 2n + 1 (y) for
 * node n (zero-based here). Rows (j) count downwards from the top; physical y points up,
 * so a node in row j sits at height y = nely - j.
 */
export interface Grid {
  readonly nelx: number;
  readonly nely: number;
  /** Nodes per row / column. */
  readonly nnx: number;
  readonly nny: number;
  readonly nNodes: number;
  readonly nDofs: number;
  readonly nEl: number;
  /** Eight DOF numbers per element, in local order BL, BR, TR, TL (x then y). */
  readonly edof: Int32Array;
}

/** (column, row-from-top) offsets of the local nodes BL, BR, TR, TL from the top-left node. */
export const LOCAL_NODE_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
];

export function createGrid(nelx: number, nely: number): Grid {
  if (!Number.isInteger(nelx) || !Number.isInteger(nely) || nelx < 1 || nely < 1) {
    throw new RangeError(`Invalid grid ${nelx} x ${nely}`);
  }
  const nnx = nelx + 1;
  const nny = nely + 1;
  const nEl = nelx * nely;
  const edof = new Int32Array(nEl * 8);
  for (let ex = 0; ex < nelx; ex++) {
    for (let ey = 0; ey < nely; ey++) {
      const e = ex * nely + ey;
      const n1 = ex * nny + ey; // top-left
      const n2 = (ex + 1) * nny + ey; // top-right
      const o = e * 8;
      edof[o] = 2 * (n1 + 1);
      edof[o + 1] = 2 * (n1 + 1) + 1;
      edof[o + 2] = 2 * (n2 + 1);
      edof[o + 3] = 2 * (n2 + 1) + 1;
      edof[o + 4] = 2 * n2;
      edof[o + 5] = 2 * n2 + 1;
      edof[o + 6] = 2 * n1;
      edof[o + 7] = 2 * n1 + 1;
    }
  }
  return { nelx, nely, nnx, nny, nNodes: nnx * nny, nDofs: 2 * nnx * nny, nEl, edof };
}

/** Node number of column `i` (0..nelx) and row `j` (0..nely, from the top). */
export function nodeAt(grid: Grid, i: number, j: number): number {
  return i * grid.nny + j;
}

/** Element number of column `ex` and row `ey` (from the top). */
export function elementAt(grid: Grid, ex: number, ey: number): number {
  return ex * grid.nely + ey;
}

/** Physical coordinates (x right, y up) of node `n`, in element widths. */
export function nodeXY(grid: Grid, n: number): [number, number] {
  const i = Math.floor(n / grid.nny);
  const j = n - i * grid.nny;
  return [i, grid.nely - j];
}
