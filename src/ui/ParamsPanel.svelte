<script lang="ts">
  import { app, MESH_LEVELS } from '../state/app.svelte';
  import { meshFor } from '../lib/problem/resolve';

  const disabled = $derived(!app.editable);
  const physicalR = $derived(app.params.rmin / app.params.nely);

  function value(e: Event): number {
    return Number((e.currentTarget as HTMLInputElement).value);
  }
</script>

<div class="params" data-testid="params">
  <label class="row">
    <span class="name">Volume fraction</span>
    <span class="mono val">{Math.round(app.params.volfrac * 100)} %</span>
    <input
      type="range"
      min="0.1"
      max="0.7"
      step="0.01"
      value={app.params.volfrac}
      {disabled}
      oninput={(e) => app.setParam('volfrac', value(e))}
      aria-valuetext="{Math.round(app.params.volfrac * 100)} percent of the domain"
      data-testid="volfrac"
    />
    <span class="help">Share of the domain the material may fill.</span>
  </label>

  <label class="row">
    <span class="name">SIMP penalty <i>p</i></span>
    <span class="mono val">{app.params.penal.toFixed(1)}</span>
    <input
      type="range"
      min="1"
      max="5"
      step="0.1"
      value={app.params.penal}
      {disabled}
      oninput={(e) => app.setParam('penal', value(e))}
    />
    <span class="help">Makes grey material inefficient, pushing densities to 0 or 1.</span>
  </label>

  <label class="row">
    <span class="name">Filter radius <i>r</i><sub>min</sub></span>
    <span class="mono val">{app.params.rmin.toFixed(1)} el</span>
    <input
      type="range"
      min="1.2"
      max="6"
      step="0.1"
      value={app.params.rmin}
      {disabled}
      onchange={(e) => app.setParam('rmin', value(e))}
      aria-valuetext="{app.params.rmin.toFixed(1)} elements"
    />
    <span class="help">Minimum member size: {(physicalR * 100).toFixed(1)} % of the height.</span>
  </label>

  <fieldset class="row mesh" {disabled}>
    <legend class="name">Mesh resolution</legend>
    <div class="seg" role="radiogroup" aria-label="Mesh resolution">
      {#each MESH_LEVELS as m (m.nely)}
        {@const g = meshFor(app.problem.width, m.nely)}
        <button
          type="button"
          role="radio"
          aria-checked={app.params.nely === m.nely}
          onclick={() => app.setMesh(m.nely)}
          title="{g.nelx} × {g.nely} = {(g.nelx * g.nely).toLocaleString('en')} elements"
          data-testid="mesh-{m.nely}"
        >
          <span>{m.label}</span>
          <span class="mono count">{g.nelx}×{g.nely}</span>
        </button>
      {/each}
    </div>
    {#if app.presetId === 'reference'}
      <span class="help">Fixed at 60 × 20 by the reference.</span>
    {/if}
  </fieldset>

  <div class="row toggle-row">
    <label class="switch">
      <input
        type="checkbox"
        checked={app.params.projection}
        {disabled}
        onchange={(e) => app.setParam('projection', (e.currentTarget as HTMLInputElement).checked)}
        data-testid="projection"
      />
      <span class="name">Heaviside projection</span>
    </label>
    <span class="help">
      Crisp black and white: <span class="greek">β</span> doubles from 1 every 25 iterations (or
      when settled) up to
      <select
        class="inline"
        value={String(app.params.betaMax)}
        disabled={disabled || !app.params.projection}
        onchange={(e) =>
          app.setParam('betaMax', Number((e.currentTarget as HTMLSelectElement).value))}
        aria-label="Final projection sharpness beta"
      >
        <option value="8">8</option>
        <option value="16">16</option>
        <option value="32">32</option>
        <option value="64">64</option>
      </select>.
    </span>
  </div>

  <label class="row">
    <span class="name">Max iterations</span>
    <span class="mono val">{app.params.maxIter}</span>
    <input
      type="range"
      min="50"
      max="1000"
      step="10"
      value={app.params.maxIter}
      {disabled}
      onchange={(e) => app.setParam('maxIter', value(e))}
    />
    <span class="help">Per run; edits start a new run from the current design.</span>
  </label>
</div>

<style>
  .params {
    display: grid;
    gap: 12px;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 2px 8px;
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
  }
  .name {
    font-size: 13.5px;
    font-weight: 650;
    font-stretch: 92%;
    color: var(--ink);
    padding: 0;
  }
  .val {
    font-size: 13px;
    color: var(--ink-2);
  }
  .row input[type='range'] {
    grid-column: 1 / -1;
    width: 100%;
    margin: 2px 0 0;
    accent-color: var(--ink);
    min-height: 24px;
  }
  .help {
    grid-column: 1 / -1;
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.35;
  }
  .mesh .seg {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    overflow: hidden;
    margin-top: 4px;
  }
  .mesh legend {
    float: left;
    width: 100%;
  }
  .seg button {
    display: grid;
    justify-items: center;
    gap: 0;
    min-height: 44px;
    padding: 4px 2px;
    border: none;
    border-right: 1px solid var(--hair);
    background: var(--paper);
    font-size: 11.5px;
    font-weight: 600;
    font-stretch: 82%;
    color: var(--ink-2);
  }
  .seg button:last-child {
    border-right: none;
  }
  .seg button[aria-checked='true'] {
    background: var(--ink);
    color: var(--paper);
  }
  .seg button:disabled {
    opacity: 0.5;
  }
  .count {
    font-size: 9.5px;
    font-weight: 400;
    opacity: 0.85;
  }
  .toggle-row {
    grid-template-columns: 1fr;
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
  }
  .switch input {
    width: 18px;
    height: 18px;
    accent-color: var(--ink);
  }
  select.inline {
    min-height: 26px;
    padding: 0 2px;
    border: 1px solid var(--hair-strong);
    border-radius: 3px;
    background: var(--paper);
    font-family: var(--font-mono);
    font-size: 12px;
  }
</style>
