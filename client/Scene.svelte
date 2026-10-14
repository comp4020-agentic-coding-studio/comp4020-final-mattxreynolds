<script lang="ts">
  import { onMount } from "svelte";
  import { SLOTS, type Slot } from "../shared/draw.ts";
  import { examineText, roomForDeck, type Thing } from "../shared/rooms.ts";
  import type { DeckName, Pose } from "../shared/intents.ts";
  import { createPoseSaver } from "./pose.ts";
  import { buildScene, type SceneHandle } from "./scene.ts";

  // Mounted once per Deck view. State changes reach the scene only through
  // setOpened; the render loop never reads Svelte state (ADR 0006).
  let { deck, opened, voyageId, pose }: { deck: DeckName; opened: Slot[]; voyageId: string; pose: Pose | null } = $props();

  const room = roomForDeck(deck);
  let host: HTMLDivElement;
  let handle: SceneHandle | null = null;
  let failed = $state(false);
  let locked = $state(false);
  let seen = $state("");

  // Using a thing: show its text and log the examine through the intent pipeline. It is never a Strike (#52).
  function use(thing: Thing): void {
    const live = new Set<Slot>(SLOTS.filter((s) => !opened.includes(s)).slice(0, 1));
    seen = examineText(thing, live);
    void fetch(`/api/voyages/${voyageId}/intents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "examine", thing: thing.id }),
    }).catch(() => {});
  }

  onMount(() => {
    const saver = createPoseSaver(voyageId);
    const flush = (): void => saver.flush();
    const onHide = (): void => { if (document.visibilityState === "hidden") saver.flush(); };
    const onLock = (): void => { locked = document.pointerLockElement === handle?.canvas; };
    try {
      handle = buildScene(room, new Set(opened), pose, (p) => saver.capture(p), use);
    } catch {
      failed = true;
      return;
    }
    handle.canvas.dataset.testid = "scene";
    handle.canvas.setAttribute("data-testid", "scene");
    handle.canvas.setAttribute("aria-label", `The ${room.name}, in 3D`);
    host.prepend(handle.canvas);
    document.addEventListener("pointerlockchange", onLock);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      saver.flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("pointerlockchange", onLock);
      if (document.pointerLockElement === handle?.canvas) document.exitPointerLock();
      handle?.dispose();
    };
  });

  $effect(() => {
    handle?.setOpened(new Set(opened));
  });

  // Always visible, and the one way to capture or release the mouse.
  function toggleLook(): void {
    if (!handle) return;
    if (document.pointerLockElement === handle.canvas) document.exitPointerLock();
    else void handle.canvas.requestPointerLock();
  }
</script>

{#if failed}
  <p data-testid="scene-fallback" role="status">3D is not available in this browser, so the 2D view below carries the Voyage.</p>
{:else}
  <div class="scene" bind:this={host}>
    <button type="button" class="prompt" data-testid="look-prompt" onclick={toggleLook}>
      {locked ? "Esc to release" : "Click to look around"}
    </button>
    {#if seen}<p class="seen" data-testid="examine-text" role="status">{seen}</p>{/if}
  </div>
{/if}

<style>
  .scene { position: relative; width: 100%; height: 50vh; min-height: 240px; background: #1d2229; }
  .scene :global(canvas) { width: 100%; height: 100%; display: block; }
  .seen { position: absolute; left: 50%; top: 0.75rem; transform: translateX(-50%); margin: 0; padding: 0.4rem 0.8rem; background: #000b; color: #fff; }
  .prompt { position: absolute; left: 50%; bottom: 0.75rem; transform: translateX(-50%); }
</style>
