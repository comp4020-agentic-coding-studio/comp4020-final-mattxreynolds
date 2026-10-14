<script lang="ts">
  import type { Debrief } from "../shared/lobby.ts";

  let { debrief, partner, onSailAgain, onBack }: { debrief: Debrief; partner: string; onSailAgain: () => void; onBack: () => void } = $props();
</script>

<section data-testid="debrief">
  <h1>{debrief.ship}: debrief</h1>
  {#each debrief.decks as d}
    <article data-testid="debrief-deck">
      <h2>{d.deck}: {d.room}</h2>
      <p>{d.player?.name ?? "No Player"}</p>
      {#each d.puzzles as p}
        <h3>{p.slot}: {p.role === "clue" ? "held the Clue" : "took the answer"}, {p.solved ? "solved" : "unsolved"}</h3>
        {#if p.clue}<pre>{p.clue}</pre>{/if}
      {/each}
    </article>
  {/each}
  <h2>Timeline</h2>
  <ol data-testid="timeline">
    {#each debrief.timeline as e}<li>{e.actor ? `${e.actor}: ` : ""}{e.text}</li>{/each}
  </ol>
  <button class="primary" onclick={onSailAgain}>Sail again with {partner}</button>
  <button onclick={onBack}>Back</button>
</section>

<style>
  button { font: inherit; padding: 0.6rem 1rem; }
  .primary { font-size: 1.2rem; display: block; width: 100%; margin: 1rem 0; }
  article { display: inline-block; width: 45%; margin-right: 4%; border: 1px solid #888; padding: 0.5rem; }
</style>
