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

<div class="legend" class:compact aria-label="Colour legend" role="group">
  {#if app.view === 'density'}
    <span class="title caps">Material density <span class="greek">ρ</span></span>
    <span class="bar density" aria-hidden="true"></span>
    <span class="ticks mono"><span>0 void</span><span>0.5</span><span>1 solid</span></span>
  {:else if app.view === 'stress' || app.view === 'energy'}
    <span class="title caps"
      >{#if app.view === 'stress'}von Mises stress <span class="greek">σ</span>{:else}Strain energy
        density{/if}</span
    >
    <span class="bar" style:background={gradient} aria-hidden="true"></span>
    <span class="ticks mono"
      ><span>0</span><span>{app.fieldMax ? fmt(app.fieldMax / 2) : '–'}</span><span
        >{app.fieldMax ? fmt(app.fieldMax) : '–'}+</span
      ></span
    >
    {#if !compact}<span class="note">scale capped at the 98th percentile of solid elements</span
      >{/if}
  {:else}
    <span class="title caps">Deformed shape</span>
    <span class="note">
      displacements exaggerated {exaggeration ? `× ${fmt(exaggeration)}` : ''}; outline shows the
      undeformed domain
    </span>
  {/if}
</div>

<style>
  .legend {
    position: absolute;
    right: 12px;
    bottom: 10px;
    display: grid;
    gap: 3px;
    width: 220px;
    padding: 7px 10px 8px;
    background: rgba(247, 246, 242, 0.92);
    border: 1px solid var(--hair);
    border-radius: var(--r-sm);
    pointer-events: none;
  }
  .legend.compact {
    right: 8px;
    bottom: 6px;
    width: 168px;
    padding: 5px 8px 6px;
  }
  .title {
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .bar {
    height: 8px;
    border-radius: 1px;
    border: 1px solid var(--hair);
  }
  .bar.density {
    background: linear-gradient(to right, var(--paper), var(--ink));
  }
  .ticks {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--ink-3);
  }
  .note {
    font-size: 11.5px;
    color: var(--ink-3);
    line-height: 1.3;
  }
</style>
