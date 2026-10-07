<script lang="ts">
  import { onMount } from 'svelte';
  import type { ViewKind } from '../lib/engine/protocol';
  import { app, type Tool } from '../state/app.svelte';
  import ConvergenceChart from './ConvergenceChart.svelte';
  import EditControls from './EditControls.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import Header from './Header.svelte';
  import Icon from './Icon.svelte';
  import Inspector from './Inspector.svelte';
  import Metrics from './Metrics.svelte';
  import ParamsPanel from './ParamsPanel.svelte';
  import PresetPicker from './PresetPicker.svelte';
  import ReferencePanel from './ReferencePanel.svelte';
  import RunControls from './RunControls.svelte';
  import Sheet from './Sheet.svelte';
  import Toasts from './Toasts.svelte';
  import ToolBar from './ToolBar.svelte';
  import ToolOptions from './ToolOptions.svelte';
  import ViewSwitch from './ViewSwitch.svelte';
  import Viewport from './Viewport.svelte';

  const howModule = () => import('./HowItWorks.svelte');

  onMount(() => {
    const desktop = matchMedia('(min-width: 1100px)');
    const phone = matchMedia('(max-width: 699px)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const applyLayout = () => {
      app.layout = desktop.matches ? 'desktop' : phone.matches ? 'phone' : 'tablet';
    };
    applyLayout();
    app.reducedMotion = motion.matches;
    // Phones start on the coarse mesh so the first design grows quickly.
    if (phone.matches) app.params.nely = 32;
    if (phone.matches) app.params.rmin = 1.5;
    desktop.addEventListener('change', applyLayout);
    phone.addEventListener('change', applyLayout);
    const onMotion = () => app.setReducedMotion(motion.matches);
    motion.addEventListener('change', onMotion);
    const onVisibility = () => app.setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    app.start();
    document.documentElement.dataset.ready = 'true';
    return () => {
      desktop.removeEventListener('change', applyLayout);
      phone.removeEventListener('change', applyLayout);
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });

  const toolKeys: Record<string, Tool> = {
    v: 'select',
    l: 'load',
    p: 'support',
    o: 'void',
    d: 'solid',
    e: 'erase',
  };
  const viewKeys: Record<string, ViewKind> = {
    '1': 'density',
    '2': 'stress',
    '3': 'deformed',
    '4': 'energy',
  };

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.closest('input, select, textarea, dialog') || target.isContentEditable))
      return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) app.redo();
      else app.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      app.redo();
      return;
    }
    if (mod || e.altKey) return;
    const onHandle = target?.classList.contains('handle');
    if (e.key === ' ' && !target?.closest('button')) {
      e.preventDefault();
      if (app.engine === 'running') app.pause();
      else app.run();
      return;
    }
    if (onHandle) return;
    const k = e.key.toLowerCase();
    if (k === '.') app.step();
    else if (k === 'r') app.reset();
    else if (toolKeys[k] && app.editable) app.tool = toolKeys[k];
    else if (viewKeys[k]) app.setView(viewKeys[k]);
    else if (e.key === 'Escape') app.selection = null;
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app {app.layout}">
  <Header compact={app.layout === 'phone'} />

  {#if app.layout === 'desktop'}
    <main class="workspace">
      <aside class="side left" aria-label="Setup">
        <section>
          <h2 class="section-title caps">Presets</h2>
          <PresetPicker layout="tiles" />
        </section>
        <section>
          <h2 class="section-title caps">Tools</h2>
          <ToolBar orientation="vertical" />
          <ToolOptions />
        </section>
        <section>
          <h2 class="section-title caps">Edit</h2>
          <EditControls />
        </section>
        <Inspector />
      </aside>
      <section class="stage" aria-label="Design">
        <div class="stage-bar">
          <ViewSwitch />
          <ExportMenu />
        </div>
        <div class="canvas-wrap"><Viewport /></div>
        {@render notices()}
      </section>
      <aside class="side right" aria-label="Optimisation">
        {#if app.referenceFt}<ReferencePanel />{/if}
        <RunControls />
        <ConvergenceChart />
        <Metrics />
        {#if !app.referenceFt}
          <section>
            <h2 class="section-title caps">Parameters</h2>
            <ParamsPanel />
          </section>
          <section class="ref-entry">
            <h2 class="section-title caps">Reference mode</h2>
            <p>Reproduce the published 88-line results (Andreassen et al. 2011) step by step.</p>
            <button
              type="button"
              class="ref-btn"
              onclick={() => app.enterReference(2)}
              data-testid="enter-reference"
            >
              Run the 88-line reference
            </button>
          </section>
        {/if}
      </aside>
    </main>
  {:else if app.layout === 'tablet'}
    <main class="workspace">
      <div class="stage-bar">
        <ViewSwitch />
        <ExportMenu />
      </div>
      <div class="canvas-wrap"><Viewport /></div>
      {@render notices()}
      <div class="tools-row">
        <ToolBar orientation="horizontal" />
        <div class="tools-extra">
          <ToolOptions />
          <EditControls />
        </div>
      </div>
      <Inspector />
      <div class="columns">
        <div class="col">
          {#if app.referenceFt}<ReferencePanel />{/if}
          <RunControls />
          <ConvergenceChart />
          <Metrics />
        </div>
        <div class="col">
          <section>
            <h2 class="section-title caps">Presets</h2>
            <PresetPicker layout="grid" />
          </section>
          {#if !app.referenceFt}
            <section>
              <h2 class="section-title caps">Parameters</h2>
              <ParamsPanel />
            </section>
            <button type="button" class="ref-btn" onclick={() => app.enterReference(2)}
              >Run the 88-line reference</button
            >
          {/if}
        </div>
      </div>
    </main>
  {:else}
    <main class="workspace">
      <div class="canvas-wrap"><Viewport compact /></div>
      {@render notices()}
      <div class="phone-panel">
        <ViewSwitch compact />
        {#if app.referenceFt}<ReferencePanel />{/if}
        <RunControls compact />
        <Metrics compact />
        <ConvergenceChart height={112} />
      </div>
    </main>
    <nav class="bottom-bar" aria-label="Tools">
      <ToolBar orientation="bottom" />
      <button
        type="button"
        class="more"
        onclick={() => (app.sheetOpen = true)}
        aria-haspopup="dialog"
        data-testid="open-sheet"
      >
        <Icon name="sliders" size={22} />
        <span>Setup</span>
      </button>
    </nav>
    <Sheet />
  {/if}

  <Toasts />
  {#if app.howOpen}
    {#await howModule()}
      <div class="loading-how" role="status">Loading the explanation…</div>
    {:then mod}
      <mod.default />
    {:catch}
      <div class="loading-how error" role="alert">
        The explanation could not be loaded.
        <button type="button" onclick={() => (app.howOpen = false)}>Close</button>
      </div>
    {/await}
  {/if}
</div>

{#snippet notices()}
  {#if app.meshWarning || app.workerNotice || app.rendererNotice || app.engineError || app.warnings.length}
    <div class="notices">
      {#if app.engineError}
        <p class="notice error" role="alert">
          <Icon name="warning" size={16} />
          <span>The solver stopped: {app.engineError}</span>
          <button type="button" onclick={() => app.reset()}>Reset the design</button>
        </p>
      {/if}
      {#if app.meshWarning}
        <p class="notice warn" role="status" data-testid="mesh-warning">
          <Icon name="warning" size={16} />
          <span>{app.meshWarning}</span>
          <button type="button" onclick={() => app.setMesh(app.params.nely > 48 ? 48 : 32)}
            >Use a coarser mesh</button
          >
        </p>
      {/if}
      {#each app.warnings as w (w.code)}
        <p class="notice warn"><Icon name="warning" size={16} /><span>{w.detail}</span></p>
      {/each}
      {#if app.workerNotice}
        <p class="notice info"><Icon name="warning" size={16} /><span>{app.workerNotice}</span></p>
      {/if}
      {#if app.rendererNotice}
        <p class="notice info">
          <Icon name="warning" size={16} /><span>{app.rendererNotice}</span>
        </p>
      {/if}
    </div>
  {/if}
{/snippet}

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .section-title {
    margin: 0 0 6px;
    font-size: 13px;
    color: var(--ink-3);
  }
  section {
    display: grid;
    gap: 6px;
  }

  /* ---------------- desktop */
  .desktop {
    height: 100vh;
  }
  .desktop .workspace {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 252px minmax(0, 1fr) 320px;
  }
  .side {
    min-height: 0;
    overflow-y: auto;
    padding: 14px 14px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .side.left {
    border-right: 1px solid var(--hair-strong);
  }
  .side.right {
    border-left: 1px solid var(--hair-strong);
    gap: 16px;
  }
  .stage {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .stage-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--hair);
  }
  .desktop .canvas-wrap {
    flex: 1;
    min-height: 0;
  }
  .ref-entry p {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-3);
  }
  .ref-btn {
    min-height: 42px;
    border: 1px solid var(--ink);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
    font-weight: 650;
    font-stretch: 92%;
  }
  .ref-btn:hover {
    background: #fff;
  }

  /* ---------------- tablet */
  .tablet .workspace {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 32px;
  }
  .tablet .canvas-wrap {
    height: min(52vh, 520px);
    border-bottom: 1px solid var(--hair);
  }
  .tablet .tools-row,
  .tablet .columns,
  .tablet :global(.inspector) {
    margin: 0 16px;
  }
  .tools-row {
    display: grid;
    gap: 10px;
  }
  .tools-extra {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: start;
  }
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  /* ---------------- phone */
  .phone .workspace {
    display: flex;
    flex-direction: column;
    padding-bottom: 80px;
  }
  .phone .canvas-wrap {
    height: min(46vh, 300px);
    border-bottom: 1px solid var(--hair);
  }
  .phone-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 12px 12px;
  }
  .bottom-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: 1fr 64px;
    background: var(--paper);
    border-top: 1px solid var(--hair-strong);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .more {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 2px;
    min-height: 56px;
    border: none;
    border-left: 1px solid var(--hair);
    background: none;
    font-size: 11.5px;
    font-weight: 600;
    font-stretch: 90%;
    color: var(--ink-2);
  }

  /* ---------------- notices */
  .notices {
    display: grid;
    gap: 6px;
    padding: 8px 14px;
  }
  .notice {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 7px 10px;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
    font-size: 13px;
    color: var(--ink-2);
  }
  .notice span {
    flex: 1 1 200px;
  }
  .notice.warn {
    border-left: 3px solid var(--load);
  }
  .notice.error {
    border-left: 3px solid var(--danger);
  }
  .notice button {
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid var(--hair-strong);
    border-radius: 3px;
    background: var(--paper);
    font-weight: 600;
    font-size: 13px;
  }
  .loading-how {
    position: fixed;
    right: 16px;
    top: 70px;
    z-index: 60;
    padding: 10px 14px;
    background: var(--ink);
    color: var(--paper);
    border-radius: var(--r-sm);
  }
</style>
