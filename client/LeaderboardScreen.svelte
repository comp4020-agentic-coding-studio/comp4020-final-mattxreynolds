<script lang="ts">
  import type { LeaderboardView } from "../shared/lobby.ts";

  let { entries, fmtMs, onBack }: { entries: LeaderboardView["entries"]; fmtMs: (ms: number) => string; onBack: () => void } = $props();
</script>

<section data-testid="leaderboard">
  <h1>Leaderboard</h1>
  {#if entries.length === 0}<p>No Scores posted yet.</p>{/if}
  <ol>
    {#each entries as e}<li data-testid="leaderboard-entry">{e.players}: {fmtMs(e.scoreMs)}</li>{/each}
  </ol>
  <button onclick={onBack}>Back</button>
</section>

<style>
  button { font: inherit; padding: 0.6rem 1rem; }
</style>
