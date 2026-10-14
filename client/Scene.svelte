<script lang="ts">
  import { onMount } from "svelte";
  import type { Slot } from "../shared/draw.ts";
  import { roomForDeck } from "../shared/rooms.ts";
  import type { DeckName, Pose } from "../shared/intents.ts";
  import { createPoseSaver } from "./pose.ts";
  import { buildScene, type SceneHandle } from "./scene.ts";
  import { controlsMode, saveControlsMode, stickVector, type ControlsMode } from "./controls.ts";

  // Mounted once per Deck view. State changes reach the scene only through
  // setOpened; the render loop never reads Svelte state (ADR 0006).
  let { deck, opened, voyageId, pose }: { deck: DeckName; opened: Slot[]; voyageId: string; pose: Pose | null } = $props();

  const room = roomForDeck(deck);
  let host: HTMLDivElement;
  let handle: SceneHandle | null = null;
  let failed = $state(false);
  let locked = $state(false);
  // The Controls setting is saved per browser (#51); the joystick shows on touch screens.
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  let mode = $state<ControlsMode>(controlsMode(localStorage));
  let knob = $state({ x: 0, y: 0 });
  let stickId: number | null = null;
  const RADIUS = 48;
  const modeLabel = $derived(
    touch ? (mode === "tap" ? "Controls: tap to walk" : "Controls: joystick") : mode === "tap" ? "Controls: point and click" : "Controls: keys and mouse",
  );
  function toggleMode(): void {
    mode = mode === "tap" ? "direct" : "tap";
    saveControlsMode(localStorage, mode);
  }
  $effect(() => {
    handle?.setMode(mode);
    if (mode === "tap") handle?.setStick({ forward: 0, right: 0 });
  });
  function stickMove(e: PointerEvent): void {
    if (e.pointerId !== stickId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.max(Math.hypot(dx, dy), RADIUS);
    knob = { x: (dx / len) * RADIUS, y: (dy / len) * RADIUS };
    handle?.setStick(stickVector(dx, dy, RADIUS));
  }
  function stickDown(e: PointerEvent): void {
    if (stickId !== null) return;
    stickId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stickMove(e);
  }
  function stickUp(e: PointerEvent): void {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob = { x: 0, y: 0 };
    handle?.setStick({ forward: 0, right: 0 });
  }

  onMount(() => {
    const saver = createPoseSaver(voyageId);
    const flush = (): void => saver.flush();
    const onHide = (): void => { if (document.visibilityState === "hidden") saver.flush(); };
    const onLock = (): void => { locked = document.pointerLockElement === handle?.canvas; };
    try {
      handle = buildScene(room, new Set(opened), pose, (p) => saver.capture(p));
    } catch {
      failed = true;
      return;
    }
    handle.setMode(mode);
    handle.canvas.dataset.testid = "scene";
    handle.canvas.setAttribute("data-testid", "scene");
    handle.canvas.setAttribute("aria-label", `The ${room.name}, in 3D`);
    // While the mouse is captured, clicks are delivered to the canvas rather than the prompt, so a click there releases it.
    const canvas = handle.canvas;
    canvas.addEventListener("click", () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); });
    host.prepend(canvas);
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
    {#if !touch}
      <button type="button" class="prompt" data-testid="look-prompt" onclick={toggleLook}>
        {locked ? "Esc to release" : "Click to look around"}
      </button>
    {/if}
    <button type="button" class="mode" data-testid="controls-toggle" onclick={toggleMode}>{modeLabel}</button>
    {#if touch && mode === "direct"}
      <div
        class="stick"
        data-testid="joystick"
        role="presentation"
        onpointerdown={stickDown}
        onpointermove={stickMove}
        onpointerup={stickUp}
        onpointercancel={stickUp}
      >
        <div class="knob" style:transform="translate({knob.x}px, {knob.y}px)"></div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .scene { position: relative; width: 100%; height: 50vh; min-height: 240px; background: #1d2229; }
  .scene :global(canvas) { width: 100%; height: 100%; display: block; touch-action: none; }
  .mode { position: absolute; right: 0.5rem; top: 0.5rem; min-width: 44px; min-height: 44px; }
  .stick { position: absolute; left: 1rem; bottom: 0.75rem; width: 120px; height: 120px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); border: 2px solid rgba(255, 255, 255, 0.4); touch-action: none; display: grid; place-items: center; }
  .knob { width: 48px; height: 48px; border-radius: 50%; background: rgba(255, 255, 255, 0.6); pointer-events: none; }
  .prompt { min-height: 44px; position: absolute; left: 50%; bottom: 0.75rem; transform: translateX(-50%); }
</style>
