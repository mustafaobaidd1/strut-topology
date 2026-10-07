import { maxDisplacement, robustMax, strainEnergyDensity, vonMises } from '../fem/post';
import { Optimizer, type IterationResult } from '../opt/optimizer';
import { Top88 } from '../opt/top88';
import type {
  EngineState,
  Frame,
  FrameStats,
  FromEngine,
  Pacing,
  ToEngine,
  ViewKind,
} from './protocol';

type Post = (msg: FromEngine, transfer: Transferable[]) => void;
type Schedule = (fn: () => void, ms: number) => unknown;

/**
 * Drives the optimiser one iteration at a time on a timer, so that messages (edits, pause,
 * view changes) are handled between iterations. The same class runs inside the Web Worker and,
 * as a fallback, on the main thread.
 */
export class EngineHost {
  private opt: Optimizer | null = null;
  private ref: Top88 | null = null;
  private state: EngineState = 'idle';
  private view: ViewKind = 'density';
  private pacing: Pacing = { minIntervalMs: 0, animate: true };
  private timer = false;
  private hidden = false;
  private seq = 0;
  private lastMs = 0;
  private maxIter = 300;
  private session = 0;
  /** Statistics of the last iteration, reused by frames that are not iterations. */
  private lastStats: FrameStats | null = null;

  constructor(
    private readonly post: Post,
    private readonly schedule: Schedule,
  ) {}

  receive(msg: ToEngine): void {
    try {
      this.handle(msg);
    } catch (err) {
      this.state = 'paused';
      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) }, []);
    }
  }

  private handle(msg: ToEngine): void {
    switch (msg.type) {
      case 'init': {
        this.session = msg.session;
        this.lastStats = null;
        this.ref = null;
        this.opt = new Optimizer(msg.problem, msg.params);
        this.maxIter = this.opt.params.maxIter;
        this.view = msg.view;
        this.pacing = msg.pacing;
        this.state = msg.run ? 'running' : 'idle';
        this.sendExact(null);
        this.kick();
        break;
      }
      case 'problem': {
        if (!this.opt) return;
        this.opt.setProblem(msg.problem);
        this.afterEdit(msg.resume);
        break;
      }
      case 'params': {
        if (!this.opt) return;
        this.opt.setParams(msg.params);
        this.maxIter = this.opt.params.maxIter;
        this.afterEdit(msg.resume);
        break;
      }
      case 'run':
        if (this.state === 'running') return;
        if (this.ref && this.ref.finished) return;
        if (this.opt && (this.state === 'converged' || this.state === 'limit')) {
          this.opt.runIteration = 0; // a fresh iteration budget
        }
        this.state = 'running';
        this.kick();
        break;
      case 'pause':
        if (this.state !== 'running') return;
        this.state = 'paused';
        this.sendExact(null);
        break;
      case 'step':
        if (this.state === 'running') return;
        this.iterate(true);
        break;
      case 'reset': {
        this.session = msg.session;
        this.lastStats = null;
        if (this.ref) {
          const r = this.ref;
          this.ref = new Top88(r.nelx, r.nely, r.volfrac, r.penal, r.rmin, r.ft);
        } else if (this.opt) {
          this.opt.reset();
        }
        this.state = msg.run ? 'running' : 'idle';
        this.sendExact(null);
        this.kick();
        break;
      }
      case 'view':
        this.view = msg.view;
        if (this.state !== 'running') {
          // The last analysis already belongs to the displayed design: only the field changes.
          const stats = this.lastStats ?? this.currentStats();
          if (stats) this.sendFrame(stats, false, null, true);
        }
        break;
      case 'pacing':
        this.pacing = msg.pacing;
        break;
      case 'reference': {
        this.session = msg.session;
        this.lastStats = null;
        this.opt = null;
        const rmin = msg.ft === 3 ? 1.8 : 2.4; // 0.04·nelx, or 0.03·nelx for the Heaviside variant
        this.ref = new Top88(60, 20, 0.5, 3, rmin, msg.ft);
        this.pacing = msg.pacing;
        this.state = 'running';
        this.sendExact(null);
        this.kick();
        break;
      }
      case 'visibility':
        this.hidden = msg.hidden;
        this.kick();
        break;
    }
  }

  /** After an edit: keep going (or start again) so the design follows the change. */
  private afterEdit(resume: boolean): void {
    if (resume || this.state === 'running') {
      this.state = 'running';
      this.kick();
    } else {
      if (this.state === 'converged' || this.state === 'limit') this.state = 'paused';
      this.sendExact(null);
    }
  }

  private kick(): void {
    if (this.timer || this.state !== 'running' || this.hidden) return;
    this.timer = true;
    const delay = Math.max(0, this.pacing.minIntervalMs - this.lastMs);
    this.schedule(() => {
      this.timer = false;
      if (this.state !== 'running' || this.hidden) return;
      this.iterate(false);
      this.kick();
    }, delay);
  }

  private iterate(single: boolean): void {
    if (this.ref) {
      this.iterateReference(single);
      return;
    }
    const opt = this.opt;
    if (!opt) return;
    const r = opt.step();
    this.lastMs = r.ms;
    let stop: Frame['stopReason'] = null;
    if (r.converged) stop = r.convergedBy;
    else if (opt.runIteration >= this.maxIter) stop = 'limit';
    if (stop) this.state = stop === 'limit' ? 'limit' : 'converged';
    else if (single) this.state = 'paused';
    if (stop || single) {
      this.sendExact(stop, true, r);
    } else {
      this.lastStats = this.statsOf(r);
      this.sendFrame(this.lastStats, this.pacing.animate, null, false);
    }
  }

  private iterateReference(single: boolean): void {
    const ref = this.ref as Top88;
    if (ref.finished) return;
    const t0 = performance.now();
    const line = ref.step();
    this.lastMs = performance.now() - t0;
    const done = ref.finished;
    this.post({ type: 'log', line: Top88.format(line), final: done, session: this.session }, []);
    if (done) this.state = 'converged';
    else if (single) this.state = 'paused';
    const stats: FrameStats = {
      iteration: line.loop,
      runIteration: line.loop,
      compliance: line.c,
      volume: line.vol,
      change: line.change,
      beta: line.beta,
      grayness: grayness(ref.xPhys),
      cgIterations: 1,
      cgConverged: true,
      ms: this.lastMs,
    };
    this.lastStats = stats;
    this.sendFrame(stats, this.pacing.animate || done || single, done ? 'reference' : null, false);
  }

  /** Re-analyses the displayed design so its compliance and views are exact, then posts. */
  private sendExact(stop: Frame['stopReason'], withDensity = true, last?: IterationResult): void {
    if (this.ref) {
      const ref = this.ref;
      const stats: FrameStats = {
        iteration: ref.loop,
        runIteration: ref.loop,
        compliance: NaN,
        volume: mean(ref.xPhys),
        change: ref.change,
        beta: ref.beta,
        grayness: grayness(ref.xPhys),
        cgIterations: 0,
        cgConverged: true,
        ms: 0,
      };
      this.sendFrame(stats, withDensity, stop, false);
      return;
    }
    const opt = this.opt;
    if (!opt) return;
    const a = opt.analyse();
    const prev = last ? this.statsOf(last) : this.lastStats;
    const stats: FrameStats = {
      iteration: opt.iteration,
      runIteration: opt.runIteration,
      compliance: a.compliance,
      volume: opt.volume,
      change: prev?.change ?? NaN,
      beta: opt.beta,
      grayness: grayness(opt.xPhys),
      cgIterations: prev?.cgIterations ?? a.solve.iterations,
      cgConverged: a.solve.converged,
      ms: prev?.ms ?? 0,
    };
    this.lastStats = stats;
    this.sendFrame(stats, withDensity, stop, true);
  }

  private currentStats(): FrameStats | null {
    const src = this.ref ?? this.opt;
    if (!src) return null;
    return {
      iteration: this.ref ? this.ref.loop : (this.opt as Optimizer).iteration,
      runIteration: this.ref ? this.ref.loop : (this.opt as Optimizer).runIteration,
      compliance: NaN,
      volume: mean(src.xPhys),
      change: NaN,
      beta: this.ref ? this.ref.beta : (this.opt as Optimizer).beta,
      grayness: grayness(src.xPhys),
      cgIterations: 0,
      cgConverged: true,
      ms: 0,
    };
  }

  private statsOf(r: IterationResult): FrameStats {
    return {
      iteration: r.iteration,
      runIteration: r.runIteration,
      compliance: r.compliance,
      volume: r.volume,
      change: r.change,
      beta: r.beta,
      grayness: r.grayness,
      cgIterations: r.solve.iterations,
      cgConverged: r.solve.converged,
      ms: r.ms,
    };
  }

  private sendFrame(
    stats: FrameStats,
    withDensity: boolean,
    stop: Frame['stopReason'],
    exact: boolean,
  ): void {
    const src = this.ref ?? this.opt;
    if (!src) return;
    const grid = src.grid;
    const xPhys = src.xPhys;
    const density = withDensity ? Float32Array.from(xPhys) : null;
    let field: Float32Array | null = null;
    let fieldMax = 0;
    const Ee = this.ref ? this.ref.Ee : (this.opt as Optimizer).Ee;
    const u = this.ref ? this.ref.U : (this.opt as Optimizer).u;
    const ce = this.ref ? this.ref.ce : (this.opt as Optimizer).ce;
    const analysed = stats.runIteration > 0 || exact;
    if (analysed && (withDensity || exact)) {
      if (this.view === 'stress') {
        field = new Float32Array(grid.nEl);
        vonMises(grid, Ee, u, field);
        fieldMax = robustMax(field, xPhys);
      } else if (this.view === 'energy') {
        field = new Float32Array(grid.nEl);
        strainEnergyDensity(Ee, ce, field);
        fieldMax = robustMax(field, xPhys);
      } else if (this.view === 'deformed') {
        field = Float32Array.from(u);
        fieldMax = maxDisplacement(u);
      }
    }
    const frame: Frame = {
      seq: ++this.seq,
      session: this.session,
      nelx: grid.nelx,
      nely: grid.nely,
      density,
      view: this.view,
      field,
      fieldMax,
      stats,
      state: this.state,
      stopReason: stop,
      exact,
    };
    const transfer: Transferable[] = [];
    if (density) transfer.push(density.buffer);
    if (field) transfer.push(field.buffer);
    this.post({ type: 'frame', frame }, transfer);
  }
}

function mean(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return v.length ? s / v.length : 0;
}

function grayness(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += 4 * v[i] * (1 - v[i]);
  return v.length ? (100 * s) / v.length : 0;
}
