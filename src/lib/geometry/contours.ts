/**
 * Outline extraction for fabrication: marching squares on the density field, sampled at
 * element centres and padded with a ring of zeros so every contour closes at the domain edge.
 * Coordinates are in element widths, x right and y up, origin at the bottom-left corner.
 * Every loop is oriented with material on its left: outer boundaries run counter-clockwise
 * and holes clockwise.
 */

export type Loop = [number, number][];

export function signedArea(loop: Loop): number {
  let a = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    a += (loop[j][0] - loop[i][0]) * (loop[j][1] + loop[i][1]);
  }
  return a / 2;
}

export function pointInLoop(x: number, y: number, loop: Loop): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Iso-contours of `density` (column-wise element numbering, rows from the top) at `level`.
 */
export function marchingSquares(
  density: ArrayLike<number>,
  nelx: number,
  nely: number,
  level = 0.5,
): Loop[] {
  const NX = nelx + 2; // samples per row, including padding
  const NY = nely + 2;
  // Sample (p, q): p = 0..nelx+1 left to right, q = 0..nely+1 bottom to top, at
  // ((p − 0.5), (q − 0.5)) element widths. Element (ex, ey) is sample (ex + 1, nely − ey).
  const S = new Float64Array(NX * NY);
  for (let ex = 0; ex < nelx; ex++) {
    for (let ey = 0; ey < nely; ey++) S[(nely - ey) * NX + ex + 1] = density[ex * nely + ey];
  }
  const at = (p: number, q: number) => S[q * NX + p];
  // Edge ids: horizontal edge from (p, q) to (p + 1, q) → 2 (q NX + p); vertical edge from
  // (p, q) to (p, q + 1) → 2 (q NX + p) + 1.
  const hEdge = (p: number, q: number) => 2 * (q * NX + p);
  const vEdge = (p: number, q: number) => 2 * (q * NX + p) + 1;
  const points = new Map<number, [number, number]>();
  const edgePoint = (id: number): [number, number] => {
    let pt = points.get(id);
    if (pt) return pt;
    const cell = id >> 1;
    const q = Math.floor(cell / NX);
    const p = cell - q * NX;
    let a: number;
    let b: number;
    if ((id & 1) === 0) {
      a = at(p, q);
      b = at(p + 1, q);
      const t = (level - a) / (b - a);
      pt = [p + t - 0.5, q - 0.5];
    } else {
      a = at(p, q);
      b = at(p, q + 1);
      const t = (level - a) / (b - a);
      pt = [p - 0.5, q + t - 0.5];
    }
    points.set(id, pt);
    return pt;
  };
  const next = new Map<number, number>();
  const link = (from: number, to: number) => next.set(from, to);
  for (let q = 0; q + 1 < NY; q++) {
    for (let p = 0; p + 1 < NX; p++) {
      const v00 = at(p, q);
      const v10 = at(p + 1, q);
      const v11 = at(p + 1, q + 1);
      const v01 = at(p, q + 1);
      const c =
        (v00 >= level ? 1 : 0) |
        (v10 >= level ? 2 : 0) |
        (v11 >= level ? 4 : 0) |
        (v01 >= level ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const B = hEdge(p, q); // bottom
      const R = vEdge(p + 1, q); // right
      const T = hEdge(p, q + 1); // top
      const L = vEdge(p, q); // left
      // Segments run with material on their left: counter-clockwise around a solid corner,
      // clockwise around a void corner.
      switch (c) {
        case 1:
          link(B, L);
          break;
        case 2:
          link(R, B);
          break;
        case 3:
          link(R, L);
          break;
        case 4:
          link(T, R);
          break;
        case 6:
          link(T, B);
          break;
        case 7:
          link(T, L);
          break;
        case 8:
          link(L, T);
          break;
        case 9:
          link(B, T);
          break;
        case 11:
          link(R, T);
          break;
        case 12:
          link(L, R);
          break;
        case 13:
          link(B, R);
          break;
        case 14:
          link(L, B);
          break;
        case 5: {
          // Bottom-left and top-right solid: joined through the centre, or two separate corners.
          if ((v00 + v10 + v11 + v01) / 4 >= level) {
            link(B, R);
            link(T, L);
          } else {
            link(B, L);
            link(T, R);
          }
          break;
        }
        case 10: {
          if ((v00 + v10 + v11 + v01) / 4 >= level) {
            link(L, B);
            link(R, T);
          } else {
            link(R, B);
            link(L, T);
          }
          break;
        }
      }
    }
  }
  const loops: Loop[] = [];
  const visited = new Set<number>();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const loop: Loop = [];
    let id: number | undefined = start;
    while (id !== undefined && !visited.has(id)) {
      visited.add(id);
      loop.push(edgePoint(id));
      id = next.get(id);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Removes loops enclosing less than `minArea` (stray specks and pin-holes). */
export function dropSmallLoops(loops: Loop[], minArea: number): Loop[] {
  return loops.filter((l) => Math.abs(signedArea(l)) >= minArea);
}

/**
 * Taubin λ|μ smoothing of closed polylines: alternating shrink and inflate steps remove the
 * staircase of the element grid without the shrinkage of plain Laplacian smoothing.
 */
export function smoothLoop(loop: Loop, iterations = 4, lambda = 0.5, mu = -0.53): Loop {
  let pts = loop.map((p) => [p[0], p[1]] as [number, number]);
  const n = pts.length;
  if (n < 4) return pts;
  for (let it = 0; it < iterations; it++) {
    for (const f of [lambda, mu]) {
      const out: Loop = new Array(n);
      for (let i = 0; i < n; i++) {
        const a = pts[(i - 1 + n) % n];
        const b = pts[i];
        const c = pts[(i + 1) % n];
        out[i] = [b[0] + f * ((a[0] + c[0]) / 2 - b[0]), b[1] + f * ((a[1] + c[1]) / 2 - b[1])];
      }
      pts = out;
    }
  }
  return pts;
}

/** Ramer–Douglas–Peucker simplification of a closed loop. */
export function simplifyLoop(loop: Loop, tolerance: number): Loop {
  const n = loop.length;
  if (n < 5) return loop;
  // Split at the vertex farthest from vertex 0, simplify both halves as open chains.
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = rdp(loop.slice(0, far + 1), tolerance);
  const b = rdp([...loop.slice(far), loop[0]], tolerance);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : loop;
}

function rdp(pts: Loop, tol: number): Loop {
  if (pts.length < 3) return pts;
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[pts.length - 1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  let idx = -1;
  let dmax = tol;
  for (let i = 1; i < pts.length - 1; i++) {
    const d =
      len > 0
        ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + x1 * y0 - y1 * x0) / len
        : Math.hypot(pts[i][0] - x0, pts[i][1] - y0);
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (idx < 0) return [pts[0], pts[pts.length - 1]];
  const left = rdp(pts.slice(0, idx + 1), tol);
  const right = rdp(pts.slice(idx), tol);
  return [...left.slice(0, -1), ...right];
}

export interface Shape {
  outer: Loop;
  holes: Loop[];
}

/**
 * Groups loops into shapes (an outer boundary with its holes) using the nesting depth:
 * even depth = outer boundary of material, odd depth = hole.
 */
export function groupShapes(loops: Loop[]): Shape[] {
  const depth = loops.map((l, i) => {
    const [x, y] = l[0];
    let d = 0;
    loops.forEach((m, j) => {
      if (j !== i && pointInLoop(x, y, m)) d++;
    });
    return d;
  });
  const shapes: Shape[] = [];
  const outerIndex = new Map<number, number>();
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 0) {
      outerIndex.set(i, shapes.length);
      shapes.push({ outer: l, holes: [] });
    }
  });
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 0) return;
    // Parent = the enclosing outer loop with depth one less.
    const [x, y] = l[0];
    let parent = -1;
    loops.forEach((m, j) => {
      if (depth[j] === depth[i] - 1 && pointInLoop(x, y, m)) parent = j;
    });
    const s = outerIndex.get(parent);
    if (s !== undefined) shapes[s].holes.push(l);
  });
  return shapes;
}

/** The full pipeline: contour, clean, smooth, simplify, group. */
export function extractShapes(
  density: ArrayLike<number>,
  nelx: number,
  nely: number,
  options: { level?: number; smoothing?: number; tolerance?: number; minArea?: number } = {},
): Shape[] {
  const loops = marchingSquares(density, nelx, nely, options.level ?? 0.5);
  const cleaned = dropSmallLoops(loops, options.minArea ?? 1.5).map((l) =>
    simplifyLoop(smoothLoop(l, options.smoothing ?? 4), options.tolerance ?? 0.08),
  );
  // Smoothing could in principle flip a tiny loop; keep the material-on-the-left convention.
  const oriented = cleaned.filter((l) => l.length >= 3);
  return groupShapes(oriented);
}
