<script lang="ts">
  import type { SupportKind } from '../lib/problem/model';
  import { app } from '../state/app.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  const kinds: { id: SupportKind; label: string; icon: IconName; title: string }[] = [
    { id: 'fixed', label: 'Fixed', icon: 'fixed', title: 'Fixed: holds both directions' },
    {
      id: 'rollerX',
      label: 'Roller x',
      icon: 'rollerX',
      title: 'Roller sliding along x: holds y only',
    },
    {
      id: 'rollerY',
      label: 'Roller y',
      icon: 'rollerY',
      title: 'Roller sliding along y: holds x only',
    },
  ];

  const tips: Record<string, string> = {
    select: 'Drag loads, supports and regions. Drag an arrow head to aim and size a load.',
    load: 'Click to place a point load; drag sideways for a line load (it brings a thin solid deck).',
    support: 'Click for a point support; drag along an edge for a line of supports.',
    void: 'Paint where material must stay out.',
    solid: 'Paint where material must stay.',
    erase: 'Click a load, support or region to delete it, or brush over painted regions.',
  };
</script>

<div class="options">
  <p class="tip">{tips[app.tool]}</p>
  {#if app.tool === 'support'}
    <div class="seg" role="radiogroup" aria-label="Support type">
      {#each kinds as k (k.id)}
        <button
          type="button"
          role="radio"
          aria-checked={app.supportKind === k.id}
          title={k.title}
          onclick={() => (app.supportKind = k.id)}
        >
          <Icon name={k.icon} size={18} />
          <span>{k.label}</span>
        </button>
      {/each}
    </div>
  {/if}
  {#if app.tool === 'void' || app.tool === 'solid' || app.tool === 'erase'}
    {#if app.tool !== 'erase'}
      <div class="seg" role="radiogroup" aria-label="Region shape">
        <button
          type="button"
          role="radio"
          aria-checked={app.regionShape === 'brush'}
          onclick={() => (app.regionShape = 'brush')}
        >
          <Icon name="brush" size={18} /><span>Brush</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={app.regionShape === 'box'}
          onclick={() => (app.regionShape = 'box')}
        >
          <Icon name="box" size={18} /><span>Box</span>
        </button>
      </div>
    {/if}
    {#if app.regionShape === 'brush' || app.tool === 'erase'}
      <label class="slider">
        <span class="caps">Brush size</span>
        <input
          type="range"
          min="0.02"
          max="0.15"
          step="0.005"
          bind:value={app.brushRadius}
          aria-valuetext="{Math.round(app.brushRadius * app.params.nely)} elements"
        />
        <span class="mono val">{Math.round(app.brushRadius * app.params.nely)} el</span>
      </label>
    {/if}
  {/if}
</div>

<style>
  .options {
    display: grid;
    gap: 8px;
  }
  .tip {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-3);
    line-height: 1.35;
  }
  .seg {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    overflow: hidden;
  }
  .seg button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 38px;
    padding: 0 4px;
    border: none;
    border-right: 1px solid var(--hair);
    background: var(--paper);
    color: var(--ink-2);
    font-size: 12.5px;
    font-weight: 600;
    font-stretch: 85%;
  }
  .seg button:last-child {
    border-right: none;
  }
  .seg button[aria-checked='true'] {
    background: var(--support);
    color: #fff;
  }
  .slider {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .slider input {
    width: 100%;
    accent-color: var(--ink);
  }
  .val {
    font-size: 12px;
    min-width: 3.5em;
    text-align: right;
  }
</style>
