<script lang="ts">
  import { app } from '../state/app.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="toasts" role="status" aria-live="polite" data-testid="toasts">
  {#each app.toasts as t (t.id)}
    <div class="toast {t.kind}">
      <Icon name={t.kind === 'error' ? 'warning' : 'check'} size={16} />
      <span>{t.text}</span>
      <button type="button" aria-label="Dismiss" onclick={() => app.dismissToast(t.id)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    z-index: 50;
    display: grid;
    gap: 8px;
    width: min(460px, calc(100vw - 24px));
    pointer-events: none;
  }
  .toast {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 9px 8px 9px 12px;
    border-radius: var(--r-sm);
    background: var(--ink);
    color: var(--paper);
    box-shadow: var(--shadow-2);
    font-size: 13.5px;
    pointer-events: auto;
    animation: rise 180ms ease-out;
  }
  .toast.error {
    background: #5b1410;
  }
  .toast span {
    word-break: break-word;
  }
  .toast button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: inherit;
  }
  .toast button:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  @keyframes rise {
    from {
      transform: translateY(8px);
      opacity: 0;
    }
  }
  @media (max-width: 699px) {
    .toasts {
      bottom: 84px;
    }
  }
</style>
