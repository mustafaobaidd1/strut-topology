<script lang="ts">
  import { app, type Tool } from '../state/app.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  let { orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' | 'bottom' } =
    $props();

  const tools: { id: Tool; label: string; short: string; key: string; icon: IconName }[] = [
    { id: 'select', label: 'Move', short: 'Move', key: 'V', icon: 'select' },
    { id: 'load', label: 'Add load', short: 'Load', key: 'L', icon: 'load' },
    { id: 'support', label: 'Add support', short: 'Support', key: 'P', icon: 'support' },
    { id: 'void', label: 'Paint void', short: 'Void', key: 'O', icon: 'void' },
    { id: 'solid', label: 'Paint solid', short: 'Solid', key: 'D', icon: 'solid' },
    { id: 'erase', label: 'Erase', short: 'Erase', key: 'E', icon: 'erase' },
  ];
</script>

<div
  class="toolbar {orientation}"
  role="toolbar"
  aria-label="Editing tools"
  aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
>
  {#each tools as t (t.id)}
    <button
      type="button"
      class="tool"
      aria-pressed={app.tool === t.id}
      aria-keyshortcuts={t.key}
      title="{t.label} ({t.key})"
      disabled={!app.editable}
      onclick={() => (app.tool = t.id)}
      data-testid="tool-{t.id}"
    >
      <Icon name={t.icon} size={orientation === 'bottom' ? 22 : 20} />
      <span class="label">{orientation === 'vertical' ? t.label : t.short}</span>
      {#if orientation === 'vertical'}<kbd class="mono">{t.key}</kbd>{/if}
    </button>
  {/each}
</div>

<style>
  .toolbar {
    display: grid;
    gap: 2px;
  }
  .tool {
    display: grid;
    grid-template-columns: 26px 1fr auto;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink-2);
    font-size: 14px;
    font-weight: 600;
    font-stretch: 90%;
    text-align: left;
  }
  .tool:hover:not(:disabled) {
    background: var(--paper-raised);
    border-color: var(--hair);
    color: var(--ink);
  }
  .tool[aria-pressed='true'] {
    background: var(--ink);
    color: var(--paper);
  }
  .tool:disabled {
    opacity: 0.45;
  }
  kbd {
    font-size: 11px;
    padding: 1px 5px;
    border: 1px solid var(--hair-strong);
    border-radius: 3px;
    color: inherit;
    opacity: 0.75;
  }
  .toolbar.horizontal {
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
  }
  .toolbar.horizontal .tool {
    grid-template-columns: auto auto;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
  }
  .toolbar.bottom {
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 0;
  }
  .toolbar.bottom .tool {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 2px;
    min-height: 56px;
    padding: 4px 0;
    border-radius: 0;
    font-size: 11.5px;
  }
</style>
