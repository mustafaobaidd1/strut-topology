<script lang="ts">
  import type { ViewKind } from '../lib/engine/protocol';
  import { app } from '../state/app.svelte';

  let { compact = false }: { compact?: boolean } = $props();

  const views: { id: ViewKind; label: string; key: string }[] = [
    { id: 'density', label: 'Density', key: '1' },
    { id: 'stress', label: 'Stress', key: '2' },
    { id: 'deformed', label: 'Deformed', key: '3' },
    { id: 'energy', label: 'Energy', key: '4' },
  ];
</script>

<div class="views" class:compact>
  <div class="seg" role="radiogroup" aria-label="View">
    {#each views as v (v.id)}
      <button
        type="button"
        role="radio"
        aria-checked={app.view === v.id}
        aria-keyshortcuts={v.key}
        title="{v.label} view ({v.key})"
        onclick={() => app.setView(v.id)}
        data-testid="view-{v.id}"
      >
        {v.label}
      </button>
    {/each}
  </div>
  <label class="crisp" title="Draw the material boundary as the 0.5 iso-line, anti-aliased">
    <input type="checkbox" bind:checked={app.crisp} disabled={app.rendererNotice !== null} />
    <span>Crisp edges</span>
  </label>
</div>

<style>
  .views {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .seg {
    display: inline-grid;
    grid-auto-flow: column;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    overflow: hidden;
    background: var(--paper-raised);
  }
  .seg button {
    min-height: 36px;
    padding: 0 13px;
    border: none;
    border-right: 1px solid var(--hair);
    background: none;
    font-size: 13.5px;
    font-weight: 600;
    font-stretch: 88%;
    color: var(--ink-2);
  }
  .seg button:last-child {
    border-right: none;
  }
  .seg button[aria-checked='true'] {
    background: var(--ink);
    color: var(--paper);
  }
  .crisp {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .crisp input {
    width: 16px;
    height: 16px;
    accent-color: var(--ink);
  }
  .views.compact {
    gap: 8px;
  }
  .views.compact .seg {
    display: grid;
    grid-auto-columns: 1fr;
    width: 100%;
  }
  .views.compact .seg button {
    min-height: 44px;
    padding: 0 6px;
  }
</style>
