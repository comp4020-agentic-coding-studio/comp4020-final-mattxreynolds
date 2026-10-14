<script lang="ts">
  import { onMount } from "svelte";
  import Scene from "./Scene.svelte";
  import { roomForDeck } from "../shared/rooms.ts";
  import type { LobbySnapshot, RejoinOffer, PersonView, ProfileVoyages, VoyageView } from "../shared/lobby.ts";

  type Screen = "loading" | "first" | "profile" | "lobby";
  let screen: Screen = $state("loading");
  let person: PersonView | null = $state(null);
  let snapshot: LobbySnapshot | null = $state(null);
  let code = $state("");
  let problem = $state("");
  let copied = $state(false);
  let nameDraft = $state("");
  let nameProblem = $state("");
  let voyages: ProfileVoyages = $state({ unfinished: [], finished: [] });
  // the Voyage whose "End the Voyage" is awaiting its confirm
  let confirming: string | null = $state(null);
  // accounts: the create-account and sign-in forms
  let signingIn = $state(false);
  let username = $state("");
  let password = $state("");
  let accountProblem = $state("");

  $effect(() => { if (person && !nameDraft) nameDraft = person.name; });

  const origin =location.origin;
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
      const next = JSON.parse((e as MessageEvent).data) as LobbySnapshot;
      // either Player may end the Voyage, so the other's ship ends too
      if (next.ended) return void goHome();
      // a reload restores the half-typed code once, from this Player's own snapshot (#57)
      if (!draftRestored) {
        draftRestored = true;
        code4 = next.drafts.opener ?? "";
      }
      snapshot = next;
    });
    es.addEventListener("strike", () => (strikeNote = "A wrong answer. The ship groans."));
    es.addEventListener("bell", () => (bellNote = "A bell rings. A hatch swings open."));
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) return;
      setTimeout(() => source === es && watch(voyage), Math.min(1000 * 2 ** retry++, 15000));
    };
  }

  async function goHome(): Promise<void> {
    source?.close();
    source = null;
    snapshot = null;
    confirming = null;
    history.replaceState(null, "", "/");
    screen = "profile";
    const res = await fetch("/api/voyages");
    if (res.ok) voyages = (await res.json()) as ProfileVoyages;
  }

  async function endVoyage(id: string): Promise<void> {
    const res = await api(`/api/voyages/${id}/intents`, { kind: "end-voyage" });
    confirming = null;
    if (res.ok || res.status === 409) await goHome();
  }

  function enter(voyage: VoyageView): void {
    history.replaceState(null, "", voyage.link);
    screen = "lobby";
    draftRestored = false;
    watch(voyage);
  }

  async function playAsGuest(): Promise<void> {
    const res = await api<PersonView>("/api/guest");
    person = res.data;
    await goHome();
  }

  async function createAccount(): Promise<void> {
    accountProblem = "";
    const res = await api<PersonView>("/api/account", { username, password });
    password = "";
    if (!res.ok) {
      accountProblem =
        res.status === 409 ? "That username is taken." : "Use 3 to 20 letters, digits, - or _, and a password of at least 8 characters.";
      return;
    }
    person = res.data;
    username = "";
  }

  async function signIn(): Promise<void> {
    accountProblem = "";
    const res = await api<PersonView>("/api/signin", { username, password });
    password = "";
    if (!res.ok) {
      accountProblem = res.status === 429 ? "Too many attempts. Wait a minute." : "Wrong username or password.";
      return;
    }
    person = res.data;
    username = "";
    signingIn = false;
    nameDraft = "";
    await goHome();
  }

  async function signOut(): Promise<void> {
    await api("/api/signout", {});
    person = null;
    nameDraft = "";
    voyages = { unfinished: [], finished: [] };
    screen = "first";
  }

  async function rename(): Promise<void> {
    nameProblem = "";
    const res = await fetch("/api/me/name", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nameDraft }),
    });
    if (!res.ok) {
      nameProblem = res.status === 400 ? "That name won't do. Try another." : "Could not save the name.";
      return;
    }
    person = (await res.json()) as PersonView;
    nameDraft = person.name;
  }

  async function start():Promise<void> {
    const res = await api<VoyageView>("/api/voyages", {});
    if (res.ok) enter(res.data);
  }

  async function join(by: { key: string } | { code: string }): Promise<void> {
    problem = "";
    const res = await api<VoyageView>("/api/join", by);
    if (res.ok) return enter(res.data);
    await goHome();
    if (res.status === 409 && "code" in by) {
      // a full Voyage: a fresh browser may take over a Deck whose Player isn't connected
      const found = await api<{ offers: RejoinOffer[] }>("/api/rejoin/offers", by);
      if (found.ok && found.data.offers.length > 0) {
        offers = found.data.offers;
        offerCode = by.code;
        return;
      }
    }
    problem = res.status === 404 ? "No Voyage has that code." : res.status === 409 ? "That Voyage already has two Players." : "Could not join.";
  }

  let offers: RejoinOffer[] = $state([]);
  let offerCode = "";

  async function rejoin(deck: string): Promise<void> {
    const res = await api<{ voyage: VoyageView; person: PersonView }>("/api/rejoin", { code: offerCode, deck });
    offers = [];
    if (!res.ok) {
      problem = "That Deck is no longer free to take.";
      return;
    }
    person = res.data.person;
    nameDraft = person.name;
    enter(res.data.voyage);
  }

  let intentNote = $state("");
  let offer: string | null = $state(null);
  const mineCastOff = (s: LobbySnapshot): boolean => s.decks.some((d) => d.player?.id === s.you.id && d.castOff);

  // The stream is the only source of state, so a refused intent changes
  // nothing here but the note; the next snapshot has already arrived or will.
  async function send(body: { kind: "choose-deck"; deck: string } | { kind: "cast-off" }): Promise<void> {
    if (!snapshot) return;
    const res = await api<{ error: string; offer?: string }>(`/api/voyages/${snapshot.voyage.id}/intents`, { ...body, seq: snapshot.seq });
    intentNote = res.ok ? "" : res.data?.error ?? "The ship shifted, try again.";
    offer = res.ok ? null : res.data?.offer ?? null;
  }

  let code4 = $state("");
  let draftRestored = false;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;

  // Low-trust and fire-and-forget: no seq, no refusal handling, and it never touches state (#57).
  function saveDraft(): void {
    clearTimeout(draftTimer);
    const text = code4;
    const id = snapshot?.voyage.id;
    if (!id) return;
    draftTimer = setTimeout(() => void api(`/api/voyages/${id}/intents`, { kind: "keypad-draft", slot: "opener", text }), 250);
  }
  let strikeNote = $state("");
  let bellNote = $state("");

  // The server decides: this only sends the digits. A Strike or a solve comes back as a notice on the stream.
  async function enterCode(): Promise<void> {
    if (!snapshot?.yourDeck) return;
    const res = await api<{ error: string }>(`/api/voyages/${snapshot.voyage.id}/intents`, {
      kind: "submit",
      deck: snapshot.yourDeck,
      slot: "opener",
      answer: code4,
      seq: snapshot.seq,
    });
    intentNote = res.ok ? "" : res.data?.error ?? "The ship shifted, try again.";
    if (res.ok) {
      code4 = "";
      saveDraft();
    }
  }

  // One step; the server decides whether it was a trapdoor, and says so on the stream.
  async function walkStep(dir: string): Promise<void> {
    if (!snapshot?.yourDeck) return;
    const res = await api<{ error: string }>(`/api/voyages/${snapshot.voyage.id}/intents`, {
      kind: "walk-step",
      deck: snapshot.yourDeck,
      slot: "middle",
      dir,
      seq: snapshot.seq,
    });
    intentNote = res.ok ? "" : res.data?.error ?? "The ship shifted, try again.";
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
      if (person) await goHome();
      else screen = "first";
    }
  });
</script>

<main>
  {#if screen === "first"}
    <h1>Escape the sinking ship</h1>
    <p>Two of you, sealed on separate Decks. Each Deck holds the Clues for the other's Puzzles, and talking out loud is the only channel between you.</p>
    <button class="primary" onclick={playAsGuest}>Play as guest</button>
    <button onclick={() => (signingIn = !signingIn)}>Sign in</button>
    {#if signingIn}
      <form onsubmit={(e) => { e.preventDefault(); void signIn(); }}>
        <label>Username <input bind:value={username} autocomplete="username" maxlength="20" /></label>
        <label>Password <input type="password" bind:value={password} autocomplete="current-password" /></label>
        <button type="submit">Sign in</button>
      </form>
      {#if accountProblem}<p role="alert">{accountProblem}</p>{/if}
    {/if}
  {:else if screen === "profile" && person}
    <form onsubmit={(e) => { e.preventDefault(); void rename(); }}>
      <label>Player name <input data-testid="player-name" bind:value={nameDraft} maxlength="20" /></label>
      <button type="submit">Save</button>
    </form>
    {#if nameProblem}<p role="alert">{nameProblem}</p>{/if}
    {#if person.account}
      <button onclick={signOut}>Sign out</button>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); void createAccount(); }}>
        <p>Keep your Voyages from any browser: create an Account. No email, and no password reset.</p>
        <label>Username <input bind:value={username} autocomplete="username" maxlength="20" /></label>
        <label>Password <input type="password" bind:value={password} autocomplete="new-password" /></label>
        <button type="submit">Create account</button>
      </form>
      {#if accountProblem}<p role="alert">{accountProblem}</p>{/if}
    {/if}
    <section>
      <h2>Unfinished Voyages</h2>
      {#each voyages.unfinished as v (v.id)}
        <article data-testid="unfinished-voyage">
          <h3>{v.ship}</h3>
          <p>Code <code>{v.code}</code></p>
          <button onclick={() => enter(v)}>Resume</button>
          {#if confirming === v.id}
            <button onclick={() => endVoyage(v.id)}>Yes, end it</button>
            <button onclick={() => (confirming = null)}>Keep sailing</button>
          {:else}
            <button onclick={() => (confirming = v.id)}>End the Voyage</button>
          {/if}
        </article>
      {:else}
        <p>None yet.</p>
      {/each}
    </section>
    <section>
      <h2>Finished Voyages</h2>
      {#each voyages.finished as v (v.id)}
        <article data-testid="finished-voyage"><h3>{v.ship}</h3><p>{v.outcome}</p></article>
      {:else}
        <p>None yet.</p>
      {/each}
    </section>
    <p>Bring a partner aboard: start a Voyage and share its link or code.</p>
    <button class="primary" onclick={start}>Start a Voyage</button>
    <form onsubmit={(e) => { e.preventDefault(); void join({ code }); }}>
      <label>Voyage code <input bind:value={code} placeholder="SS-KESTREL-4821" autocapitalize="characters" /></label>
      <button type="submit">Join</button>
    </form>
    {#if problem}<p role="alert">{problem}</p>{/if}
    {#each offers as o}
      <button class="primary" onclick={() => rejoin(o.deck)}>Rejoin as {o.playerName} ({o.deck})</button>
    {/each}
  {:else if screen === "lobby" && snapshot}
    <h1 data-testid="ship-name">{snapshot.voyage.ship}</h1>
    {#if snapshot.started && snapshot.yourDeck}
      <section data-testid="deck-view">
        <h2>{snapshot.yourDeck}</h2>
        <p data-testid="room-name">{roomForDeck(snapshot.yourDeck).name}</p>
        <Scene deck={snapshot.yourDeck} opened={(snapshot.draw?.puzzles ?? []).filter((p) => p.status === "solved").map((p) => p.slot)} />
        <p data-testid="strikes">Strikes: {snapshot.draw?.strikes ?? 0}</p>
        {#if strikeNote}<p role="status">{strikeNote}</p>{/if}
        {#if bellNote}<p role="status">{bellNote}</p>{/if}
        {#each snapshot.draw?.puzzles ?? [] as p}
          {#if p.slot === "opener"}
            <article data-testid="hatch">
              The hatch: {p.status === "solved" ? "open" : p.status === "live" ? "bolted" : "dark"}
            </article>
            {#if p.role === "clue" && p.clue}
              <pre data-testid="mural">{p.clue}</pre>
            {:else if p.role === "lock"}
              <form data-testid="keypad" onsubmit={(e) => { e.preventDefault(); void enterCode(); }}>
                <label>Code <input inputmode="numeric" maxlength="4" bind:value={code4} oninput={saveDraft} disabled={p.status !== "live"} /></label>
                <button type="submit" disabled={p.status !== "live"}>Enter</button>
              </form>
            {/if}
          {:else if p.slot === "middle" && p.status !== "dead"}
            <article data-testid="far-hatch">
              The far hatch: {p.status === "solved" ? "open" : "bolted"}
            </article>
            {#if p.role === "clue" && p.clue}
              <pre data-testid="plan">{p.clue}</pre>
            {:else if p.walk}
              <section data-testid="floor">
                <p>You stand on <span data-testid="walker-at">{p.walk.at}</span>. The lit tiles beside you:</p>
                {#each p.walk.lit as l (l.dir)}
                  <button onclick={() => walkStep(l.dir)}>{l.dir} to {l.tile}</button>
                {/each}
              </section>
            {/if}
          {:else}
            <p data-testid="dead-station">A {p.slot} station, dead for now.</p>
          {/if}
        {/each}
      </section>
    {:else}
    <section>
      {#each snapshot.decks as d}
        <article data-testid="deck-card">
          <h2>{d.deck}</h2>
          {#if d.player}
            <p>Held by {d.player.id === snapshot.you.id ? "you" : d.player.name}, {d.connected ? "connected" : "not connected"}{d.castOff ? ", cast off" : ""}</p>
          {:else}
            <p>Empty</p>
          {/if}
          {#if d.player?.id !== snapshot.you.id && !d.player && !mineCastOff(snapshot)}
            <button onclick={() => send({ kind: "choose-deck", deck: d.deck })}>Take</button>
          {/if}
        </article>
      {/each}
    </section>
    {#if intentNote}<p role="status">{intentNote}{#if offer} <button onclick={() => send({ kind: "choose-deck", deck: offer! })}>Take the {offer}</button>{/if}</p>{/if}
    {#if snapshot.yourDeck && !mineCastOff(snapshot)}
      <button class="primary" onclick={() => send({ kind: "cast-off" })}>Cast off</button>
    {:else if mineCastOff(snapshot)}
      <p role="status">Waiting for your partner to cast off.</p>
    {/if}
    <p>Playing both Decks alone? Open a second Chrome profile or an incognito window for the other Deck.</p>
    {/if}
    {#if confirming === snapshot.voyage.id}
      <button onclick={() => endVoyage(snapshot!.voyage.id)}>Yes, end it</button>
      <button onclick={() => (confirming = null)}>Keep sailing</button>
    {:else}
      <button onclick={() => (confirming = snapshot!.voyage.id)}>End the Voyage</button>
    {/if}
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
