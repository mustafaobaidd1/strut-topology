<script lang="ts">
  import { app } from '../state/app.svelte';
  import { fmt, percent } from './format';

  let { compact = false }: { compact?: boolean } = $props();
  const s = $derived(app.stats);
  const solverText = $derived.by(() => {
    if (app.referenceFt) return 'direct';
    if (!s) return '–';
    return s.ms > 0 ? `${s.cgIterations} CG · ${Math.round(s.ms)} ms` : `${s.cgIterations} CG`;
  });
  const target = $derived(` / ${percent(app.params.volfrac)}`);
</script>

<dl class="metrics" class:compact data-testid="metrics">
  <div>
    <dt class="caps">Compliance c</dt>
    <dd class="mono big" data-testid="compliance">{s ? fmt(s.compliance, 5) : '–'}</dd>
  </div>
  <div>
    <dt class="caps">Volume</dt>
    <dd class="mono">
      {s ? percent(s.volume, 1) : '–'}{#if !compact}<span class="muted">{target}</span>{/if}
    </dd>
  </div>
  <div>
    <dt class="caps">Change</dt>
    <dd class="mono">{s && Number.isFinite(s.change) ? s.change.toFixed(3) : '–'}</dd>
  </div>
  {#if !compact}
    <div>
      <dt class="caps">Grey <span class="muted">(non-discrete)</span></dt>
      <dd class="mono">{s ? `${s.grayness.toFixed(1)} %` : '–'}</dd>
    </div>
    <div>
      <dt class="caps">Projection <span class="greek">β</span></dt>
      <dd class="mono">{app.params.projection && s ? s.beta : 'off'}</dd>
    </div>
    <div>
      <dt class="caps">Solver</dt>
      <dd class="mono">
        {solverText}
      </dd>
    </div>
  {/if}
</dl>

<style>
  .metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
    margin: 0;
  }
  .metrics.compact {
    grid-template-columns: 1.4fr 1fr 1fr;
  }
  dt {
    font-size: 12px;
    color: var(--ink-3);
  }
  dd {
    margin: 0;
    font-size: 14px;
    color: var(--ink);
  }
  dd.big {
    font-size: 17px;
    font-weight: 600;
  }
  .muted {
    color: var(--ink-3);
    font-weight: 400;
  }
</style>
