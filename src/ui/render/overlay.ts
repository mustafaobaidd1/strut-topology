import type { Load, Point, Problem, Region, Support } from '../../lib/problem/model';
import { loadMagnitude } from '../../lib/problem/model';
import { loadNodes, meshFor, nearestNode, nodePoint, type Mesh } from '../../lib/problem/resolve';
import type { Transform } from './types';

/** Colours (kept in sync with the CSS tokens). */
const C = {
  ink: '#151515',
  ink2: '#3a3a37',
  ink3: '#66655f',
  paper: '#f2f1ed',
  load: '#ff5b14',
  loadEdge: '#b23a00',
  support: '#2747ff',
};

export function toScreen(t: Transform, p: Point): [number, number] {
  return [t.ox + p.x * t.s, t.oy - p.y * t.s];
}

export function toDomain(t: Transform, x: number, y: number): Point {
  return { x: (x - t.ox) / t.s, y: (t.oy - y) / t.s };
}

/** Base arrow length in CSS px for a unit load. */
export function arrowBase(t: Transform): number {
  return Math.max(30, Math.min(66, t.s * 0.3));
}

export function arrowLength(t: Transform, magnitude: number): number {
  return arrowBase(t) * Math.min(2.6, Math.max(0.3, magnitude));
}

/** Where a load acts on the current mesh (snapped), in domain units. */
export function loadAnchor(mesh: Mesh, l: Load): Point {
  const [i, j] = nearestNode(mesh, l.at);
  return nodePoint(mesh, i, j);
}

/** Screen position of a load's arrow head (direction/magnitude handle). */
export function loadHead(t: Transform, mesh: Mesh, l: Load): [number, number] {
  const [ax, ay] = toScreen(t, loadAnchor(mesh, l));
  const m = loadMagnitude(l) || 1;
  const len = arrowLength(t, m);
  return [ax + (l.fx / m) * len, ay - (l.fy / m) * len];
}

/** Ends of a line load on the current mesh, in domain units. */
export function lineLoadEnds(mesh: Mesh, l: Load): [Point, Point] | null {
  if (!(l.length > 0)) return null;
  const nodes = loadNodes(mesh, l);
  if (nodes.length < 2) return null;
  const a = nodes[0];
  const b = nodes[nodes.length - 1];
  return [nodePoint(mesh, a.i, a.j), nodePoint(mesh, b.i, b.j)];
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  head: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const hx = x1 - ux * head;
  const hy = y1 - uy * head;
  ctx.beginPath();
  ctx.moveTo(x0 + (-uy * width) / 2, y0 + (ux * width) / 2);
  ctx.lineTo(hx + (-uy * width) / 2, hy + (ux * width) / 2);
  ctx.lineTo(hx + -uy * head * 0.42, hy + ux * head * 0.42);
  ctx.lineTo(x1, y1);
  ctx.lineTo(hx + uy * head * 0.42, hy - ux * head * 0.42);
  ctx.lineTo(hx + (uy * width) / 2, hy - (ux * width) / 2);
  ctx.lineTo(x0 + (uy * width) / 2, y0 - (ux * width) / 2);
  ctx.closePath();
  ctx.fillStyle = C.load;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.loadEdge;
  ctx.stroke();
}

function hatchPattern(
  ctx: CanvasRenderingContext2D,
  color: string,
  spacing: number,
  cross: boolean,
) {
  const tile = document.createElement('canvas');
  const s = Math.max(4, Math.round(spacing * 2));
  tile.width = s;
  tile.height = s;
  const g = tile.getContext('2d');
  if (!g) return color;
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-1, s + 1);
  g.lineTo(s + 1, -1);
  if (cross) {
    g.moveTo(-1, -1);
    g.lineTo(s + 1, s + 1);
  }
  g.stroke();
  return ctx.createPattern(tile, 'repeat') ?? color;
}

const patternCache = new Map<string, CanvasPattern | string>();
function pattern(
  ctx: CanvasRenderingContext2D,
  key: string,
  color: string,
  spacing: number,
  cross: boolean,
) {
  let p = patternCache.get(key);
  if (!p) {
    p = hatchPattern(ctx, color, spacing, cross);
    patternCache.set(key, p);
  }
  return p;
}

function regionPath(ctx: CanvasRenderingContext2D, t: Transform, r: Region): void {
  ctx.beginPath();
  if (r.shape === 'rect') {
    const [x0, y0] = toScreen(t, r.a);
    const [x1, y1] = toScreen(t, r.b);
    ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  } else if (r.shape === 'circle') {
    const [cx, cy] = toScreen(t, r.centre);
    ctx.arc(cx, cy, r.radius * t.s, 0, Math.PI * 2);
  }
}

function drawRegion(ctx: CanvasRenderingContext2D, t: Transform, r: Region, selected: boolean) {
  if (r.kind === 'clear') return;
  const fill =
    r.kind === 'void'
      ? pattern(ctx, 'void', 'rgba(21,21,21,0.32)', 4, false)
      : pattern(ctx, 'solid', 'rgba(242,241,237,0.42)', 4, true);
  ctx.save();
  if (r.shape === 'stroke') {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2 * r.radius * t.s;
    ctx.strokeStyle = fill;
    ctx.beginPath();
    r.points.forEach((p, i) => {
      const [x, y] = toScreen(t, p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (r.points.length === 1) {
      const [x, y] = toScreen(t, r.points[0]);
      ctx.lineTo(x + 0.01, y);
    }
    ctx.stroke();
  } else {
    regionPath(ctx, t, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = r.kind === 'void' ? 'rgba(21,21,21,0.55)' : 'rgba(21,21,21,0.7)';
    ctx.stroke();
  }
  if (selected) {
    const b = regionBounds(r);
    const [x0, y0] = toScreen(t, { x: b.x0, y: b.y1 });
    const [x1, y1] = toScreen(t, { x: b.x1, y: b.y0 });
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.ink;
    ctx.strokeRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
  }
  ctx.restore();
}

export function regionBounds(r: Region): { x0: number; y0: number; x1: number; y1: number } {
  if (r.shape === 'rect') {
    return {
      x0: Math.min(r.a.x, r.b.x),
      x1: Math.max(r.a.x, r.b.x),
      y0: Math.min(r.a.y, r.b.y),
      y1: Math.max(r.a.y, r.b.y),
    };
  }
  if (r.shape === 'circle') {
    return {
      x0: r.centre.x - r.radius,
      x1: r.centre.x + r.radius,
      y0: r.centre.y - r.radius,
      y1: r.centre.y + r.radius,
    };
  }
  const xs = r.points.map((p) => p.x);
  const ys = r.points.map((p) => p.y);
  return {
    x0: Math.min(...xs) - r.radius,
    x1: Math.max(...xs) + r.radius,
    y0: Math.min(...ys) - r.radius,
    y1: Math.max(...ys) + r.radius,
  };
}

/** Outward direction (screen) for a support symbol at a domain point. */
function outward(p: Point, W: number, prefer: 'down' | 'left'): [number, number] {
  const eps = 1e-6;
  if (p.y <= eps) return [0, 1];
  if (p.y >= 1 - eps) return [0, -1];
  if (p.x <= eps) return [-1, 0];
  if (p.x >= W - eps) return [1, 0];
  return prefer === 'down' ? [0, 1] : [-1, 0];
}

function ground(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  nx: number,
  ny: number,
  half: number,
) {
  // A ground line perpendicular to (nx, ny) with hatching on its far side.
  const tx = -ny;
  const ty = nx;
  ctx.beginPath();
  ctx.moveTo(cx - tx * half, cy - ty * half);
  ctx.lineTo(cx + tx * half, cy + ty * half);
  ctx.stroke();
  ctx.beginPath();
  const n = Math.max(3, Math.round(half / 3.2));
  for (let k = 0; k <= n; k++) {
    const s = -half + (2 * half * k) / n;
    const x = cx + tx * s;
    const y = cy + ty * s;
    ctx.moveTo(x, y);
    ctx.lineTo(x + nx * 5 - tx * 4, y + ny * 5 - ty * 4);
  }
  ctx.stroke();
}

function pointSupport(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: Support['kind'],
  dir: [number, number],
  size: number,
) {
  const [nx, ny] = dir;
  const tx = -ny;
  const ty = nx;
  const h = size;
  const b = size * 0.62;
  // Triangle with its apex at the node.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + nx * h + tx * b, y + ny * h + ty * b);
  ctx.lineTo(x + nx * h - tx * b, y + ny * h - ty * b);
  ctx.closePath();
  ctx.fillStyle = 'rgba(39,71,255,0.14)';
  ctx.fill();
  ctx.stroke();
  let gx = x + nx * h;
  let gy = y + ny * h;
  if (kind !== 'fixed') {
    const r = size * 0.18;
    for (const s of [-0.5, 0.5]) {
      ctx.beginPath();
      ctx.arc(gx + tx * b * s + nx * r, gy + ty * b * s + ny * r, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    gx += nx * 2 * r;
    gy += ny * 2 * r;
  }
  ground(ctx, gx + nx * 1.5, gy + ny * 1.5, nx, ny, b * 1.25);
}

function drawSupport(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  mesh: Mesh,
  W: number,
  s: Support,
  selected: boolean,
) {
  ctx.save();
  ctx.strokeStyle = C.support;
  ctx.fillStyle = C.support;
  ctx.lineWidth = selected ? 2 : 1.4;
  ctx.lineJoin = 'round';
  const size = Math.max(11, Math.min(17, t.s * 0.075));
  if (s.shape === 'disk') {
    const [cx, cy] = toScreen(t, s.centre);
    const r = s.radius * t.s;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = pattern(ctx, 'support', 'rgba(39,71,255,0.55)', 3, false);
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Centre mark
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
  } else {
    const [ia, ja] = nearestNode(mesh, s.a);
    const [ib, jb] = nearestNode(mesh, s.b);
    const a = nodePoint(mesh, ia, ja);
    const b = nodePoint(mesh, ib, jb);
    const [ax, ay] = toScreen(t, a);
    const [bx, by] = toScreen(t, b);
    const isPoint = Math.hypot(bx - ax, by - ay) < 2;
    if (isPoint) {
      const dir = outward(a, W, s.kind === 'rollerY' ? 'left' : 'down');
      pointSupport(ctx, ax, ay, s.kind, dir, size);
    } else {
      // Edge support: a band along the segment with hatching on the outer side.
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const sameEdge =
        (a.x <= 1e-6 && b.x <= 1e-6) ||
        (a.x >= W - 1e-6 && b.x >= W - 1e-6) ||
        (a.y <= 1e-6 && b.y <= 1e-6) ||
        (a.y >= 1 - 1e-6 && b.y >= 1 - 1e-6);
      let [nx, ny] = sameEdge ? outward(mid, W, 'down') : [0, 0];
      if (!sameEdge) {
        const dx = bx - ax;
        const dy = by - ay;
        const L = Math.hypot(dx, dy);
        nx = -dy / L;
        ny = dx / L;
        if (ny < 0 || (ny === 0 && nx > 0)) {
          nx = -nx;
          ny = -ny;
        }
      }
      const off = s.kind === 'fixed' ? 0 : size * 0.42;
      if (s.kind !== 'fixed') {
        // Rollers: a row of small wheels between the edge and the ground line.
        const L = Math.hypot(bx - ax, by - ay);
        const count = Math.max(2, Math.round(L / 14));
        const r = size * 0.2;
        for (let k = 0; k <= count; k++) {
          const f = k / count;
          const x = ax + (bx - ax) * f + nx * r;
          const y = ay + (by - ay) * f + ny * r;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.moveTo(ax + nx * off, ay + ny * off);
      ctx.lineTo(bx + nx * off, by + ny * off);
      ctx.lineWidth = selected ? 3 : 2.2;
      ctx.stroke();
      ctx.lineWidth = selected ? 1.6 : 1.1;
      const L = Math.hypot(bx - ax, by - ay);
      const n = Math.max(2, Math.round(L / 5.5));
      const tx = (bx - ax) / L;
      const ty = (by - ay) / L;
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        const x = ax + (bx - ax) * f + nx * off;
        const y = ay + (by - ay) * f + ny * off;
        ctx.moveTo(x, y);
        ctx.lineTo(x + nx * 7 - tx * 5, y + ny * 7 - ty * 5);
      }
      ctx.stroke();
    }
    if (selected) {
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      const x0 = Math.min(ax, bx) - 14;
      const y0 = Math.min(ay, by) - 14;
      ctx.strokeRect(x0, y0, Math.abs(bx - ax) + 28, Math.abs(by - ay) + 28);
    }
  }
  ctx.restore();
}

function drawLoad(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  mesh: Mesh,
  l: Load,
  selected: boolean,
) {
  const m = loadMagnitude(l) || 1;
  const len = arrowLength(t, m);
  const ux = l.fx / m;
  const uy = -l.fy / m;
  const width = selected ? 3.6 : 2.8;
  const head = selected ? 13 : 11;
  ctx.save();
  const ends = lineLoadEnds(mesh, l);
  if (ends) {
    const [a, b] = ends;
    const [ax, ay] = toScreen(t, a);
    const [bx, by] = toScreen(t, b);
    const span = bx - ax;
    const count = Math.max(2, Math.round(span / 44));
    const [cx0] = toScreen(t, loadAnchor(mesh, l));
    for (let k = 0; k <= count; k++) {
      const x = ax + (span * k) / count;
      if (Math.abs(x - cx0) < 14) continue; // the main arrow stands here
      arrow(ctx, x, ay, x + ux * len * 0.42, ay + uy * len * 0.42, 1.4, 6.5);
    }
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.load;
    ctx.stroke();
    // End handles
    for (const [x, y] of [
      [ax, ay],
      [bx, by],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y + 7);
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
  }
  const [cx, cy] = toScreen(t, loadAnchor(mesh, l));
  arrow(ctx, cx, cy, cx + ux * len, cy + uy * len, width, head);
  // Application point
  ctx.beginPath();
  ctx.arc(cx, cy, selected ? 5 : 4, 0, Math.PI * 2);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.loadEdge;
  ctx.stroke();
  if (selected) {
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.loadEdge;
    ctx.beginPath();
    ctx.arc(cx, cy, len, Math.atan2(uy, ux) - 0.5, Math.atan2(uy, ux) + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function dimension(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  label: string,
  vertical: boolean,
) {
  ctx.save();
  ctx.strokeStyle = C.ink3;
  ctx.fillStyle = C.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const ah = 6;
  const tick = (x: number, y: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx * ah - dy * 2.4, y + dy * ah + dx * 2.4);
    ctx.lineTo(x + dx * ah + dy * 2.4, y + dy * ah - dx * 2.4);
    ctx.closePath();
    ctx.fill();
  };
  if (vertical) {
    tick(x0, y0, 0, 1);
    tick(x1, y1, 0, -1);
  } else {
    tick(x0, y0, 1, 0);
    tick(x1, y1, -1, 0);
  }
  ctx.font = '600 10.5px Archivo, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const w = ctx.measureText(label).width + 10;
  ctx.save();
  ctx.translate(mx, my);
  if (vertical) ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = C.paper;
  ctx.fillRect(-w / 2, -7, w, 14);
  ctx.fillStyle = C.ink2;
  ctx.fillText(label, 0, 0.5);
  ctx.restore();
  ctx.restore();
}

export interface OverlayState {
  problem: Problem;
  nely: number;
  selection: string | null;
  hover: string | null;
  /** Pointer preview (brush circle or rectangle) in domain units. */
  brush: { at: Point; radius: number; kind: 'void' | 'solid' | 'clear' } | null;
  rectPreview: { a: Point; b: Point; kind: 'void' | 'solid' | 'clear' } | null;
  segmentPreview: { a: Point; b: Point } | null;
  showSymmetry: boolean;
  showDimensions: boolean;
}

/** Draws everything that is not the material field. Canvas is in CSS pixels (dpr applied). */
export function drawOverlay(ctx: CanvasRenderingContext2D, t: Transform, st: OverlayState): void {
  const { problem } = st;
  const W = problem.width;
  const mesh = meshFor(W, st.nely);
  const [dx0, dy0] = toScreen(t, { x: 0, y: 1 });
  const [dx1, dy1] = toScreen(t, { x: W, y: 0 });

  // Domain outline and edge ruler (one tick per 8 elements).
  ctx.save();
  ctx.strokeStyle = 'rgba(21,21,21,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round(dx0) + 0.5,
    Math.round(dy0) + 0.5,
    Math.round(dx1 - dx0),
    Math.round(dy1 - dy0),
  );
  ctx.strokeStyle = 'rgba(21,21,21,0.28)';
  ctx.beginPath();
  for (let i = 0; i <= mesh.nelx; i += 8) {
    const x = Math.round(t.ox + i * mesh.h * t.s) + 0.5;
    ctx.moveTo(x, dy0 - 3);
    ctx.lineTo(x, dy0);
  }
  for (let j = 0; j <= mesh.nely; j += 8) {
    const y = Math.round(t.oy - j * mesh.h * t.s) + 0.5;
    ctx.moveTo(dx1, y);
    ctx.lineTo(dx1 + 3, y);
  }
  ctx.stroke();
  ctx.restore();

  if (st.showDimensions) {
    const by = dy1 + 40;
    ctx.save();
    ctx.strokeStyle = 'rgba(21,21,21,0.3)';
    ctx.beginPath();
    ctx.moveTo(dx0 + 0.5, dy1 + 26);
    ctx.lineTo(dx0 + 0.5, by + 5);
    ctx.moveTo(dx1 + 0.5, dy1 + 26);
    ctx.lineTo(dx1 + 0.5, by + 5);
    ctx.stroke();
    ctx.restore();
    dimension(ctx, dx0, by, dx1, by, `${mesh.nelx} EL`, false);
    const lx = dx0 - 40;
    ctx.save();
    ctx.strokeStyle = 'rgba(21,21,21,0.3)';
    ctx.beginPath();
    ctx.moveTo(dx0 - 26, dy0 + 0.5);
    ctx.lineTo(lx - 5, dy0 + 0.5);
    ctx.moveTo(dx0 - 26, dy1 + 0.5);
    ctx.lineTo(lx - 5, dy1 + 0.5);
    ctx.stroke();
    ctx.restore();
    dimension(ctx, lx, dy1, lx, dy0, `${mesh.nely} EL`, true);
  }

  for (const r of problem.regions) drawRegion(ctx, t, r, st.selection === r.id);

  if (st.showSymmetry) {
    const [sx] = toScreen(t, { x: W / 2, y: 0 });
    ctx.save();
    ctx.strokeStyle = 'rgba(21,21,21,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([14, 3, 2, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, dy0 - 14);
    ctx.lineTo(Math.round(sx) + 0.5, dy1 + 14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '600 10px Archivo, sans-serif';
    ctx.fillStyle = C.ink2;
    ctx.textAlign = 'center';
    ctx.fillText('SYM', sx, dy0 - 18);
    ctx.restore();
  }

  for (const s of problem.supports) drawSupport(ctx, t, mesh, W, s, st.selection === s.id);
  for (const l of problem.loads) drawLoad(ctx, t, mesh, l, st.selection === l.id);

  if (st.brush) {
    const [x, y] = toScreen(t, st.brush.at);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, st.brush.radius * t.s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (st.rectPreview) {
    const [x0, y0] = toScreen(t, st.rectPreview.a);
    const [x1, y1] = toScreen(t, st.rectPreview.b);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.restore();
  }
  if (st.segmentPreview) {
    const [x0, y0] = toScreen(t, st.segmentPreview.a);
    const [x1, y1] = toScreen(t, st.segmentPreview.b);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = C.support;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }
}
