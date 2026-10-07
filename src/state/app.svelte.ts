import type { EngineState, FrameStats, FromEngine, ViewKind } from '../lib/engine/protocol';
import { History } from '../lib/history';
import type { OptimizerParams } from '../lib/opt/optimizer';
import type { FilterType88 } from '../lib/opt/top88';
import {
  cloneProblem,
  newId,
  type Load,
  type Point,
  type Problem,
  type Region,
  type Support,
  type SupportKind,
} from '../lib/problem/model';
import { makePreset, type PresetId } from '../lib/problem/presets';
import { meshFor, resolveProblem } from '../lib/problem/resolve';
import { validateProblem, type Issue, type Warning } from '../lib/problem/validate';
import { meshWarning, SLOW_ITERATION_MS } from '../lib/meshBudget';
import { FrameStore } from './frames';
import { SolverClient } from './solverClient';

export type Tool = 'select' | 'load' | 'support' | 'void' | 'solid' | 'erase';
export type Layout = 'desktop' | 'tablet' | 'phone';

export interface UiParams {
  volfrac: number;
  penal: number;
  /** Filter radius in element widths at the current mesh. */
  rmin: number;
  /** Elements through the height. */
  nely: number;
  projection: boolean;
  betaMax: number;
  maxIter: number;
}

export const MESH_LEVELS: { nely: number; label: string }[] = [
  { nely: 32, label: 'Coarse' },
  { nely: 48, label: 'Medium' },
  { nely: 64, label: 'Fine' },
  { nely: 96, label: 'Very fine' },
  { nely: 128, label: 'Ultra' },
];

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

export interface SeriesPoint {
  it: number;
  c: number;
  change: number;
  edit: boolean;
}

/** The published values the reference mode compares against (Andreassen et al. 2011). */
export const REFERENCE_VALUES: Record<FilterType88, { label: string; rmin: number; c: number }> = {
  1: { label: 'Sensitivity filter (ft = 1)', rmin: 2.4, c: 216.81 },
  2: { label: 'Density filter (ft = 2)', rmin: 2.4, c: 233.71 },
  3: { label: 'Heaviside projection (ft = 3)', rmin: 1.8, c: 189.14 },
};

const HINT_KEY = 'strut.hint.drag-load';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* storage unavailable: the hint simply shows again next time */
  }
}

class AppState {
  problem = $state.raw<Problem>(makePreset('bridge').problem);
  presetId = $state<PresetId | 'custom' | 'reference'>('bridge');
  params = $state<UiParams>({
    volfrac: 0.2,
    penal: 3,
    rmin: 1.8,
    nely: 48,
    projection: true,
    betaMax: 32,
    maxIter: 300,
  });
  tool = $state<Tool>('select');
  supportKind = $state<SupportKind>('fixed');
  regionShape = $state<'brush' | 'box'>('brush');
  brushRadius = $state(0.05);
  selection = $state<string | null>(null);
  view = $state<ViewKind>('density');
  crisp = $state(true);

  engine = $state<EngineState | 'starting'>('starting');
  stats = $state.raw<FrameStats | null>(null);
  stopReason = $state<string | null>(null);
  series = $state.raw<SeriesPoint[]>([]);
  issue = $state.raw<Issue | null>(null);
  warnings = $state.raw<Warning[]>([]);
  engineError = $state<string | null>(null);
  workerNotice = $state<string | null>(null);
  rendererNotice = $state<string | null>(null);
  meshWarning = $state<string | null>(null);
  /** Colour-scale maximum of the active view, and the grid it belongs to. */
  fieldMax = $state(0);
  fieldGrid = $state<[number, number]>([0, 0]);

  referenceFt = $state<FilterType88 | null>(null);
  referenceLog = $state.raw<string[]>([]);
  referenceDone = $state(false);

  canUndo = $state(false);
  canRedo = $state(false);
  hintDragLoad = $state(!readFlag(HINT_KEY));
  reducedMotion = $state(false);
  layout = $state<Layout>('desktop');
  howOpen = $state(false);
  sheetOpen = $state(false);
  toasts = $state<Toast[]>([]);

  readonly frames = new FrameStore();
  private client: SolverClient | null = null;
  private history = new History<Problem>(this.problem);
  private sendQueued = false;
  private pendingEdit = false;
  private inEditBurst = false;
  private slowStreak = 0;
  private toastId = 0;
  /** Current run session: frames from older runs are dropped. */
  private session = 0;
  private beforeReference: {
    problem: Problem;
    presetId: PresetId | 'custom';
    params: UiParams;
  } | null = null;

  get presetName(): string {
    if (this.presetId === 'custom') return 'custom';
    if (this.presetId === 'reference') return 'mbb-88-reference';
    return makePreset(this.presetId).name;
  }

  get mesh() {
    return meshFor(this.problem.width, this.params.nely);
  }

  get editable(): boolean {
    return this.referenceFt === null;
  }

  // ---------------------------------------------------------------- engine wiring

  start(): void {
    if (this.client) return;
    this.client = new SolverClient(
      (msg) => this.onEngine(msg),
      (reason) => {
        this.workerNotice = `${reason}, so the solver runs on the main thread. It works, but the page may feel slower.`;
      },
    );
    this.initEngine(!this.reducedMotion);
  }

  private optimizerParams(): Partial<OptimizerParams> {
    const p = this.params;
    return {
      volfrac: p.volfrac,
      penal: p.penal,
      rmin: p.rmin,
      projection: p.projection,
      betaMax: p.betaMax,
      maxIter: p.maxIter,
      filter: 'density',
      solver: 'mgcg',
      ocMode: 'fast',
    };
  }

  private pacing() {
    return { minIntervalMs: this.reducedMotion ? 0 : 36, animate: !this.reducedMotion };
  }

  private initEngine(run: boolean): void {
    const v = this.revalidate();
    this.series = [];
    this.stopReason = null;
    if (!v) {
      this.engine = 'paused';
      return;
    }
    this.engine = this.engine === 'starting' ? 'starting' : this.engine;
    this.client?.post({
      type: 'init',
      problem: v,
      params: this.optimizerParams(),
      view: this.view,
      pacing: this.pacing(),
      run,
      session: ++this.session,
    });
  }

  private onEngine(msg: FromEngine): void {
    if (msg.type === 'ready') return;
    if (msg.type === 'error') {
      this.engineError = msg.message;
      this.engine = 'paused';
      return;
    }
    if (msg.type === 'log') {
      if (msg.session !== this.session) return;
      this.referenceLog = [...this.referenceLog, msg.line];
      if (msg.final) this.referenceDone = true;
      return;
    }
    const f = msg.frame;
    if (f.session !== this.session) return;
    this.engineError = null;
    this.frames.accept(f, performance.now());
    if (this.reducedMotion) this.frames.settle();
    this.stats = f.stats;
    if (f.field) {
      this.fieldMax = f.fieldMax;
      this.fieldGrid = [f.nelx, f.nely];
    }
    this.engine = f.state;
    this.stopReason = f.stopReason;
    const s = f.stats;
    if (s.runIteration > 0 && Number.isFinite(s.compliance)) {
      const last = this.series[this.series.length - 1];
      if (!last || s.iteration > last.it) {
        const point: SeriesPoint = {
          it: s.iteration,
          c: s.compliance,
          change: s.change,
          // One marker per burst of edits (a drag sends many), at its first iteration.
          edit: this.pendingEdit && !this.inEditBurst,
        };
        this.inEditBurst = this.pendingEdit;
        this.pendingEdit = false;
        const next = this.series.length >= 600 ? this.series.slice(-599) : this.series.slice();
        next.push(point);
        this.series = next;
      }
    }
    this.checkSpeed(s);
  }

  private checkSpeed(s: FrameStats): void {
    if (this.referenceFt !== null || s.runIteration === 0 || this.engine !== 'running') return;
    if (s.ms > SLOW_ITERATION_MS && this.params.nely >= 64) this.slowStreak++;
    else this.slowStreak = 0;
    if (this.slowStreak >= 3 && !this.meshWarning) {
      this.meshWarning = `This mesh is heavy for this device: about ${(s.ms / 1000).toFixed(1)} s per iteration.`;
    }
  }

  /** Resolves and validates the problem; returns the grid problem if it can be solved. */
  private revalidate() {
    const gp = resolveProblem(this.problem, this.params.nely);
    const v = validateProblem(gp, this.params.volfrac);
    this.issue = v.issue;
    this.warnings = v.warnings;
    return v.ok ? gp : null;
  }

  private queueSend(resume = true): void {
    if (this.sendQueued) return;
    this.sendQueued = true;
    const flush = () => {
      this.sendQueued = false;
      const gp = this.revalidate();
      if (!gp) {
        if (this.engine === 'running') this.client?.post({ type: 'pause' });
        return;
      }
      this.pendingEdit = true;
      this.client?.post({ type: 'problem', problem: gp, resume: resume && !this.reducedMotion });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else flush();
  }

  /** Recovery after a solver error: a fresh engine with the current setup. */
  restartEngine(): void {
    this.engineError = null;
    this.client?.restart();
    if (this.referenceFt !== null) this.enterReference(this.referenceFt);
    else this.initEngine(!this.reducedMotion);
  }

  // ---------------------------------------------------------------- presets & modes

  loadPreset(id: PresetId): void {
    if (this.referenceFt !== null) this.leaveReference(false);
    const pr = makePreset(id);
    this.presetId = id;
    this.setProblemCommit(pr.problem, false);
    this.params.volfrac = pr.volfrac;
    this.params.projection = pr.projection;
    this.params.rmin = round1(Math.max(1.5, (pr.rmin48 * this.params.nely) / 48));
    this.selection = null;
    this.client?.post({ type: 'params', params: this.optimizerParams(), resume: false });
    this.initEngine(!this.reducedMotion);
  }

  enterReference(ft: FilterType88): void {
    if (this.referenceFt === null) {
      this.beforeReference = {
        problem: this.problem,
        presetId: this.presetId === 'reference' ? 'custom' : this.presetId,
        params: { ...this.params },
      };
    }
    const mbb = makePreset('mbb').problem;
    this.referenceFt = ft;
    this.referenceLog = [];
    this.referenceDone = false;
    this.presetId = 'reference';
    this.problem = mbb;
    this.params.nely = 20;
    this.params.volfrac = 0.5;
    this.params.penal = 3;
    this.params.rmin = REFERENCE_VALUES[ft].rmin;
    this.params.projection = ft === 3;
    this.selection = null;
    this.tool = 'select';
    this.series = [];
    this.stopReason = null;
    this.issue = null;
    this.client?.post({ type: 'reference', ft, pacing: this.pacing(), session: ++this.session });
  }

  leaveReference(restart = true): void {
    if (this.referenceFt === null) return;
    this.referenceFt = null;
    const prev = this.beforeReference;
    this.beforeReference = null;
    if (prev) {
      this.problem = prev.problem;
      this.presetId = prev.presetId;
      Object.assign(this.params, prev.params);
    }
    this.history = new History<Problem>(this.problem);
    this.syncHistory();
    if (restart) this.initEngine(!this.reducedMotion);
  }

  // ---------------------------------------------------------------- editing

  private syncHistory(): void {
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
  }

  private setProblemCommit(next: Problem, send = true): void {
    this.problem = next;
    this.history.push(next);
    this.syncHistory();
    if (send) this.queueSend();
  }

  /** Applies an edit and records it as one undo step. */
  commit(next: Problem): void {
    if (!this.editable) return;
    if (this.presetId !== 'custom') this.presetId = 'custom';
    this.setProblemCommit(next);
  }

  /** Live update during a drag (no undo step until `endEdit`). */
  liveEdit(next: Problem): void {
    if (!this.editable) return;
    this.problem = next;
    this.history.replace(next);
    this.queueSend();
  }

  endEdit(start: Problem): void {
    if (start === this.problem) return;
    if (this.presetId !== 'custom') this.presetId = 'custom';
    this.history.pushFrom(start, this.problem);
    this.syncHistory();
  }

  undo(): void {
    if (!this.editable) return;
    const p = this.history.undo();
    if (!p) return;
    this.problem = p;
    this.presetId = 'custom';
    this.selection = null;
    this.syncHistory();
    this.queueSend();
  }

  redo(): void {
    if (!this.editable) return;
    const p = this.history.redo();
    if (!p) return;
    this.problem = p;
    this.presetId = 'custom';
    this.selection = null;
    this.syncHistory();
    this.queueSend();
  }

  addLoad(at: Point, length = 0): string {
    const p = cloneProblem(this.problem);
    const l: Load = { id: newId('l'), at, fx: 0, fy: -1, length };
    p.loads.push(l);
    this.commit(p);
    this.selection = l.id;
    return l.id;
  }

  addSupport(a: Point, b: Point): string {
    const p = cloneProblem(this.problem);
    const s: Support = { id: newId('s'), shape: 'segment', kind: this.supportKind, a, b };
    p.supports.push(s);
    this.commit(p);
    this.selection = s.id;
    return s.id;
  }

  addRegion(r: Region): void {
    const p = cloneProblem(this.problem);
    p.regions.push(r);
    this.commit(p);
  }

  deleteEntity(id: string): void {
    const p = cloneProblem(this.problem);
    const before = p.loads.length + p.supports.length + p.regions.length;
    p.loads = p.loads.filter((l) => l.id !== id);
    p.supports = p.supports.filter((s) => s.id !== id);
    p.regions = p.regions.filter((r) => r.id !== id);
    if (p.loads.length + p.supports.length + p.regions.length === before) return;
    if (this.selection === id) this.selection = null;
    this.commit(p);
  }

  setSymmetric(on: boolean): void {
    const p = cloneProblem(this.problem);
    p.symmetric = on;
    this.commit(p);
  }

  dismissDragHint(): void {
    if (!this.hintDragLoad) return;
    this.hintDragLoad = false;
    writeFlag(HINT_KEY);
  }

  // ---------------------------------------------------------------- parameters

  setParam<K extends keyof UiParams>(key: K, value: UiParams[K]): void {
    if (!this.editable) return;
    this.params[key] = value;
    if (key === 'volfrac') {
      // A larger budget can make an infeasible setup solvable again.
      const wasBlocked = this.issue !== null;
      const gp = this.revalidate();
      if (!gp) return;
      if (wasBlocked) {
        this.queueSend();
        return;
      }
    }
    this.client?.post({
      type: 'params',
      params: this.optimizerParams(),
      resume: !this.reducedMotion,
    });
  }

  setMesh(nely: number): void {
    if (!this.editable || nely === this.params.nely) return;
    const before = meshFor(this.problem.width, this.params.nely);
    const after = meshFor(this.problem.width, nely);
    // Keep the filter radius at the same physical size.
    this.params.rmin = round1(
      Math.max(1.2, Math.min(8, (this.params.rmin * nely) / this.params.nely)),
    );
    this.params.nely = nely;
    this.slowStreak = 0;
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    // Predicted from the iteration time measured on the current mesh.
    this.meshWarning = meshWarning(
      this.stats?.ms ?? NaN,
      before.nelx * before.nely,
      after.nelx * after.nely,
      cores,
    );
    this.client?.post({ type: 'params', params: this.optimizerParams(), resume: false });
    this.queueSend();
  }

  // ---------------------------------------------------------------- run controls

  run(): void {
    if (this.issue) return;
    this.client?.post({ type: 'run' });
  }

  pause(): void {
    this.client?.post({ type: 'pause' });
  }

  step(): void {
    if (this.issue) return;
    this.client?.post({ type: 'step' });
  }

  reset(): void {
    if (this.referenceFt !== null) {
      this.referenceLog = [];
      this.referenceDone = false;
      this.series = [];
      this.client?.post({ type: 'reset', run: true, session: ++this.session });
      return;
    }
    this.series = [];
    this.stopReason = null;
    this.client?.post({
      type: 'reset',
      run: !this.reducedMotion && !this.issue,
      session: ++this.session,
    });
  }

  setView(v: ViewKind): void {
    this.view = v;
    this.client?.post({ type: 'view', view: v });
  }

  setHidden(hidden: boolean): void {
    this.client?.post({ type: 'visibility', hidden });
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    this.client?.post({ type: 'pacing', pacing: this.pacing() });
  }

  // ---------------------------------------------------------------- toasts

  toast(kind: Toast['kind'], text: string): void {
    const id = ++this.toastId;
    this.toasts = [...this.toasts, { id, kind, text }];
    setTimeout(() => this.dismissToast(id), kind === 'error' ? 6000 : 4200);
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export const app = new AppState();
