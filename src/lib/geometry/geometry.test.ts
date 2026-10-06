import { describe, expect, it } from 'vitest';
import {
  dropSmallLoops,
  extractShapes,
  groupShapes,
  marchingSquares,
  signedArea,
  smoothLoop,
} from './contours';
import { extrudeShapes, fileStem, meshToStl, shapesArea, shapesToSvg } from './exporters';

/** Density field of a disc (or ring) on a grid, with a linear ramp across the edge. */
function ringField(nelx: number, nely: number, cx: number, cy: number, r0: number, r1: number) {
  const d = new Float64Array(nelx * nely);
  for (let ex = 0; ex < nelx; ex++) {
    for (let ey = 0; ey < nely; ey++) {
      const x = ex + 0.5;
      const y = nely - ey - 0.5;
      const r = Math.hypot(x - cx, y - cy);
      const outer = Math.min(1, Math.max(0, r1 - r + 0.5));
      const inner = Math.min(1, Math.max(0, r - r0 + 0.5));
      d[ex * nely + ey] = Math.min(outer, r0 > 0 ? inner : 1);
    }
  }
  return d;
}

describe('marching squares outlines', () => {
  it('a disc gives one counter-clockwise loop with area ≈ πr²', () => {
    const loops = marchingSquares(ringField(40, 40, 20, 20, 0, 12), 40, 40);
    expect(loops).toHaveLength(1);
    const a = signedArea(loops[0]);
    expect(a).toBeGreaterThan(0);
    expect(Math.abs(a - Math.PI * 144) / (Math.PI * 144)).toBeLessThan(0.01);
  });

  it('a ring gives an outer loop and a clockwise hole, grouped into one shape', () => {
    const loops = marchingSquares(ringField(50, 50, 25, 25, 8, 18), 50, 50);
    expect(loops).toHaveLength(2);
    const areas = loops.map(signedArea).sort((a, b) => a - b);
    expect(areas[0]).toBeLessThan(0);
    expect(areas[1]).toBeGreaterThan(0);
    const shapes = groupShapes(loops);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);
    const area = shapesArea(shapes);
    const exact = Math.PI * (18 ** 2 - 8 ** 2);
    expect(Math.abs(area - exact) / exact).toBeLessThan(0.01);
  });

  it('material touching the domain edge closes along the edge', () => {
    const d = new Float64Array(10 * 4).fill(1);
    const loops = marchingSquares(d, 10, 4);
    expect(loops).toHaveLength(1);
    // Straight along the edges; each corner is chamfered by a 0.5 x 0.5 triangle (area 1/8).
    expect(signedArea(loops[0])).toBeCloseTo(40 - 4 / 8, 10);
  });

  it('smoothing keeps the area (no Laplacian shrinkage) and specks are dropped', () => {
    const [loop] = marchingSquares(ringField(40, 40, 20, 20, 0, 12), 40, 40);
    const before = signedArea(loop);
    const after = signedArea(smoothLoop(loop, 6));
    expect(Math.abs(after - before) / before).toBeLessThan(0.01);
    expect(
      dropSmallLoops(
        [
          [
            [0, 0],
            [0.5, 0],
            [0, 0.5],
          ],
        ],
        1,
      ),
    ).toHaveLength(0);
  });
});

describe('fabrication exports', () => {
  const field = ringField(60, 30, 30, 15, 5, 12);
  const shapes = extractShapes(field, 60, 30);
  const size = { widthMm: 120, nelx: 60, nely: 30 };

  it('SVG is a mm-sized cut file with one closed path per shape', () => {
    const svg = shapesToSvg(shapes, size, { title: 'Ring', description: 'test' });
    expect(svg).toContain('width="120.00mm"');
    expect(svg).toContain('height="60.00mm"');
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg.match(/Z/g)?.length).toBe(2);
  });

  it('STL extrusion is watertight and has volume = area × thickness', () => {
    const mesh = extrudeShapes(shapes, size, 6);
    const v = mesh.triangles;
    const key = (k: number) => `${v[k].toFixed(4)},${v[k + 1].toFixed(4)},${v[k + 2].toFixed(4)}`;
    const edges = new Map<string, number>();
    let volume = 0;
    for (let f = 0; f < mesh.count; f++) {
      const k = f * 9;
      const p = [key(k), key(k + 3), key(k + 6)];
      for (let e = 0; e < 3; e++) {
        const a = p[e];
        const b = p[(e + 1) % 3];
        edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
      }
      // Divergence theorem: V = Σ (v0 · (v1 × v2)) / 6.
      const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = Array.from(v.subarray(k, k + 9));
      volume +=
        (x0 * (y1 * z2 - z1 * y2) - y0 * (x1 * z2 - z1 * x2) + z0 * (x1 * y2 - y1 * x2)) / 6;
    }
    // Every directed edge must be matched by exactly one reversed edge.
    for (const [e, count] of edges) {
      const [a, b] = e.split('|');
      expect(count).toBe(1);
      expect(edges.get(`${b}|${a}`)).toBe(1);
    }
    const s = size.widthMm / size.nelx;
    const expected = shapesArea(shapes) * s * s * 6;
    expect(Math.abs(volume - expected) / expected).toBeLessThan(0.02);
    const stl = meshToStl(mesh, 'strut');
    expect(stl.byteLength).toBe(84 + 50 * mesh.count);
    expect(new DataView(stl).getUint32(80, true)).toBe(mesh.count);
  });

  it('file names are descriptive and safe', () => {
    expect(fileStem('MBB beam', 144, 48, 0.5, 87)).toBe('strut-mbb-beam-144x48-vf50-it87');
    expect(fileStem('', 10, 5, 0.3, 1)).toBe('strut-custom-10x5-vf30-it1');
  });
});
