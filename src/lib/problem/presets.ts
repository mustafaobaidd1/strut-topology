import type { Problem } from './model';

/**
 * Built-in problems. Parameters are suggestions applied when a preset is chosen; positions are
 * in domain units (height 1, width `problem.width`, y up).
 */
export interface Preset {
  id: PresetId;
  name: string;
  /** One line shown under the name. */
  blurb: string;
  problem: Problem;
  volfrac: number;
  /** Filter radius in element widths at 48 elements through the height. */
  rmin48: number;
  projection: boolean;
}

export type PresetId = 'bridge' | 'mbb' | 'cantilever' | 'lbracket' | 'michell';

export const PRESET_ORDER: PresetId[] = ['bridge', 'mbb', 'cantilever', 'lbracket', 'michell'];

export function makePreset(id: PresetId): Preset {
  switch (id) {
    case 'bridge':
      return {
        id,
        name: 'Bridge',
        blurb: 'Deck load across a span, pinned at both ends.',
        problem: {
          width: 3,
          symmetric: true,
          supports: [
            { id: 's1', shape: 'segment', kind: 'fixed', a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
            { id: 's2', shape: 'segment', kind: 'fixed', a: { x: 3, y: 0 }, b: { x: 3, y: 0 } },
          ],
          loads: [{ id: 'l1', at: { x: 1.5, y: 0.3 }, fx: 0, fy: -1, length: 3 }],
          regions: [],
        },
        volfrac: 0.25,
        rmin48: 1.8,
        projection: true,
      };
    case 'mbb':
      return {
        id,
        name: 'MBB beam',
        blurb: 'Half of a simply supported beam, the classic benchmark.',
        problem: {
          width: 3,
          symmetric: false,
          supports: [
            { id: 's1', shape: 'segment', kind: 'rollerY', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } },
            { id: 's2', shape: 'segment', kind: 'rollerX', a: { x: 3, y: 0 }, b: { x: 3, y: 0 } },
          ],
          loads: [{ id: 'l1', at: { x: 0, y: 1 }, fx: 0, fy: -1, length: 0 }],
          regions: [],
        },
        volfrac: 0.5,
        rmin48: 2.4,
        projection: false,
      };
    case 'cantilever':
      return {
        id,
        name: 'Cantilever',
        blurb: 'Clamped wall on the left, tip load on the right.',
        problem: {
          width: 2,
          symmetric: false,
          supports: [
            { id: 's1', shape: 'segment', kind: 'fixed', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } },
          ],
          loads: [{ id: 'l1', at: { x: 2, y: 0.5 }, fx: 0, fy: -1, length: 0 }],
          regions: [],
        },
        volfrac: 0.35,
        rmin48: 1.8,
        projection: true,
      };
    case 'lbracket':
      return {
        id,
        name: 'L-bracket',
        blurb: 'Hung from the top, loaded at the end of the arm.',
        problem: {
          width: 1,
          symmetric: false,
          supports: [
            { id: 's1', shape: 'segment', kind: 'fixed', a: { x: 0, y: 1 }, b: { x: 0.4, y: 1 } },
          ],
          loads: [{ id: 'l1', at: { x: 1, y: 0.38 }, fx: 0, fy: -1, length: 0 }],
          regions: [
            { id: 'r1', shape: 'rect', kind: 'void', a: { x: 0.4, y: 0.4 }, b: { x: 1, y: 1 } },
          ],
        },
        volfrac: 0.3,
        rmin48: 1.6,
        projection: true,
      };
    case 'michell':
      return {
        id,
        name: 'Michell cantilever',
        blurb: 'Bolted to a round pin, carrying a load at a distance.',
        problem: {
          width: 2,
          symmetric: false,
          supports: [
            { id: 's1', shape: 'disk', kind: 'fixed', centre: { x: 0.4, y: 0.5 }, radius: 0.12 },
          ],
          loads: [{ id: 'l1', at: { x: 1.85, y: 0.5 }, fx: 0, fy: -1, length: 0 }],
          regions: [
            { id: 'r1', shape: 'circle', kind: 'solid', centre: { x: 0.4, y: 0.5 }, radius: 0.12 },
          ],
        },
        volfrac: 0.16,
        rmin48: 1.5,
        projection: true,
      };
  }
}
