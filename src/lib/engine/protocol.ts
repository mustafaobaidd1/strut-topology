import type { GridProblem, OptimizerParams } from '../opt/optimizer';
import type { FilterType88 } from '../opt/top88';

/** Messages between the UI and the optimisation engine (which runs in a Web Worker). */

export type ViewKind = 'density' | 'stress' | 'deformed' | 'energy';

export type EngineState = 'idle' | 'running' | 'paused' | 'converged' | 'limit';

export interface Pacing {
  /** Minimum time between iterations (keeps the growth watchable). */
  minIntervalMs: number;
  /** Send densities with every frame (animated) or only when the run stops. */
  animate: boolean;
}

export type ToEngine =
  | {
      type: 'init';
      problem: GridProblem;
      params: Partial<OptimizerParams>;
      view: ViewKind;
      pacing: Pacing;
      run: boolean;
    }
  | { type: 'problem'; problem: GridProblem; resume: boolean }
  | { type: 'params'; params: Partial<OptimizerParams>; resume: boolean }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'reset'; run: boolean }
  | { type: 'view'; view: ViewKind }
  | { type: 'pacing'; pacing: Pacing }
  | { type: 'reference'; ft: FilterType88; pacing: Pacing }
  | { type: 'visibility'; hidden: boolean };

export interface FrameStats {
  iteration: number;
  runIteration: number;
  compliance: number;
  volume: number;
  change: number;
  beta: number;
  grayness: number;
  cgIterations: number;
  cgConverged: boolean;
  ms: number;
}

export interface Frame {
  seq: number;
  nelx: number;
  nely: number;
  /** Physical densities x̄ (element field), or null when unchanged / not animating. */
  density: Float32Array | null;
  view: ViewKind;
  /** Element field (stress, energy) or nodal displacements (deformed), for `view`. */
  field: Float32Array | null;
  /** Colour-scale maximum (stress, energy) or largest displacement (deformed). */
  fieldMax: number;
  stats: FrameStats;
  state: EngineState;
  /** Why the run stopped, when it did. */
  stopReason: 'change' | 'stall' | 'limit' | 'reference' | null;
  /** True when this frame carries the analysis of exactly the displayed design. */
  exact: boolean;
}

export type FromEngine =
  | { type: 'ready' }
  | { type: 'frame'; frame: Frame }
  | { type: 'log'; line: string; final: boolean }
  | { type: 'error'; message: string };
