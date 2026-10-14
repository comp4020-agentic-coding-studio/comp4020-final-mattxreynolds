<script lang="ts">
  import { onMount } from "svelte";
  import type { LobbySnapshot, PersonView, VoyageView } from "../shared/lobby.ts";

  type Screen = "loading" | "first" | "profile" | "lobby";
  let screen: Screen = $state("loading");
  let person: PersonView | null = $state(null);
  let snapshot: LobbySnapshot | null = $state(null);
  let code = $state("");
  let problem = $state("");
  let copied = $state(false);

  const origin = location.origin;
  let source: EventSource | null = null;
  let retry = 0;

  async function api<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
    const res = await fetch(path, {
      method: body === undefined && path !== "/api/guest" && !path.endsWith("/voyages") ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T };
  }

  // SSE is the only source of lobby state. EventSource stops for good on a
  // non-200 (ADR 0004), so a CLOSED stream is recreated with backoff.
  function watch(voyage: VoyageView): void {
    source?.close();
    const es = new EventSource(`/api/voyages/${voyage.id}/events`);
    source = es;
    es.addEventListener("snapshot", (e) => {
      retry = 0;
      snapshot = JSON.parse((e as MessageEvent).data) as LobbySnapshot;
    });
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) return;
      setTimeout(() => source === es && watch(voyage), Math.min(1000 * 2 ** retry++, 15000));
    };
  }

  function enter(voyage: VoyageView): void {
    history.replaceState(null, "", voyage.link);
    screen = "lobby";
    watch(voyage);
  }

  async function playAsGuest(): Promise<void> {
    const res = await api<PersonView>("/api/guest");
    person = res.data;
    screen = "profile";
  }

  async function start(): Promise<void> {
    const res = await api<VoyageView>("/api/voyages", {});
    if (res.ok) enter(res.data);
  }

  async function join(by: { key: string } | { code: string }): Promise<void> {
    problem = "";
    const res = await api<VoyageView>("/api/join", by);
    if (res.ok) return enter(res.data);
    problem = res.status === 404 ? "No Voyage has that code." : res.status === 409 ? "That Voyage already has two Players." : "Could not join.";
    screen = "profile";
  }

  async function copy(text: string): Promise<void> {
    await navigator.clipboard?.writeText(text).catch(() => {});
    copied = true;
  }

  onMount(async () => {
    const me = await api<PersonView>("/api/me");
    if (me.ok) person = me.data;
    const key = location.pathname.match(/^\/v\/([\w-]+)$/)?.[1];
    if (key) {
      // a partner's link goes straight to the lobby, skipping the first screen
      if (!person) person = (await api<PersonView>("/api/guest")).data;
      await join({ key });
    } else {
      screen = person ? "profile" : "first";
    }
  });
</script>

<main>
  {#if screen === "first"}
    <h1>Escape the sinking ship</h1>
    <p>Two of you, sealed on separate Decks. Each Deck holds the Clues for the other's Puzzles, and talking out loud is the only channel between you.</p>
    <button class="primary" onclick={playAsGuest}>Play as guest</button>
  {:else if screen === "profile" && person}
    <h1>{person.name}</h1>
    <p>Your Player name. Bring a partner aboard: start a Voyage and share its link or code.</p>
    <button class="primary" onclick={start}>Start a Voyage</button>
    <form onsubmit={(e) => { e.preventDefault(); void join({ code }); }}>
      <label>Voyage code <input bind:value={code} placeholder="SS-KESTREL-4821" autocapitalize="characters" /></label>
      <button type="submit">Join</button>
    </form>
    {#if problem}<p role="alert">{problem}</p>{/if}
  {:else if screen === "lobby" && snapshot}
    <h1 data-testid="ship-name">{snapshot.voyage.ship}</h1>
    <section>
      {#each snapshot.decks as d}
        <article data-testid="deck-card"><h2>{d.deck}</h2><p>Empty</p></article>
      {/each}
    </section>
    <p>Link: <code data-testid="voyage-link">{origin}{snapshot.voyage.link}</code>
      <button onclick={() => copy(origin + snapshot!.voyage.link)}>Copy link</button></p>
    <p>Code: <code data-testid="voyage-code">{snapshot.voyage.code}</code>
      <button onclick={() => copy(snapshot!.voyage.code)}>Copy code</button></p>
    {#if copied}<p role="status">Copied.</p>{/if}
    <ul>
      {#each snapshot.players as p}<li data-testid="player">{p.name}{p.id === snapshot.you.id ? " (you)" : ""}</li>{/each}
    </ul>
  {:else if screen === "loading" || screen === "lobby"}
    <p>Loading</p>
  {/if}
</main>

<style>
  main { max-width: 32rem; margin: 0 auto; padding: 1rem 16px; font-family: system-ui, sans-serif; }
  button { font: inherit; padding: 0.6rem 1rem; }
  .primary { font-size: 1.2rem; display: block; width: 100%; margin: 1rem 0; }
  article { display: inline-block; width: 45%; margin-right: 4%; border: 1px solid #888; padding: 0.5rem; }
  code { word-break: break-all; }
</style>
