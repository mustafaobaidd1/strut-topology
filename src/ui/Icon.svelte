<script lang="ts" module>
  export type IconName =
    | 'select'
    | 'load'
    | 'support'
    | 'void'
    | 'solid'
    | 'erase'
    | 'undo'
    | 'redo'
    | 'play'
    | 'pause'
    | 'step'
    | 'reset'
    | 'download'
    | 'help'
    | 'code'
    | 'back'
    | 'symmetry'
    | 'close'
    | 'sliders'
    | 'check'
    | 'warning'
    | 'fixed'
    | 'rollerX'
    | 'rollerY'
    | 'brush'
    | 'box';
</script>

<script lang="ts">
  let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'select'}
    <path d="M5 3.5l13 7.2-5.9 1.5-2.6 5.6z" />
  {:else if name === 'load'}
    <circle cx="12" cy="4.5" r="2" />
    <path d="M12 6.5v12.5M7.5 14.8L12 19.5l4.5-4.7" />
  {:else if name === 'support'}
    <path d="M12 5l5.5 9h-11z" />
    <path d="M4 17.5h16M6 17.5l-2 3M10 17.5l-2 3M14 17.5l-2 3M18 17.5l-2 3" />
  {:else if name === 'void'}
    <rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2.2" />
    <path d="M8 20L20 8M4 16L16 4M4 20L20 4" stroke-width="1.2" />
  {:else if name === 'solid'}
    <rect x="4" y="4" width="16" height="16" rx="1" fill="currentColor" />
    <path d="M9 20L20 9M4 15L15 4" stroke="var(--paper)" stroke-width="1.2" />
  {:else if name === 'erase'}
    <path
      d="M8.5 19.5L3.8 14.8a1.6 1.6 0 010-2.3l8.7-8.7a1.6 1.6 0 012.3 0l5.4 5.4a1.6 1.6 0 010 2.3l-8.4 8.5z"
    />
    <path d="M8.5 19.5H20M8 9.5l6.5 6.5" />
  {:else if name === 'undo'}
    <path d="M9 7.5L4.5 12 9 16.5" />
    <path d="M4.5 12H15a4.5 4.5 0 010 9h-2" />
  {:else if name === 'redo'}
    <path d="M15 7.5l4.5 4.5-4.5 4.5" />
    <path d="M19.5 12H9a4.5 4.5 0 000 9h2" />
  {:else if name === 'play'}
    <path d="M7 4.8v14.4L19 12z" fill="currentColor" stroke="none" />
  {:else if name === 'pause'}
    <rect x="6" y="5" width="4" height="14" rx="0.8" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="4" height="14" rx="0.8" fill="currentColor" stroke="none" />
  {:else if name === 'step'}
    <path d="M5 5.5v13L14.5 12z" fill="currentColor" stroke="none" />
    <path d="M18 5.5v13" stroke-width="2.4" />
  {:else if name === 'reset'}
    <path d="M4.5 12a7.5 7.5 0 102.2-5.3" />
    <path d="M4 4.5v4.5h4.5" />
  {:else if name === 'download'}
    <path d="M12 4v11M7.5 10.8L12 15.2l4.5-4.4" />
    <path d="M5 19.5h14" />
  {:else if name === 'help'}
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2.1-2.4 3.7" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" />
  {:else if name === 'code'}
    <path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />
  {:else if name === 'back'}
    <path d="M10 6.5L4.5 12l5.5 5.5M5 12h14.5" />
  {:else if name === 'symmetry'}
    <path d="M12 3v18" stroke-dasharray="4 1.6 1 1.6" />
    <path d="M9 7L4 12l5 5zM15 7l5 5-5 5z" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6L6 18" />
  {:else if name === 'sliders'}
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  {:else if name === 'check'}
    <path d="M5 12.5l4.2 4.2L19 7" />
  {:else if name === 'warning'}
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
  {:else if name === 'fixed'}
    <path d="M12 6l5 8H7z" fill="currentColor" fill-opacity="0.15" />
    <path d="M4.5 16.5h15M6.5 16.5l-2 3M10.5 16.5l-2 3M14.5 16.5l-2 3M18.5 16.5l-2 3" />
  {:else if name === 'rollerX'}
    <path d="M12 5l4.5 7h-9z" fill="currentColor" fill-opacity="0.15" />
    <circle cx="9.5" cy="14" r="1.5" />
    <circle cx="14.5" cy="14" r="1.5" />
    <path d="M4.5 17h15M6.5 17l-2 3M10.5 17l-2 3M14.5 17l-2 3M18.5 17l-2 3" />
  {:else if name === 'rollerY'}
    <path d="M19 12l-7 4.5v-9z" fill="currentColor" fill-opacity="0.15" />
    <circle cx="10" cy="9.5" r="1.5" />
    <circle cx="10" cy="14.5" r="1.5" />
    <path d="M7 4.5v15M7 6.5l-3-2M7 10.5l-3-2M7 14.5l-3-2M7 18.5l-3-2" />
  {:else if name === 'brush'}
    <circle cx="12" cy="12" r="6.5" stroke-dasharray="3 2" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  {:else if name === 'box'}
    <rect x="5" y="6" width="14" height="12" stroke-dasharray="3 2" />
  {/if}
</svg>
