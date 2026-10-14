<script lang="ts">
  import { onMount } from "svelte";
  import type { Slot } from "../shared/draw.ts";
  import { roomForDeck } from "../shared/rooms.ts";
  import type { DeckName } from "../shared/intents.ts";
  import { buildScene, type SceneHandle } from "./scene.ts";

  // Mounted once per Deck view. State changes reach the scene only through
  // setOpened; the render loop never reads Svelte state (ADR 0006).
  let { deck, opened }: { deck: DeckName; opened: Slot[] } = $props();

  const room = roomForDeck(deck);
  let host: HTMLDivElement;
  let handle: SceneHandle | null = null;
  let failed = $state(false);
  let locked = $state(false);

  onMount(() => {
    const onLock = (): void => { locked = document.pointerLockElement === handle?.canvas; };
    try {
      handle = buildScene(room, new Set(opened));
    } catch {
      failed = true;
      return;
    }
    handle.canvas.dataset.testid = "scene";
    handle.canvas.setAttribute("data-testid", "scene");
    handle.canvas.setAttribute("aria-label", `The ${room.name}, in 3D`);
    // While the mouse is captured, clicks are delivered to the canvas rather than the prompt, so a click there releases it.
    const canvas = handle.canvas;
    canvas.addEventListener("click", () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); });
    host.prepend(canvas);
    document.addEventListener("pointerlockchange", onLock);
    return () => {
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
  </div>
{/if}

<style>
  .scene { position: relative; width: 100%; height: 50vh; min-height: 240px; background: #1d2229; }
  .scene :global(canvas) { width: 100%; height: 100%; display: block; }
  .prompt { position: absolute; left: 50%; bottom: 0.75rem; transform: translateX(-50%); }
</style>
