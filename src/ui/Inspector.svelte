<script lang="ts">
  import { clamp, loadMagnitude, type Load, type SupportKind } from '../lib/problem/model';
  import { app } from '../state/app.svelte';
  import { updateEntity } from './viewportLogic';

  const load = $derived(app.problem.loads.find((l) => l.id === app.selection) ?? null);
  const support = $derived(app.problem.supports.find((s) => s.id === app.selection) ?? null);
  const region = $derived(app.problem.regions.find((r) => r.id === app.selection) ?? null);

  const angle = $derived(load ? Math.round((Math.atan2(load.fy, load.fx) * 180) / Math.PI) : 0);
  const mag = $derived(load ? loadMagnitude(load) : 0);

  function setLoad(fn: (l: Load) => Load) {
    if (!load) return;
    app.commit(updateEntity(app.problem, load.id, { load: fn }));
  }

  function num(e: Event): number {
    return Number((e.currentTarget as HTMLInputElement).value);
  }

  function setAim(deg: number, m: number) {
    const a = (deg * Math.PI) / 180;
    const mm = clamp(m, 0.25, 3);
    setLoad((l) => ({
      ...l,
      fx: Math.round(mm * Math.cos(a) * 1e4) / 1e4,
      fy: Math.round(mm * Math.sin(a) * 1e4) / 1e4,
    }));
  }

  function setKind(kind: SupportKind) {
    if (!support) return;
    app.commit(updateEntity(app.problem, support.id, { support: (s) => ({ ...s, kind }) }));
  }
</script>

{#if load || support || region}
  <section class="inspector" aria-label="Selected item">
    <h3 class="caps">
      {#if load}{load.length > 0
          ? 'Line load'
          : 'Point load'}{:else if support}Support{:else}{region?.kind === 'void'
          ? 'Void region'
          : 'Solid region'}{/if}
    </h3>
    {#if load}
      <div class="fields">
        <label>
          <span>x</span>
          <input
            type="number"
            step="0.05"
            min="0"
            max={app.problem.width}
            value={load.at.x.toFixed(2)}
            onchange={(e) =>
              setLoad((l) => ({ ...l, at: { x: clamp(num(e), 0, app.problem.width), y: l.at.y } }))}
          />
        </label>
        <label>
          <span>y</span>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={load.at.y.toFixed(2)}
            onchange={(e) => setLoad((l) => ({ ...l, at: { x: l.at.x, y: clamp(num(e), 0, 1) } }))}
          />
        </label>
        <label>
          <span>|F|</span>
          <input
            type="number"
            step="0.05"
            min="0.25"
            max="3"
            value={mag.toFixed(2)}
            onchange={(e) => setAim(angle, num(e))}
          />
        </label>
        <label>
          <span>angle °</span>
          <input
            type="number"
            step="5"
            min="-180"
            max="180"
            value={angle}
            onchange={(e) => setAim(num(e), mag)}
          />
        </label>
        {#if load.length > 0}
          <label class="wide">
            <span>length</span>
            <input
              type="number"
              step="0.05"
              min="0.05"
              max={app.problem.width}
              value={load.length.toFixed(2)}
              onchange={(e) =>
                setLoad((l) => ({ ...l, length: clamp(num(e), 0.05, app.problem.width) }))}
            />
          </label>
        {/if}
      </div>
    {:else if support}
      <label class="select">
        <span>Type</span>
        <select
          value={support.kind}
          onchange={(e) => setKind((e.currentTarget as HTMLSelectElement).value as SupportKind)}
        >
          <option value="fixed">Fixed (holds x and y)</option>
          <option value="rollerX">Roller sliding in x (holds y)</option>
          <option value="rollerY">Roller sliding in y (holds x)</option>
        </select>
      </label>
    {/if}
    <button
      type="button"
      class="delete"
      onclick={() => app.selection && app.deleteEntity(app.selection)}
    >
      Delete
    </button>
  </section>
{/if}

<style>
  .inspector {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--hair-strong);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
  }
  h3 {
    margin: 0;
    font-size: 13.5px;
    color: var(--ink-2);
  }
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  label {
    display: grid;
    gap: 2px;
    font-size: 11.5px;
    color: var(--ink-3);
  }
  .wide {
    grid-column: span 2;
  }
  input,
  select {
    min-height: 34px;
    width: 100%;
    padding: 0 6px;
    border: 1px solid var(--hair-strong);
    border-radius: 3px;
    background: var(--paper);
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--ink);
  }
  select {
    font-family: var(--font-sans);
  }
  .delete {
    min-height: 36px;
    border: 1px solid rgba(179, 38, 30, 0.45);
    border-radius: 3px;
    background: var(--paper);
    color: var(--danger);
    font-weight: 650;
    font-stretch: 90%;
  }
  .delete:hover {
    background: rgba(179, 38, 30, 0.07);
  }
</style>
