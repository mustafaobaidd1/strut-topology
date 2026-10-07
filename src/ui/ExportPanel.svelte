<script lang="ts">
  import Icon from './Icon.svelte';
  import { exportPng, exportStl, exportSvg } from './exporting';

  let widthMm = $state(200);
  let thicknessMm = $state(5);

  const opts = $derived({
    widthMm: Math.min(2000, Math.max(10, widthMm || 200)),
    thicknessMm: Math.min(200, Math.max(0.2, thicknessMm || 5)),
  });
</script>

<div class="export">
  <div class="fields">
    <label>
      <span class="caps">Width</span>
      <span class="input"
        ><input type="number" min="10" max="2000" step="1" bind:value={widthMm} /><span class="unit"
          >mm</span
        ></span
      >
    </label>
    <label>
      <span class="caps">Thickness</span>
      <span class="input"
        ><input type="number" min="0.2" max="200" step="0.5" bind:value={thicknessMm} /><span
          class="unit">mm</span
        ></span
      >
    </label>
  </div>
  <div class="buttons">
    <button
      type="button"
      onclick={() => exportSvg(opts)}
      data-testid="export-svg"
      title="Smoothed outline at density 0.5, for laser cutting or CNC"
    >
      <Icon name="download" size={16} /><span>SVG <small>outline</small></span>
    </button>
    <button
      type="button"
      onclick={() => exportStl(opts)}
      data-testid="export-stl"
      title="Outline extruded to the thickness, for 3D printing"
    >
      <Icon name="download" size={16} /><span>STL <small>extruded</small></span>
    </button>
    <button
      type="button"
      onclick={() => exportPng()}
      data-testid="export-png"
      title="Image of the current view with a title block"
    >
      <Icon name="download" size={16} /><span>PNG <small>view</small></span>
    </button>
  </div>
  <p class="help">
    Outlines trace the 0.5 density contour, smoothed. Supports and loads are not part of the cut.
  </p>
</div>

<style>
  .export {
    display: grid;
    gap: 8px;
  }
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  label {
    display: grid;
    gap: 2px;
    font-size: 12px;
    color: var(--ink-3);
  }
  .input {
    display: flex;
    align-items: center;
    border: 1px solid var(--hair-strong);
    border-radius: 3px;
    background: var(--paper);
  }
  .input input {
    width: 100%;
    min-height: 34px;
    padding: 0 6px;
    border: none;
    background: none;
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .unit {
    padding: 0 7px;
    font-size: 12px;
    color: var(--ink-3);
  }
  .buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .buttons button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
    font-weight: 700;
    font-size: 13.5px;
    font-stretch: 90%;
  }
  .buttons button:hover {
    background: #fff;
    border-color: var(--ink);
  }
  small {
    display: block;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--ink-3);
    line-height: 1;
  }
  .buttons button span {
    display: grid;
    text-align: left;
  }
  .help {
    margin: 0;
    font-size: 12px;
    color: var(--ink-3);
  }
</style>
