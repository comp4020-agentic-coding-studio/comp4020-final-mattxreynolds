<script lang="ts">
  let { secondsLeft }: { secondsLeft: number } = $props();
  const pad = (n: number) => String(n).padStart(2, "0");
</script>

<p class="clock">{pad(Math.floor(secondsLeft / 60))}:{pad(secondsLeft % 60)}</p>
