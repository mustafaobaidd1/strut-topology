/** Maps domain units (width W, height 1, y up) to CSS pixels: (ox + x·s, oy − y·s). */
export interface Transform {
  ox: number;
  oy: number;
  s: number;
}

export type DrawMode = 'density' | 'field' | 'deformed';

export interface FieldRenderer {
  readonly kind: 'webgl2' | 'canvas2d';
  readonly canvas: HTMLCanvasElement;
  resize(cssW: number, cssH: number, dpr: number): void;
  /** Element densities (column-wise, rows from the top), in [0, 1]. */
  setDensity(nelx: number, nely: number, rho: Float32Array): void;
  /** Element field normalised by `max` (stress, energy), or null. */
  setField(field: Float32Array | null, max: number): void;
  /** Nodal displacements (element widths) and the exaggeration factor, or null. */
  setDisplacement(u: Float32Array | null, scale: number): void;
  /** `crisp` in [0, 1] blends raw densities into an anti-aliased 0.5 iso-line. */
  draw(t: Transform, mode: DrawMode, crisp: number): void;
  dispose(): void;
}

export const PAPER: [number, number, number] = [0xf2, 0xf1, 0xed];
export const INK: [number, number, number] = [0x15, 0x15, 0x15];
