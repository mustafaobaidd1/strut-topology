<script lang="ts">
  import { app } from '../state/app.svelte';
  import EditControls from './EditControls.svelte';
  import ExportPanel from './ExportPanel.svelte';
  import Icon from './Icon.svelte';
  import Inspector from './Inspector.svelte';
  import ParamsPanel from './ParamsPanel.svelte';
  import PresetPicker from './PresetPicker.svelte';
  import ReferencePanel from './ReferencePanel.svelte';
  import ToolOptions from './ToolOptions.svelte';

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (app.sheetOpen && !dialog.open) dialog.showModal();
    else if (!app.sheetOpen && dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  aria-labelledby="sheet-title"
  onclose={() => (app.sheetOpen = false)}
  data-testid="sheet"
>
  <header class="bar">
    <h2 id="sheet-title">Setup</h2>
    <button type="button" class="close" onclick={() => (app.sheetOpen = false)} aria-label="Close">
      <Icon name="close" size={18} />
    </button>
  </header>
  <div class="body">
    {#if app.referenceFt}
      <section><ReferencePanel /></section>
    {/if}
    <section>
      <h3 class="caps">Presets</h3>
      <PresetPicker />
    </section>
    <section>
      <h3 class="caps">Selected tool</h3>
      <ToolOptions />
      <Inspector />
    </section>
    <section>
      <h3 class="caps">Edit</h3>
      <EditControls />
    </section>
    <section>
      <h3 class="caps">Parameters</h3>
      <ParamsPanel />
    </section>
    <section>
      <h3 class="caps">Export</h3>
      <ExportPanel />
    </section>
    {#if !app.referenceFt}
      <section>
        <h3 class="caps">Reference mode</h3>
        <p class="note">
          Reproduce the 88-line code of Andreassen et al. (2011) and compare with the paper.
        </p>
        <button
          type="button"
          class="ref"
          onclick={() => {
            app.sheetOpen = false;
            app.enterReference(2);
          }}>Run the 88-line reference</button
        >
      </section>
    {/if}
  </div>
</dialog>

<style>
  .sheet {
    width: 100vw;
    max-width: 100vw;
    max-height: 86vh;
    margin: auto 0 0;
    padding: 0;
    border: none;
    border-top: 1px solid var(--hair-strong);
    border-radius: 14px 14px 0 0;
    background: var(--paper);
    color: var(--ink);
  }
  .sheet::backdrop {
    background: rgba(21, 21, 21, 0.35);
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px 6px 16px;
    background: var(--paper);
    border-bottom: 1px solid var(--hair);
  }
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 750;
    font-stretch: 110%;
  }
  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    background: none;
  }
  .body {
    display: grid;
    gap: 18px;
    padding: 12px 16px 28px;
  }
  section {
    display: grid;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: 13px;
    color: var(--ink-3);
  }
  .note {
    margin: 0;
    font-size: 13px;
    color: var(--ink-2);
  }
  .ref {
    min-height: 44px;
    border: 1px solid var(--ink);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
    font-weight: 650;
  }
</style>
