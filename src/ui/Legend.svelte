<script lang="ts">
  import { app } from '../state/app.svelte';
  import { cividisGradient } from './render/colormap';
  import { fmt } from './format';

  let { compact = false }: { compact?: boolean } = $props();

  const gradient = cividisGradient();
  const exaggeration = $derived.by(() => {
    const [nx, ny] = app.fieldGrid;
    if (!app.fieldMax || !nx) return null;
    return (0.06 * Math.max(nx, ny)) / app.fieldMax;
  });
</script>

<div class="legend" class:compact role="group" aria-label="Colour legend" data-testid="legend">
  {#if app.view === 'density'}
    <span class="title caps"
      >{compact ? 'Density' : 'Material density'} <span class="greek">ρ</span></span
    >
    <span class="scale">
      <span class="tick mono">0</span>
      <span class="bar density" aria-hidden="true"></span>
      <span class="tick mono">1</span>
    </span>
    {#if !compact}<span class="note">void to solid</span>{/if}
  {:else if app.view === 'stress' || app.view === 'energy'}
    <span class="title caps"
      >{#if app.view === 'stress'}{compact ? 'Stress' : 'von Mises stress'}
        <span class="greek">σ</span>{:else}{compact ? 'Energy' : 'Strain energy density'}{/if}</span
    >
    <span class="scale" title="Capped at the 98th percentile of solid elements">
      <span class="tick mono">0</span>
      <span class="bar" style:background={gradient} aria-hidden="true"></span>
      <span class="tick mono">{app.fieldMax ? fmt(app.fieldMax) : '–'}+</span>
    </span>
    {#if !compact}<span class="note">capped at the 98th percentile</span>{/if}
  {:else}
    <span class="title caps">Deformed</span>
    <span class="note">
      {#if exaggeration}displacements × {fmt(exaggeration)}{/if}{#if !compact}, largest drawn at 6 %
        of the length{/if}
    </span>
  {/if}
</div>

<style>
  .legend {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    color: var(--ink-2);
  }
  .title {
    font-size: 12.5px;
    white-space: nowrap;
  }
  .scale {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .bar {
    width: 128px;
    height: 9px;
    border: 1px solid var(--hair-strong);
    border-radius: 1px;
  }
  .bar.density {
    background: linear-gradient(to right, var(--paper), var(--ink));
  }
  .tick {
    font-size: 11px;
    color: var(--ink-3);
  }
  .note {
    font-size: 12px;
    color: var(--ink-3);
    white-space: nowrap;
  }
  .legend.compact {
    gap: 6px;
  }
  .legend.compact .bar {
    width: 72px;
  }
  .legend.compact .title {
    font-size: 12px;
  }
</style>
