<script lang="ts">
  import { app } from '../state/app.svelte';
  import Icon from './Icon.svelte';
  import { fmt } from './format';

  let { compact = false }: { compact?: boolean } = $props();

  const running = $derived(app.engine === 'running');
  const blocked = $derived(app.issue !== null || app.engine === 'starting');
  const it = $derived(app.stats?.runIteration ?? 0);
  const maxText = $derived(` / ${app.params.maxIter}`);

  /** Announced politely: only state changes, never every iteration. */
  const announcement = $derived.by(() => {
    if (app.engine === 'converged') {
      const by = app.stopReason === 'stall' ? 'compliance has settled' : 'design change below 1 %';
      return app.referenceFt
        ? `Reference run finished after ${it} iterations.`
        : `Converged after ${it} iterations (${by}). Compliance ${fmt(app.stats?.compliance ?? NaN, 5)}.`;
    }
    if (app.engine === 'limit') return `Stopped at the iteration limit of ${app.params.maxIter}.`;
    if (app.engine === 'paused' && !app.issue) return 'Paused.';
    if (app.engine === 'running') return 'Optimising.';
    return '';
  });

  const stateLabel = $derived.by(() => {
    switch (app.engine) {
      case 'starting':
        return 'Starting the solver…';
      case 'running':
        return 'Solving';
      case 'converged':
        return 'Converged';
      case 'limit':
        return 'Iteration limit';
      case 'paused':
        return app.issue ? 'Setup needs attention' : 'Paused';
      default:
        return 'Ready';
    }
  });

  function toggle() {
    if (running) app.pause();
    else app.run();
  }
</script>

<div class="run" class:compact>
  <div class="buttons">
    <button
      type="button"
      class="play"
      onclick={toggle}
      disabled={blocked || (app.referenceFt !== null && app.referenceDone)}
      aria-keyshortcuts="Space"
      data-testid="play"
    >
      <Icon name={running ? 'pause' : 'play'} size={18} />
      <span
        >{running
          ? 'Pause'
          : app.engine === 'converged' || app.engine === 'limit'
            ? 'Continue'
            : 'Run'}</span
      >
    </button>
    <button
      type="button"
      class="icon-btn"
      onclick={() => app.step()}
      disabled={blocked || running || app.referenceDone}
      aria-label="Step one iteration"
      title="Step one iteration (.)"
      aria-keyshortcuts="."
      data-testid="step"
    >
      <Icon name="step" size={18} />
    </button>
    <button
      type="button"
      class="icon-btn"
      onclick={() => app.reset()}
      disabled={app.engine === 'starting'}
      aria-label="Reset to a uniform design"
      title="Reset to a uniform design (R)"
      aria-keyshortcuts="R"
      data-testid="reset"
    >
      <Icon name="reset" size={18} />
    </button>
  </div>
  <div class="state">
    <span class="state-label caps" class:active={running} class:done={app.engine === 'converged'}>
      {#if app.engine === 'converged'}<Icon name="check" size={14} />{/if}
      {stateLabel}
    </span>
    <span class="mono it" data-testid="iteration"
      >it {it}{#if !app.referenceFt}<span class="of">{maxText}</span>{/if}</span
    >
  </div>
  {#if running && !app.referenceFt}
    <div class="progress" aria-hidden="true">
      <span style:width="{Math.min(100, (100 * it) / app.params.maxIter)}%"></span>
    </div>
  {/if}
  <p class="visually-hidden" aria-live="polite">{announcement}</p>
</div>

<style>
  .run {
    display: grid;
    gap: 8px;
  }
  .buttons {
    display: grid;
    grid-template-columns: 1fr 44px 44px;
    gap: 6px;
  }
  .play {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    border: 1px solid var(--ink);
    border-radius: var(--r-sm);
    background: var(--ink);
    color: var(--paper);
    font-weight: 700;
    font-stretch: 92%;
    letter-spacing: 0.02em;
  }
  .play:hover:not(:disabled) {
    background: #2d2d2b;
  }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
    color: var(--ink);
  }
  .icon-btn:hover:not(:disabled) {
    background: #fff;
  }
  button:disabled {
    opacity: 0.4;
  }
  .state {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .state-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    color: var(--ink-2);
  }
  .state-label.active {
    color: var(--load-text);
  }
  .state-label.done {
    color: var(--ok);
  }
  .it {
    font-size: 13px;
    color: var(--ink-2);
  }
  .of {
    color: var(--ink-3);
  }
  .progress {
    height: 2px;
    background: var(--hair);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--load);
  }
  .run.compact .buttons {
    grid-template-columns: 1fr 48px 48px;
  }
</style>
