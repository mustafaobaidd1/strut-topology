import { describe, expect, it } from 'vitest';
import { Optimizer } from '../opt/optimizer';
import type { Problem } from './model';
import { makePreset, PRESET_ORDER } from './presets';
import {
  deckElements,
  loadNodes,
  meshFor,
  passiveMask,
  resolveProblem,
  supportNodes,
} from './resolve';
import { rigidBodyRank, validateProblem } from './validate';

const base = (): Problem => ({
  width: 2,
  symmetric: false,
  supports: [{ id: 's', shape: 'segment', kind: 'fixed', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }],
  loads: [{ id: 'l', at: { x: 2, y: 0.5 }, fx: 0, fy: -1, length: 0 }],
  regions: [],
});

describe('meshing a problem', () => {
  it('maps the domain onto nelx = width · nely elements', () => {
    const m = meshFor(3, 48);
    expect([m.nelx, m.nely]).toEqual([144, 48]);
  });

  it('a wall support fixes every node along the edge in both directions', () => {
    const g = resolveProblem(base(), 8);
    let count = 0;
    for (const f of g.fixed) count += f;
    expect(count).toBe(2 * 9);
    for (let j = 0; j <= 8; j++) expect(g.fixed[2 * j] && g.fixed[2 * j + 1]).toBe(1);
  });

  it('rollers hold only the direction they do not roll in', () => {
    const p = base();
    p.supports = [
      { id: 'a', shape: 'segment', kind: 'rollerX', a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
      { id: 'b', shape: 'segment', kind: 'rollerY', a: { x: 2, y: 0 }, b: { x: 2, y: 0 } },
    ];
    const g = resolveProblem(p, 4);
    const bl = 4; // node (0, 4)
    const br = 8 * 5 + 4; // node (8, 4)
    expect([g.fixed[2 * bl], g.fixed[2 * bl + 1]]).toEqual([0, 1]);
    expect([g.fixed[2 * br], g.fixed[2 * br + 1]]).toEqual([1, 0]);
  });

  it('a line load is split into consistent nodal forces that sum to the total', () => {
    const mesh = meshFor(3, 10);
    const nodes = loadNodes(mesh, { id: 'l', at: { x: 1.5, y: 0.3 }, fx: 0.2, fy: -1, length: 3 });
    expect(nodes).toHaveLength(31);
    expect(nodes.reduce((s, n) => s + n.w, 0)).toBeCloseTo(1, 14);
    expect(nodes[0].w).toBeCloseTo(nodes[1].w / 2, 14);
    expect(
      deckElements(mesh, { id: 'l', at: { x: 1.5, y: 0.3 }, fx: 0, fy: -1, length: 3 }),
    ).toHaveLength(60);
  });

  it('disk supports collect the nodes inside the circle', () => {
    const mesh = meshFor(2, 20);
    const n = supportNodes(mesh, {
      id: 'd',
      shape: 'disk',
      kind: 'fixed',
      centre: { x: 0.5, y: 0.5 },
      radius: 0.1,
    });
    // Nodes at spacing 0.05 within radius 0.1: 13 lattice points.
    expect(n).toHaveLength(13);
  });

  it('passive regions apply in order and are mirrored when symmetry is on', () => {
    const p = base();
    p.regions = [
      { id: 'r1', shape: 'rect', kind: 'void', a: { x: 0, y: 0 }, b: { x: 0.5, y: 1 } },
      { id: 'r2', shape: 'circle', kind: 'clear', centre: { x: 0.25, y: 0.5 }, radius: 0.1 },
    ];
    const mesh = meshFor(2, 10);
    const mask = passiveMask(p, mesh);
    expect(mask[0]).toBe(-1); // left column is void
    expect(mask[2 * 10 + 5]).toBe(0); // cleared by the circle
    expect(mask[19 * 10 + 0]).toBe(0); // right side untouched
    p.symmetric = true;
    const sym = passiveMask(p, mesh);
    expect(sym[19 * 10 + 0]).toBe(-1); // mirrored void
  });
});

describe('ill-posed setups are detected', () => {
  it('no supports: the structure can fly away', () => {
    const p = base();
    p.supports = [];
    const v = validateProblem(resolveProblem(p, 8), 0.4);
    expect(v.issue?.code).toBe('no-supports');
    expect(v.issue?.title).toBe('The structure can fly away — add at least one fixed support');
  });

  it('a single pin leaves a rotation free; rollers in one direction leave a slide free', () => {
    const p = base();
    p.supports = [
      { id: 'a', shape: 'segment', kind: 'fixed', a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
    ];
    const g = resolveProblem(p, 8);
    expect(rigidBodyRank(g)).toBe(2);
    expect(validateProblem(g, 0.4).issue?.code).toBe('mechanism');
    p.supports = [
      { id: 'a', shape: 'segment', kind: 'rollerX', a: { x: 0, y: 0 }, b: { x: 2, y: 0 } },
    ];
    expect(rigidBodyRank(resolveProblem(p, 8))).toBe(2);
    p.supports.push({
      id: 'b',
      shape: 'segment',
      kind: 'rollerY',
      a: { x: 1, y: 1 },
      b: { x: 1, y: 1 },
    });
    expect(rigidBodyRank(resolveProblem(p, 8))).toBe(3);
  });

  it('no loads: nothing to resist', () => {
    const p = base();
    p.loads = [];
    expect(validateProblem(resolveProblem(p, 8), 0.4).issue?.title).toBe(
      'Nothing to resist — add a load',
    );
    p.loads = [{ id: 'l', at: { x: 0, y: 0.5 }, fx: 0, fy: -1, length: 0 }];
    expect(validateProblem(resolveProblem(p, 8), 0.4).issue?.code).toBe('loads-on-supports');
  });

  it('solid regions larger than the material budget are rejected', () => {
    const p = base();
    p.regions = [{ id: 'r', shape: 'rect', kind: 'solid', a: { x: 0, y: 0 }, b: { x: 1.2, y: 1 } }];
    expect(validateProblem(resolveProblem(p, 8), 0.4).issue?.code).toBe('too-much-solid');
  });

  it('warns when a load sits inside a void region', () => {
    const p = base();
    p.loads[0].at = { x: 1.5, y: 0.5 };
    p.regions = [
      { id: 'r', shape: 'circle', kind: 'void', centre: { x: 1.5, y: 0.5 }, radius: 0.2 },
    ];
    const v = validateProblem(resolveProblem(p, 16), 0.4);
    expect(v.ok).toBe(true);
    expect(v.warnings.map((w) => w.code)).toContain('load-in-void');
  });
});

describe('presets', () => {
  for (const id of PRESET_ORDER) {
    it(`${id} is well posed and its first iterations lower the compliance`, () => {
      const pr = makePreset(id);
      const g = resolveProblem(pr.problem, 24);
      expect(validateProblem(g, pr.volfrac).ok).toBe(true);
      const opt = new Optimizer(g, { volfrac: pr.volfrac, rmin: (pr.rmin48 * 24) / 48 });
      const first = opt.step();
      let last = first;
      for (let k = 0; k < 15; k++) last = opt.step();
      expect(last.compliance).toBeLessThan(first.compliance);
    });
  }
});
