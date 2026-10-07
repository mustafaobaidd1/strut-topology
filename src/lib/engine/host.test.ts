import { describe, expect, it } from 'vitest';
import { makePreset } from '../problem/presets';
import { resolveProblem } from '../problem/resolve';
import { EngineHost } from './host';
import type { Frame, FromEngine } from './protocol';

/** Runs the host with a manual scheduler so tests are synchronous and deterministic. */
function harness() {
  const out: FromEngine[] = [];
  const queue: (() => void)[] = [];
  const host = new EngineHost(
    (m) => out.push(m),
    (fn) => queue.push(fn),
  );
  const frames = () =>
    out.filter((m) => m.type === 'frame').map((m) => (m as { frame: Frame }).frame);
  const pump = (n: number) => {
    for (let i = 0; i < n && queue.length; i++) queue.shift()!();
  };
  return { host, out, frames, pump, queue };
}

const bridge = (nely = 16) => resolveProblem(makePreset('bridge').problem, nely);

describe('engine host', () => {
  it('init posts an exact first frame and runs iterations on the schedule', () => {
    const h = harness();
    h.host.receive({
      type: 'init',
      problem: bridge(),
      params: { volfrac: 0.25, rmin: 1.5 },
      view: 'density',
      pacing: { minIntervalMs: 0, animate: true },
      run: true,
      session: 1,
    });
    const first = h.frames()[0];
    expect(first.exact).toBe(true);
    expect(first.density).not.toBeNull();
    expect(first.stats.runIteration).toBe(0);
    h.pump(20);
    const fs = h.frames();
    expect(fs.length).toBeGreaterThan(15);
    expect(fs[fs.length - 1].stats.compliance).toBeLessThan(fs[1].stats.compliance);
  });

  it('pause stops the loop; step does exactly one iteration; edits resume', () => {
    const h = harness();
    h.host.receive({
      type: 'init',
      problem: bridge(),
      params: { volfrac: 0.25 },
      view: 'density',
      pacing: { minIntervalMs: 0, animate: true },
      run: true,
      session: 1,
    });
    h.pump(3);
    h.host.receive({ type: 'pause' });
    const paused = h.frames().at(-1)!;
    expect(paused.state).toBe('paused');
    h.pump(10);
    expect(h.frames().at(-1)!.seq).toBe(paused.seq);
    h.host.receive({ type: 'step' });
    const stepped = h.frames().at(-1)!;
    expect(stepped.stats.runIteration).toBe(paused.stats.runIteration + 1);
    expect(stepped.state).toBe('paused');
    h.host.receive({ type: 'problem', problem: bridge(), resume: true });
    h.pump(2);
    expect(h.frames().at(-1)!.state).toBe('running');
  });

  it('computes stress, energy and displacement fields for the active view', () => {
    const h = harness();
    h.host.receive({
      type: 'init',
      problem: bridge(),
      params: {},
      view: 'stress',
      pacing: { minIntervalMs: 0, animate: true },
      run: false,
      session: 1,
    });
    const f = h.frames()[0];
    expect(f.field?.length).toBe(f.nelx * f.nely);
    expect(f.fieldMax).toBeGreaterThan(0);
    h.host.receive({ type: 'view', view: 'deformed' });
    const d = h.frames().at(-1)!;
    expect(d.field?.length).toBe(2 * (d.nelx + 1) * (d.nely + 1));
  });

  it('stops at the iteration limit', () => {
    const h = harness();
    h.host.receive({
      type: 'init',
      problem: bridge(),
      params: { maxIter: 5 },
      view: 'density',
      pacing: { minIntervalMs: 0, animate: false },
      run: true,
      session: 1,
    });
    h.pump(50);
    const last = h.frames().at(-1)!;
    expect(last.state).toBe('limit');
    expect(last.stopReason).toBe('limit');
    expect(last.density).not.toBeNull(); // the final design is always sent
  });

  it('reference mode prints the 88-line log and stops on its own rule', () => {
    const h = harness();
    h.host.receive({
      type: 'reference',
      ft: 1,
      pacing: { minIntervalMs: 0, animate: false },
      session: 2,
    });
    h.pump(400);
    const logs = h.out.filter((m) => m.type === 'log') as { line: string; final: boolean }[];
    expect(logs[0].line).toBe(' It.:    1 Obj.:  1007.0221 Vol.:  0.500 ch.:  0.200');
    expect(logs.at(-1)!.final).toBe(true);
    expect(logs.at(-1)!.line).toContain('Obj.:   216.81');
    expect(h.frames().at(-1)!.state).toBe('converged');
  }, 30_000);
});
