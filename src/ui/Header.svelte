<script lang="ts">
  import { app } from '../state/app.svelte';
  import Icon from './Icon.svelte';

  let { compact = false }: { compact?: boolean } = $props();
</script>

<header class="header" class:compact>
  <a class="back" href="https://mustafaobaidd1.github.io/">
    <Icon name="back" size={16} />
    <span>{compact ? 'Portfolio' : 'Mustafa Obaid · Portfolio'}</span>
  </a>
  <div class="title-block">
    <h1>Strut</h1>
    {#if !compact}<p class="subtitle caps">Topology optimisation in the browser</p>{/if}
  </div>
  <nav class="links" aria-label="Project">
    <button
      type="button"
      class="link-btn"
      onclick={() => (app.howOpen = true)}
      aria-haspopup="dialog"
    >
      <Icon name="help" size={17} />
      <span>How it works</span>
    </button>
    <a class="link-btn" href="https://github.com/mustafaobaidd1/strut-topology">
      <Icon name="code" size={17} />
      <span>Source code</span>
    </a>
  </nav>
</header>

<style>
  .header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;
    height: 58px;
    padding: 0 18px;
    border-bottom: 1px solid var(--hair-strong);
    background: var(--paper);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    justify-self: start;
    min-height: 40px;
    padding: 0 6px;
    color: var(--ink-2);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    font-stretch: 90%;
  }
  .back:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .title-block {
    display: flex;
    align-items: baseline;
    gap: 14px;
  }
  h1 {
    margin: 0;
    font-size: 27px;
    line-height: 1;
    font-weight: 820;
    font-stretch: 125%;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .subtitle {
    margin: 0;
    font-size: 15px;
    color: var(--ink-3);
    white-space: nowrap;
  }
  .links {
    display: flex;
    gap: 4px;
    justify-self: end;
  }
  .link-btn {
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink-2);
    text-decoration: none;
    font-size: 14px;
    font-weight: 600;
    font-stretch: 88%;
  }
  .link-btn:hover {
    border-color: var(--hair);
    background: var(--paper-raised);
    color: var(--ink);
  }
  @media (max-width: 1099px) {
    .subtitle {
      display: none;
    }
  }
  .header.compact {
    height: 52px;
    padding: 0 8px;
    gap: 6px;
  }
  .header.compact h1 {
    font-size: 21px;
    letter-spacing: 0.14em;
  }
  .header.compact .link-btn span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .header.compact .link-btn {
    width: 44px;
    height: 44px;
    justify-content: center;
    padding: 0;
  }
  .header.compact .back {
    font-size: 13px;
  }
</style>
