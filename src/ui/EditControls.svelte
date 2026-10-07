<script lang="ts">
  import { app } from '../state/app.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="edit">
  <label class="sym" title="Mirror the design about the vertical centre line">
    <input
      type="checkbox"
      checked={app.problem.symmetric}
      disabled={!app.editable}
      onchange={(e) => app.setSymmetric((e.currentTarget as HTMLInputElement).checked)}
      data-testid="symmetry"
    />
    <Icon name="symmetry" size={18} />
    <span>Left–right symmetry</span>
  </label>
  <div class="history">
    <button
      type="button"
      onclick={() => app.undo()}
      disabled={!app.canUndo || !app.editable}
      aria-label="Undo"
      title="Undo (Ctrl+Z)"
      aria-keyshortcuts="Control+Z"
      data-testid="undo"
    >
      <Icon name="undo" size={18} />
      <span>Undo</span>
    </button>
    <button
      type="button"
      onclick={() => app.redo()}
      disabled={!app.canRedo || !app.editable}
      aria-label="Redo"
      title="Redo (Ctrl+Shift+Z)"
      aria-keyshortcuts="Control+Shift+Z"
      data-testid="redo"
    >
      <Icon name="redo" size={18} />
      <span>Redo</span>
    </button>
  </div>
</div>

<style>
  .edit {
    display: grid;
    gap: 8px;
  }
  .sym {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    font-size: 13.5px;
    font-weight: 600;
    font-stretch: 90%;
    color: var(--ink-2);
  }
  .sym input {
    width: 17px;
    height: 17px;
    accent-color: var(--ink);
  }
  .history {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .history button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
    font-size: 13.5px;
    font-weight: 600;
    font-stretch: 90%;
  }
  .history button:hover:not(:disabled) {
    background: #fff;
  }
  .history button:disabled {
    opacity: 0.4;
  }
</style>
