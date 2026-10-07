<script lang="ts">
  import ExportPanel from './ExportPanel.svelte';
  import Icon from './Icon.svelte';

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();

  function onWindowPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window onpointerdown={onWindowPointer} onkeydown={onKey} />

<div class="menu" bind:this={root}>
  <button
    type="button"
    class="trigger"
    aria-expanded={open}
    aria-controls="export-panel"
    onclick={() => (open = !open)}
    data-testid="export-menu"
  >
    <Icon name="download" size={17} />
    <span>Export</span>
  </button>
  {#if open}
    <div class="panel" id="export-panel" role="group" aria-label="Export">
      <ExportPanel />
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
    font-size: 13.5px;
    font-weight: 650;
    font-stretch: 90%;
  }
  .trigger:hover,
  .trigger[aria-expanded='true'] {
    background: #fff;
    border-color: var(--ink);
  }
  .panel {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    width: 330px;
    padding: 12px;
    background: var(--paper);
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-2);
  }
</style>
