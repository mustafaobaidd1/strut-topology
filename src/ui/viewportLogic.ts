import {
  clamp,
  cloneProblem,
  loadMagnitude,
  type Load,
  type Point,
  type Problem,
  type Region,
  type Support,
} from '../lib/problem/model';
import { distanceToSegment, nearestNode, nodePoint, type Mesh } from '../lib/problem/resolve';
import { arrowBase, regionBounds, toScreen } from './render/overlay';
import type { Transform } from './render/types';

export interface Margins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Fits the W x 1 domain into a box, centred, leaving margins for annotations. */
export function fitTransform(cw: number, ch: number, W: number, m: Margins): Transform {
  const aw = Math.max(10, cw - m.left - m.right);
  const ah = Math.max(10, ch - m.top - m.bottom);
  const s = Math.max(1, Math.min(aw / W, ah));
  const ox = m.left + (aw - W * s) / 2;
  const oy = m.top + (ah - s) / 2 + s;
  return { ox: Math.round(ox), oy: Math.round(oy), s };
}

/** Snaps a domain point to the nearest grid node, inside the domain. */
export function snapToNode(mesh: Mesh, p: Point): Point {
  const [i, j] = nearestNode(mesh, p);
  return nodePoint(mesh, i, j);
}

/** Snaps a support segment: axis-aligned, and onto a domain edge when close to one. */
export function snapSegment(mesh: Mesh, W: number, a: Point, b: Point): [Point, Point] {
  let A = snapToNode(mesh, a);
  let B = snapToNode(mesh, b);
  if (Math.abs(B.x - A.x) >= Math.abs(B.y - A.y)) B = { x: B.x, y: A.y };
  else B = { x: A.x, y: B.y };
  const near = 0.04;
  const stick = (p: Point): Point => ({
    x: p.x < near ? 0 : p.x > W - near ? W : p.x,
    y: p.y < near ? 0 : p.y > 1 - near ? 1 : p.y,
  });
  if (A.y === B.y) {
    const y = stick({ x: 0.5, y: A.y }).y;
    A = { x: A.x, y };
    B = { x: B.x, y };
  } else {
    const x = stick({ x: A.x, y: 0.5 }).x;
    A = { x, y: A.y };
    B = { x, y: B.y };
  }
  return [snapToNode(mesh, A), snapToNode(mesh, B)];
}

export function insideRegion(r: Region, p: Point): boolean {
  if (r.shape === 'rect') {
    const b = regionBounds(r);
    return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
  }
  if (r.shape === 'circle') return Math.hypot(p.x - r.centre.x, p.y - r.centre.y) <= r.radius;
  for (let k = 0; k < r.points.length; k++) {
    const a = r.points[k];
    const b = r.points[Math.min(k + 1, r.points.length - 1)];
    if (distanceToSegment(p.x, p.y, a, b) <= r.radius) return true;
  }
  return false;
}

/** Topmost entity under a screen point: supports (within tolerance), then regions. */
export function hitTest(
  problem: Problem,
  mesh: Mesh,
  t: Transform,
  x: number,
  y: number,
  tolerancePx = 12,
): string | null {
  for (let k = problem.supports.length - 1; k >= 0; k--) {
    const s = problem.supports[k];
    if (s.shape === 'disk') {
      const [cx, cy] = toScreen(t, s.centre);
      if (Math.hypot(x - cx, y - cy) <= s.radius * t.s + tolerancePx) return s.id;
    } else {
      const a = toScreen(t, snapToNode(mesh, s.a));
      const b = toScreen(t, snapToNode(mesh, s.b));
      const d = distanceToSegment(x, y, { x: a[0], y: a[1] }, { x: b[0], y: b[1] });
      if (d <= tolerancePx + 8) return s.id;
    }
  }
  const p = { x: (x - t.ox) / t.s, y: (t.oy - y) / t.s };
  for (let k = problem.regions.length - 1; k >= 0; k--) {
    const r = problem.regions[k];
    if (r.kind !== 'clear' && insideRegion(r, p)) return r.id;
  }
  return null;
}

/** Centre of an entity (domain units), where its move handle sits. */
export function supportCentre(s: Support): Point {
  if (s.shape === 'disk') return s.centre;
  return { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
}

export function regionCentre(r: Region): Point {
  const b = regionBounds(r);
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

/** Returns a copy of the problem with one entity transformed by `fn`. */
export function updateEntity(
  problem: Problem,
  id: string,
  fn: {
    load?: (l: Load) => Load;
    support?: (s: Support) => Support;
    region?: (r: Region) => Region;
  },
): Problem {
  const p = cloneProblem(problem);
  if (fn.load) p.loads = p.loads.map((l) => (l.id === id ? (fn.load as (l: Load) => Load)(l) : l));
  if (fn.support) {
    p.supports = p.supports.map((s) =>
      s.id === id ? (fn.support as (s: Support) => Support)(s) : s,
    );
  }
  if (fn.region) {
    p.regions = p.regions.map((r) => (r.id === id ? (fn.region as (r: Region) => Region)(r) : r));
  }
  return p;
}

/** Moves a load so that its application point lands on the snapped node nearest `to`. */
export function moveLoad(l: Load, to: Point, mesh: Mesh, W: number): Load {
  const at = snapToNode(mesh, to);
  if (l.length > 0) {
    const half = l.length / 2;
    at.x = clamp(at.x, Math.min(half, W / 2), Math.max(W - half, W / 2));
    return { ...l, at: snapToNode(mesh, at) };
  }
  return { ...l, at };
}

/** Sets direction and magnitude from the arrow head position (screen). */
export function aimLoad(
  l: Load,
  anchorScreen: [number, number],
  head: [number, number],
  t: Transform,
  snapAngle: boolean,
): Load {
  const dx = head[0] - anchorScreen[0];
  const dy = -(head[1] - anchorScreen[1]);
  const len = Math.hypot(dx, dy);
  if (len < 4) return l;
  let ang = Math.atan2(dy, dx);
  if (snapAngle) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
  const mag = Math.round(clamp(len / arrowBase(t), 0.25, 3) * 20) / 20;
  return { ...l, fx: round4(mag * Math.cos(ang)), fy: round4(mag * Math.sin(ang)) };
}

/** Rotates a load by `deg` degrees and scales it by `dm` (keyboard alternative). */
export function nudgeLoadAim(l: Load, deg: number, dm: number): Load {
  const m = loadMagnitude(l) || 1;
  const ang = Math.atan2(l.fy, l.fx) + (deg * Math.PI) / 180;
  const mag = Math.round(clamp(m + dm, 0.25, 3) * 20) / 20;
  return { ...l, fx: round4(mag * Math.cos(ang)), fy: round4(mag * Math.sin(ang)) };
}

/** Moves one end of a line load (the other end stays). */
export function dragLineEnd(l: Load, end: 0 | 1, to: Point, mesh: Mesh, W: number): Load {
  const half = l.length / 2;
  const x0 = l.at.x - half;
  const x1 = l.at.x + half;
  const p = snapToNode(mesh, { x: clamp(to.x, 0, W), y: l.at.y });
  let a = end === 0 ? p.x : x0;
  let b = end === 1 ? p.x : x1;
  if (b - a < 2 * mesh.h) {
    if (end === 0) a = b - 2 * mesh.h;
    else b = a + 2 * mesh.h;
  }
  return { ...l, at: { x: (a + b) / 2, y: l.at.y }, length: b - a };
}

export function translateSupport(s: Support, d: Point, mesh: Mesh, W: number): Support {
  if (s.shape === 'disk') {
    return {
      ...s,
      centre: snapToNode(mesh, {
        x: clamp(s.centre.x + d.x, 0, W),
        y: clamp(s.centre.y + d.y, 0, 1),
      }),
    };
  }
  const minX = Math.min(s.a.x, s.b.x);
  const maxX = Math.max(s.a.x, s.b.x);
  const minY = Math.min(s.a.y, s.b.y);
  const maxY = Math.max(s.a.y, s.b.y);
  const dx = clamp(d.x, -minX, W - maxX);
  const dy = clamp(d.y, -minY, 1 - maxY);
  return {
    ...s,
    a: snapToNode(mesh, { x: s.a.x + dx, y: s.a.y + dy }),
    b: snapToNode(mesh, { x: s.b.x + dx, y: s.b.y + dy }),
  };
}

export function translateRegion(r: Region, d: Point): Region {
  const mv = (p: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });
  if (r.shape === 'rect') return { ...r, a: mv(r.a), b: mv(r.b) };
  if (r.shape === 'circle') return { ...r, centre: mv(r.centre) };
  return { ...r, points: r.points.map(mv) };
}

function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

/** Plain-language direction of a force, for screen readers. */
export function describeDirection(fx: number, fy: number): string {
  const ang = (Math.atan2(fy, fx) * 180) / Math.PI;
  const dirs = ['right', 'up-right', 'up', 'up-left', 'left', 'down-left', 'down', 'down-right'];
  const k = Math.round((((ang % 360) + 360) % 360) / 45) % 8;
  return dirs[k];
}
