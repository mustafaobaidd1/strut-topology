import { EngineHost } from '../lib/engine/host';
import type { FromEngine, ToEngine } from '../lib/engine/protocol';

/**
 * Talks to the optimisation engine. Normally the engine runs in a module Web Worker (built by
 * Vite with a URL that respects the /strut-topology/ base path). If workers are unavailable or
 * the worker fails to start, the same engine runs on the main thread between frames.
 */
export class SolverClient {
  private worker: Worker | null = null;
  private host: EngineHost | null = null;
  private pending: ToEngine[] = [];
  private ready = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  /** True when the engine runs on the main thread. */
  fallback = false;

  constructor(
    private readonly onMessage: (msg: FromEngine) => void,
    private readonly onFallback: (reason: string) => void,
  ) {
    try {
      this.worker = new Worker(new URL('../worker/solver.worker.ts', import.meta.url), {
        type: 'module',
        name: 'strut-solver',
      });
      this.worker.onmessage = (e: MessageEvent<FromEngine>) => this.receive(e.data);
      this.worker.onerror = (e) => {
        e.preventDefault();
        this.toFallback('The background solver failed to start');
      };
      this.timeout = setTimeout(() => {
        if (!this.ready) this.toFallback('The background solver did not respond');
      }, 8000);
    } catch {
      queueMicrotask(() => this.toFallback('Background workers are not available'));
    }
  }

  private receive(msg: FromEngine): void {
    if (msg.type === 'ready') {
      this.ready = true;
      if (this.timeout) clearTimeout(this.timeout);
      for (const m of this.pending) this.post(m);
      this.pending = [];
    }
    this.onMessage(msg);
  }

  private toFallback(reason: string): void {
    if (this.fallback) return;
    this.fallback = true;
    if (this.timeout) clearTimeout(this.timeout);
    this.worker?.terminate();
    this.worker = null;
    this.host = new EngineHost(
      (msg) => this.onMessage(msg),
      (fn, ms) => setTimeout(fn, Math.max(ms, 4)),
    );
    this.ready = true;
    this.onFallback(reason);
    this.onMessage({ type: 'ready' });
    const queued = this.pending;
    this.pending = [];
    for (const m of queued) this.post(m);
  }

  post(msg: ToEngine): void {
    if (!this.ready) {
      // Keep only the latest problem/params message of each kind while starting.
      if (msg.type === 'problem' || msg.type === 'params' || msg.type === 'view') {
        this.pending = this.pending.filter((m) => m.type !== msg.type);
      }
      this.pending.push(msg);
      return;
    }
    if (this.worker) this.worker.postMessage(msg);
    else this.host?.receive(msg);
  }

  dispose(): void {
    this.worker?.terminate();
    if (this.timeout) clearTimeout(this.timeout);
  }
}
