<script lang="ts">
  import type { FilterType88 } from '../lib/opt/top88';
  import { app, REFERENCE_VALUES } from '../state/app.svelte';

  let logEl: HTMLOListElement | undefined = $state();

  const ft = $derived(app.referenceFt);
  const ref = $derived(ft ? REFERENCE_VALUES[ft] : null);
  const finalC = $derived.by(() => {
    if (!app.referenceDone) return null;
    const last = app.referenceLog[app.referenceLog.length - 1];
    const m = last?.match(/Obj\.:\s*([0-9.]+)/);
    return m ? Number(m[1]) : null;
  });
  const match = $derived(finalC !== null && ref ? finalC.toFixed(2) === ref.c.toFixed(2) : null);

  $effect(() => {
    void app.referenceLog.length;
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  });

  const options: FilterType88[] = [1, 2, 3];
</script>

<section class="reference" aria-label="88-line reference mode" data-testid="reference-panel">
  {#if ft && ref}
    <h2 class="caps">88-line reference</h2>
    <p class="lead">
      The half MBB beam of Andreassen et al. (2011), solved by a line-by-line port of
      <span class="mono">top88.m</span>: 60 × 20 elements, volume fraction 0.5, penalty 3, r<sub
        >min</sub
      >
      {ref.rmin}, direct solver, stop when the change drops to 0.01.
    </p>
    <div class="seg" role="radiogroup" aria-label="Filter">
      {#each options as o (o)}
        <button
          type="button"
          role="radio"
          aria-checked={ft === o}
          onclick={() => app.enterReference(o)}
        >
          ft = {o}
        </button>
      {/each}
    </div>
    <p class="filter-name">{ref.label}</p>
    <dl class="compare">
      <div>
        <dt class="caps">Published (Fig. {ft === 3 ? 5 : 3})</dt>
        <dd class="mono">c = {ref.c.toFixed(2)}</dd>
      </div>
      <div>
        <dt class="caps">This run</dt>
        <dd class="mono" data-testid="reference-result">
          {#if finalC !== null}c = {finalC.toFixed(2)}{:else}running…{/if}
        </dd>
      </div>
    </dl>
    {#if match !== null}
      <p class="verdict" class:ok={match}>
        {match
          ? 'Matches the published value to the printed precision.'
          : 'Differs from the published value.'}
      </p>
    {/if}
    <ol class="log mono" bind:this={logEl} aria-label="Iteration log" tabindex="-1">
      {#each app.referenceLog as line, i (i)}
        <li>{line}</li>
      {/each}
    </ol>
    <button type="button" class="leave" onclick={() => app.leaveReference()}>Back to editing</button
    >
  {/if}
</section>

<style>
  .reference {
    display: grid;
    gap: 8px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
  }
  .lead {
    margin: 0;
    font-size: 13px;
    color: var(--ink-2);
  }
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    overflow: hidden;
  }
  .seg button {
    min-height: 38px;
    border: none;
    border-right: 1px solid var(--hair);
    background: var(--paper);
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .seg button:last-child {
    border-right: none;
  }
  .seg button[aria-checked='true'] {
    background: var(--ink);
    color: var(--paper);
  }
  .filter-name {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-3);
  }
  .compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0;
  }
  dt {
    font-size: 12px;
    color: var(--ink-3);
  }
  dd {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .verdict {
    margin: 0;
    font-size: 13px;
    color: var(--danger);
  }
  .verdict.ok {
    color: var(--ok);
  }
  .log {
    margin: 0;
    padding: 8px 10px;
    list-style: none;
    max-height: 220px;
    overflow: auto;
    background: var(--ink);
    color: #e6e5df;
    border-radius: var(--r-sm);
    font-size: 11px;
    line-height: 1.5;
    white-space: pre;
  }
  .leave {
    min-height: 40px;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
    font-weight: 650;
  }
</style>
