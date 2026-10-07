<script lang="ts">
  import { app } from '../state/app.svelte';
  import { fmt } from './format';

  let { height = 168 }: { height?: number } = $props();
  let width = $state(280);

  const pad = { l: 40, r: 10, t: 10, b: 18 };
  const gap = 14;

  const data = $derived(app.series);

  const geom = $derived.by(() => {
    const pts = data;
    if (pts.length < 1) return null;
    const w = Math.max(60, width - pad.l - pad.r);
    const inner = height - pad.t - pad.b - gap;
    const hTop = inner * 0.68;
    const hBot = inner - hTop;
    const yBot0 = pad.t + hTop + gap;
    const it0 = pts[0].it;
    const it1 = Math.max(pts[pts.length - 1].it, it0 + 10);
    const cs = pts.map((p) => p.c).filter((c) => c > 0 && Number.isFinite(c));
    if (!cs.length) return null;
    let lo = Math.log10(Math.min(...cs));
    let hi = Math.log10(Math.max(...cs));
    if (hi - lo < 0.06) {
      lo -= 0.03;
      hi += 0.03;
    }
    const x = (it: number) => pad.l + ((it - it0) / (it1 - it0)) * w;
    const y = (c: number) => pad.t + (1 - (Math.log10(c) - lo) / (hi - lo)) * hTop;
    const path = (sel: (p: (typeof pts)[number]) => number | null) => {
      let d = '';
      let pen = false;
      for (const p of pts) {
        const v = sel(p);
        if (v === null || !Number.isFinite(v)) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${x(p.it).toFixed(1)} ${v.toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    const line = path((p) => (p.c > 0 ? y(p.c) : null));
    // Design change on a log axis from 0.002 to 0.3.
    const cLo = Math.log10(0.002);
    const cHi = Math.log10(0.3);
    const yc = (v: number) =>
      yBot0 + (1 - (Math.log10(Math.max(0.002, Math.min(0.3, v))) - cLo) / (cHi - cLo)) * hBot;
    const change = path((p) => (Number.isFinite(p.change) ? yc(p.change) : null));
    const ticks: number[] = [];
    const span = hi - lo;
    const step = span > 1.5 ? 1 : span > 0.5 ? 0.5 : span > 0.2 ? 0.1 : 0.05;
    for (let e = Math.ceil(lo / step) * step; e <= hi + 1e-9; e += step) ticks.push(10 ** e);
    const shown =
      ticks.length > 4 ? ticks.filter((_, i) => i % Math.ceil(ticks.length / 4) === 0) : ticks;
    const last = pts[pts.length - 1];
    return {
      line,
      change,
      ticks: shown.map((v) => ({ v, y: y(v) })),
      edits: pts.filter((p) => p.edit).map((p) => x(p.it)),
      it0,
      it1,
      yBot0,
      hBot,
      tol: yc(0.01),
      lastX: x(last.it),
      lastY: last.c > 0 ? y(last.c) : pad.t,
    };
  });

  const summary = $derived.by(() => {
    if (data.length < 2) return 'No iterations yet.';
    const first = data[0];
    const last = data[data.length - 1];
    return `Compliance went from ${fmt(first.c, 4)} at iteration ${first.it} to ${fmt(last.c, 4)} at iteration ${last.it}.`;
  });
</script>

<figure class="chart" bind:clientWidth={width}>
  <figcaption>
    <span class="caps">Compliance</span>
    <span class="key"><i class="sw ink"></i>log scale <i class="sw blue"></i>design change</span>
  </figcaption>
  <svg {width} {height} role="img" aria-label="Convergence history. {summary}" data-testid="chart">
    {#if geom}
      {#each geom.ticks as tk (tk.v)}
        <line x1={pad.l} x2={width - pad.r} y1={tk.y} y2={tk.y} class="grid" />
        <text x={pad.l - 5} y={tk.y + 3.5} class="tick" text-anchor="end">{fmt(tk.v, 2)}</text>
      {/each}
      {#each geom.edits as ex, i (i)}
        <line x1={ex} x2={ex} y1={pad.t} y2={geom.yBot0 + geom.hBot} class="edit" />
      {/each}
      <path d={geom.line} class="c-line" />
      <circle cx={geom.lastX} cy={geom.lastY} r="3" class="c-dot" />
      <rect
        x={pad.l}
        y={geom.yBot0}
        width={width - pad.l - pad.r}
        height={geom.hBot}
        class="strip"
      />
      <line x1={pad.l} x2={width - pad.r} y1={geom.tol} y2={geom.tol} class="tol" />
      <text x={pad.l - 5} y={geom.tol + 3.5} class="tick" text-anchor="end">0.01</text>
      <path d={geom.change} class="ch-line" />
      <text x={pad.l} y={height - 4} class="tick">it {geom.it0}</text>
      <text x={width - pad.r} y={height - 4} class="tick" text-anchor="end">{geom.it1}</text>
    {:else}
      <text x={width / 2} y={height / 2} class="empty" text-anchor="middle">
        Compliance appears here as the optimiser runs
      </text>
    {/if}
  </svg>
</figure>

<style>
  .chart {
    margin: 0;
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  figcaption {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--ink-3);
  }
  .sw {
    display: inline-block;
    width: 12px;
    height: 2px;
    margin-left: 4px;
  }
  .sw.ink {
    background: var(--ink);
  }
  .sw.blue {
    background: var(--support);
  }
  svg {
    display: block;
    background: var(--paper-raised);
    border: 1px solid var(--hair);
    border-radius: var(--r-sm);
  }
  .grid {
    stroke: rgba(21, 21, 21, 0.08);
  }
  .tick {
    font-family: var(--font-mono);
    font-size: 10px;
    fill: var(--ink-3);
  }
  .edit {
    stroke: var(--load);
    stroke-dasharray: 2 2;
  }
  .c-line {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.6;
    stroke-linejoin: round;
  }
  .c-dot {
    fill: var(--load);
    stroke: var(--load-edge);
  }
  .strip {
    fill: rgba(39, 71, 255, 0.04);
  }
  .tol {
    stroke: var(--ink-3);
    stroke-width: 0.8;
    stroke-dasharray: 3 3;
  }
  .ch-line {
    fill: none;
    stroke: var(--support);
    stroke-width: 1.1;
  }
  .empty {
    font-size: 12.5px;
    fill: var(--ink-3);
  }
</style>
