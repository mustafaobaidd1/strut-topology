import type { Frame, ViewKind } from '../lib/engine/protocol';

/**
 * Latest design data from the engine, outside Svelte's reactivity (large typed arrays). The
 * viewport subscribes and interpolates between the previous and current densities.
 */
export class FrameStore {
  nelx = 0;
  nely = 0;
  prev: Float32Array | null = null;
  current: Float32Array | null = null;
  arrivedAt = 0;
  /** Expected time between frames (ms), for interpolation. */
  interval = 60;
  field: Float32Array | null = null;
  fieldMax = 0;
  fieldView: ViewKind = 'density';
  iteration = 0;
  private listeners = new Set<() => void>();

  accept(frame: Frame, now: number): void {
    if (frame.density) {
      const sameGrid = frame.nelx === this.nelx && frame.nely === this.nely && this.current;
      this.prev = sameGrid ? this.displayed(now) : frame.density;
      this.current = frame.density;
      const dt = now - this.arrivedAt;
      this.interval = Math.min(400, Math.max(30, 0.6 * this.interval + 0.4 * dt));
      this.arrivedAt = now;
      this.nelx = frame.nelx;
      this.nely = frame.nely;
      this.iteration = frame.stats.iteration;
    }
    if (frame.field && frame.view !== 'density') {
      this.field = frame.field;
      this.fieldMax = frame.fieldMax;
      this.fieldView = frame.view;
    } else if (frame.view === 'density') {
      this.field = null;
    }
    for (const l of this.listeners) l();
  }

  /** Interpolation weight between prev and current at time `now` (1 = settled). */
  progress(now: number): number {
    return Math.min(1, Math.max(0, (now - this.arrivedAt) / this.interval));
  }

  /** The density currently on screen (interpolated). */
  displayed(now: number): Float32Array | null {
    const { prev, current } = this;
    if (!current) return null;
    const t = this.progress(now);
    if (!prev || prev.length !== current.length || t >= 1) return current;
    const out = new Float32Array(current.length);
    for (let i = 0; i < out.length; i++) out[i] = prev[i] + (current[i] - prev[i]) * t;
    return out;
  }

  /** Skips any running interpolation (reduced motion). */
  settle(): void {
    this.prev = this.current;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
