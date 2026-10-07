<script lang="ts">
  import { loadMagnitude, type Problem } from '../lib/problem/model';
  import { makePreset, PRESET_ORDER, type PresetId } from '../lib/problem/presets';
  import { app } from '../state/app.svelte';

  let { layout = 'list' }: { layout?: 'list' | 'grid' | 'tiles' } = $props();

  const presets = PRESET_ORDER.map((id) => makePreset(id));

  /** A tiny schematic of a problem: domain, void regions, supports and loads. */
  function sketch(p: Problem) {
    const W = 56;
    const H = W / Math.max(p.width, 1.6);
    const s = Math.min(W / p.width, H);
    const w = p.width * s;
    const ox = 8 + (W - w) / 2;
    const oy = 7 + H;
    const X = (x: number) => ox + x * s;
    const Y = (y: number) => oy - y * s;
    const regions = p.regions
      .filter((r) => r.kind === 'void' && r.shape === 'rect')
      .map((r) => {
        if (r.shape !== 'rect') return null;
        const x0 = X(Math.min(r.a.x, r.b.x));
        const y0 = Y(Math.max(r.a.y, r.b.y));
        return { x: x0, y: y0, w: Math.abs(r.b.x - r.a.x) * s, h: Math.abs(r.b.y - r.a.y) * s };
      })
      .filter((r) => r !== null);
    const supports = p.supports.map((sp) =>
      sp.shape === 'disk'
        ? { kind: 'disk' as const, cx: X(sp.centre.x), cy: Y(sp.centre.y), r: sp.radius * s }
        : { kind: 'seg' as const, x1: X(sp.a.x), y1: Y(sp.a.y), x2: X(sp.b.x), y2: Y(sp.b.y) },
    );
    const loads = p.loads.map((l) => {
      const m = loadMagnitude(l) || 1;
      const len = 10;
      const x = X(l.at.x);
      const y = Y(l.at.y);
      return {
        x,
        y,
        x2: x + (l.fx / m) * len,
        y2: y - (l.fy / m) * len,
        span: l.length * s,
      };
    });
    return { w: W + 16, h: H + 14, rect: { x: ox, y: oy - s, w, h: s }, regions, supports, loads };
  }

  function choose(id: PresetId) {
    app.loadPreset(id);
    app.sheetOpen = false;
  }
</script>

<div
  class="presets"
  class:grid={layout === 'grid'}
  class:tiles={layout === 'tiles'}
  role="group"
  aria-label="Presets"
>
  {#each presets as pr (pr.id)}
    {@const sk = sketch(pr.problem)}
    <button
      type="button"
      class="preset"
      aria-pressed={app.presetId === pr.id}
      onclick={() => choose(pr.id)}
      data-testid="preset-{pr.id}"
    >
      <svg class="sketch" width={sk.w} height={sk.h} viewBox="0 0 {sk.w} {sk.h}" aria-hidden="true">
        <rect x={sk.rect.x} y={sk.rect.y} width={sk.rect.w} height={sk.rect.h} class="dom" />
        {#each sk.regions as r, i (i)}
          <rect x={r.x} y={r.y} width={r.w} height={r.h} class="void" />
        {/each}
        {#each sk.supports as sp, i (i)}
          {#if sp.kind === 'disk'}
            <circle cx={sp.cx} cy={sp.cy} r={Math.max(2, sp.r)} class="sup" />
          {:else if Math.hypot(sp.x2 - sp.x1, sp.y2 - sp.y1) < 1}
            <path d="M{sp.x1} {sp.y1} l-3 5 h6 z" class="sup" />
          {:else}
            <line x1={sp.x1} y1={sp.y1} x2={sp.x2} y2={sp.y2} class="sup-line" />
          {/if}
        {/each}
        {#each sk.loads as l, i (i)}
          {#if l.span > 0}
            <line x1={l.x - l.span / 2} y1={l.y} x2={l.x + l.span / 2} y2={l.y} class="load-line" />
          {/if}
          <line x1={l.x} y1={l.y} x2={l.x2} y2={l.y2} class="load-line" />
          <circle cx={l.x2} cy={l.y2} r="1.6" class="load-dot" />
        {/each}
      </svg>
      <span class="text">
        <span class="name">{pr.name}</span>
        <span class="blurb" class:visually-hidden={layout === 'tiles'}>{pr.blurb}</span>
      </span>
    </button>
  {/each}
</div>

<style>
  .presets {
    display: grid;
    gap: 4px;
  }
  .presets.grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px;
  }
  .presets.tiles {
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .tiles .preset {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 2px;
    padding: 6px 4px 7px;
    text-align: center;
    border-color: var(--hair);
  }
  .tiles .preset[aria-pressed='true'] {
    box-shadow: none;
    outline: 1.5px solid var(--ink);
    outline-offset: -1.5px;
  }
  .tiles .name {
    font-size: 12.5px;
  }
  .preset {
    display: grid;
    grid-template-columns: 72px 1fr;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 4px 8px 4px 2px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: none;
    text-align: left;
  }
  .preset:hover {
    background: var(--paper-raised);
    border-color: var(--hair);
  }
  .preset[aria-pressed='true'] {
    background: var(--paper-raised);
    border-color: var(--ink);
    box-shadow: inset 3px 0 0 var(--ink);
  }
  .sketch {
    justify-self: center;
  }
  .dom {
    fill: rgba(21, 21, 21, 0.06);
    stroke: rgba(21, 21, 21, 0.55);
    stroke-width: 1;
  }
  .void {
    fill: var(--paper);
    stroke: rgba(21, 21, 21, 0.45);
    stroke-dasharray: 2 1.5;
    stroke-width: 0.8;
  }
  .sup {
    fill: rgba(39, 71, 255, 0.25);
    stroke: var(--support);
    stroke-width: 1.1;
  }
  .sup-line {
    stroke: var(--support);
    stroke-width: 2.4;
  }
  .load-line {
    stroke: var(--load-edge);
    stroke-width: 1.6;
  }
  .load-dot {
    fill: var(--load);
  }
  .text {
    display: grid;
    min-width: 0;
  }
  .name {
    font-weight: 650;
    font-size: 14px;
    font-stretch: 92%;
  }
  .blurb {
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.25;
  }
</style>
