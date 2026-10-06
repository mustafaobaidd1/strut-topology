import earcut from 'earcut';
import { signedArea, type Loop, type Shape } from './contours';

/**
 * Fabrication exports of an outline (shapes in element widths, y up):
 * - SVG: closed cubic Bézier cut paths in millimetres for laser cutting / CNC routing.
 * - STL: the outline extruded to a plate, as a watertight binary STL for 3D printing.
 */

export interface ExportSize {
  /** Physical width of the design domain in millimetres. */
  widthMm: number;
  /** Domain size in element widths. */
  nelx: number;
  nely: number;
}

/** Catmull–Rom spline through a closed loop, as cubic Bézier control points. */
function bezierPath(loop: Loop, s: number, H: number): string {
  const n = loop.length;
  const P = (i: number) => loop[((i % n) + n) % n];
  const X = (p: [number, number]) => (p[0] * s).toFixed(3);
  const Y = (p: [number, number]) => ((H - p[1]) * s).toFixed(3);
  const parts = [`M${X(P(0))} ${Y(P(0))}`];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    parts.push(`C${X(c1)} ${Y(c1)} ${X(c2)} ${Y(c2)} ${X(p2)} ${Y(p2)}`);
  }
  parts.push('Z');
  return parts.join('');
}

export interface SvgMeta {
  title: string;
  description: string;
}

/** Cut-ready SVG: one path per closed outline, hairline strokes, sized in millimetres. */
export function shapesToSvg(shapes: Shape[], size: ExportSize, meta: SvgMeta): string {
  const s = size.widthMm / size.nelx; // mm per element
  const W = size.widthMm;
  const Hmm = size.nely * s;
  const paths: string[] = [];
  for (const shape of shapes) {
    const d = [shape.outer, ...shape.holes].map((l) => bezierPath(l, s, size.nely)).join(' ');
    paths.push(`    <path d="${d}"/>`);
  }
  const esc = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}mm" height="${Hmm.toFixed(2)}mm" viewBox="0 0 ${W.toFixed(3)} ${Hmm.toFixed(3)}">`,
    `  <title>${esc(meta.title)}</title>`,
    `  <desc>${esc(meta.description)}</desc>`,
    `  <g id="cut" fill="none" stroke="#000000" stroke-width="0.1" stroke-linejoin="round" fill-rule="evenodd">`,
    ...paths,
    `  </g>`,
    `</svg>`,
    ``,
  ].join('\n');
}

/** Resamples a closed loop along its Catmull–Rom spline (k points per segment). */
export function densifyLoop(loop: Loop, k: number): Loop {
  if (k <= 1) return loop;
  const n = loop.length;
  const P = (i: number) => loop[((i % n) + n) % n];
  const out: Loop = [];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

export interface Mesh3 {
  /** Triangle vertices, 9 numbers per triangle (counter-clockwise seen from outside). */
  triangles: Float32Array;
  count: number;
}

/** Extrudes shapes (element widths) to a plate of `thicknessMm`, scaled to `size`. */
export function extrudeShapes(
  shapes: Shape[],
  size: ExportSize,
  thicknessMm: number,
  densify = 3,
): Mesh3 {
  const s = size.widthMm / size.nelx;
  const tris: number[] = [];
  const t = thicknessMm;
  for (const shape of shapes) {
    const rings = [shape.outer, ...shape.holes].map((l) => densifyLoop(l, densify));
    const flat: number[] = [];
    const holeIdx: number[] = [];
    for (let r = 0; r < rings.length; r++) {
      if (r > 0) holeIdx.push(flat.length / 2);
      for (const [x, y] of rings[r]) flat.push(x * s, y * s);
    }
    const idx = earcut(flat, holeIdx, 2);
    for (let i = 0; i < idx.length; i += 3) {
      let a = idx[i];
      let b = idx[i + 1];
      const c = idx[i + 2];
      const area =
        (flat[2 * b] - flat[2 * a]) * (flat[2 * c + 1] - flat[2 * a + 1]) -
        (flat[2 * c] - flat[2 * a]) * (flat[2 * b + 1] - flat[2 * a + 1]);
      if (area < 0) [a, b] = [b, a];
      // Top face (normal +z), counter-clockwise.
      tris.push(
        flat[2 * a],
        flat[2 * a + 1],
        t,
        flat[2 * b],
        flat[2 * b + 1],
        t,
        flat[2 * c],
        flat[2 * c + 1],
        t,
      );
      // Bottom face (normal −z), reversed.
      tris.push(
        flat[2 * a],
        flat[2 * a + 1],
        0,
        flat[2 * c],
        flat[2 * c + 1],
        0,
        flat[2 * b],
        flat[2 * b + 1],
        0,
      );
    }
    // Side walls: every loop has material on its left, so the outward normal of edge a → b is
    // to its right and (a0, b0, b1), (a0, b1, a1) face outwards.
    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[(i + 1) % n];
        const Ax = ax * s;
        const Ay = ay * s;
        const Bx = bx * s;
        const By = by * s;
        tris.push(Ax, Ay, 0, Bx, By, 0, Bx, By, t);
        tris.push(Ax, Ay, 0, Bx, By, t, Ax, Ay, t);
      }
    }
  }
  return { triangles: Float32Array.from(tris), count: tris.length / 9 };
}

/** Binary STL (little endian): 80-byte header, count, then normal + 3 vertices per facet. */
export function meshToStl(mesh: Mesh3, header: string): ArrayBuffer {
  const buf = new ArrayBuffer(84 + mesh.count * 50);
  const view = new DataView(buf);
  const head = header.slice(0, 80);
  for (let i = 0; i < head.length; i++) view.setUint8(i, head.charCodeAt(i) & 0x7f);
  view.setUint32(80, mesh.count, true);
  const v = mesh.triangles;
  let o = 84;
  for (let f = 0; f < mesh.count; f++) {
    const k = f * 9;
    const ux = v[k + 3] - v[k];
    const uy = v[k + 4] - v[k + 1];
    const uz = v[k + 5] - v[k + 2];
    const wx = v[k + 6] - v[k];
    const wy = v[k + 7] - v[k + 1];
    const wz = v[k + 8] - v[k + 2];
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    view.setFloat32(o, nx, true);
    view.setFloat32(o + 4, ny, true);
    view.setFloat32(o + 8, nz, true);
    for (let j = 0; j < 9; j++) view.setFloat32(o + 12 + 4 * j, v[k + j], true);
    view.setUint16(o + 48, 0, true);
    o += 50;
  }
  return buf;
}

/** Total material area of shapes, in element widths squared. */
export function shapesArea(shapes: Shape[]): number {
  let a = 0;
  for (const s of shapes) {
    a += signedArea(s.outer);
    for (const h of s.holes) a += signedArea(h);
  }
  return a;
}

/** Sensible file name stem, e.g. `strut-bridge-144x48-vf25-it87`. */
export function fileStem(
  preset: string,
  nelx: number,
  nely: number,
  volfrac: number,
  iteration: number,
): string {
  const slug = preset
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `strut-${slug || 'custom'}-${nelx}x${nely}-vf${Math.round(volfrac * 100)}-it${iteration}`;
}
