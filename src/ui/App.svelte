<script lang="ts">
  let count = $state(0);
  const doubled = $derived(count * 2);
</script>

<main>
  <h1>Strut</h1>
  <button type="button" onclick={() => (count += 1)}>Clicked {count} ({doubled})</button>
</main>
