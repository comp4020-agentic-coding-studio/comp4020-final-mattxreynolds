<script lang="ts">
  import { onMount } from "svelte";
  import { SLOTS, type Slot, type WalkView } from "../shared/draw.ts";
  import { controlLive, displayText, examineText, roomForDeck, type Thing } from "../shared/rooms.ts";
  import type { InstrumentView } from "../shared/draw.ts";
  import type { DeckName, Pose } from "../shared/intents.ts";
  import { createPoseSaver } from "./pose.ts";
  import { buildScene, type SceneHandle } from "./scene.ts";
  import { controlsMode, saveControlsMode, stickVector, type ControlsMode } from "./controls.ts";

  // Mounted once per Deck view. State changes reach the scene only through
  // setOpened; the render loop never reads Svelte state (ADR 0006).
  let { deck, opened, voyageId, pose, clue = null, code = "", control = "keypad", onKey = () => {}, instrument = null, walk = null, plan = null, onStep = () => {} }: {
    deck: DeckName; opened: Slot[]; voyageId: string; pose: Pose | null;
    /** The mural's Clue, on the Deck that holds it. */
    clue?: string | null;
    /** The code typed so far on the keypad. */
    code?: string;
    /** Which controls the live opener takes: the keypad's digits or the lever bank. */
    control?: "keypad" | "levers";
    /** A keypad button pressed in the scene: a digit, "clear" or "enter". */
    onKey?: (key: string) => void;
    /** This Deck's half of the live finale's instrument, for the wall read-outs and the dial controls. */
    instrument?: InstrumentView | null;
    /** The Walker's view of the rotten floor, while it is live (#54). */
    walk?: WalkView | null;
    /** The trapdoor plan, for the Player who holds it. */
    plan?: string | null;
    onStep?: (dir: string) => void;
  } = $props();

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

  let seen = $state("");

  // Using a thing: show its text and log the examine through the intent pipeline. It is never a Strike (#52).
  function use(thing: Thing): void {
    // A keypad button works the same keypad as the 2D view while the opener is live (#53).
    // Only the live opener's own controls work; the other opener's buttons are just furniture.
    if (thing.press && thing.bank === control && !opened.includes("opener")) return onKey(thing.press);
    const live = new Set<Slot>(SLOTS.filter((s) => !opened.includes(s)).slice(0, 1));
    // a live finale's valve and trim controls turn their dial, the same intent as the 2D view (#55)
    if (thing.control && instrument && controlLive(thing.control, instrument)) {
      seen = "";
      void fetch(`/api/voyages/${voyageId}/intents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...thing.control, deck }),
      }).catch(() => {});
      return;
    }
    // the helm and telegraph finale has one dial a Deck, so the other rows are plates with nothing behind them (#64)
    seen = thing.control && instrument ? "Rusted solid." : examineText(thing, live);
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
    handle.setMode(mode);
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
    handle?.canvas.setAttribute("data-opened", opened.join(","));
  });
  $effect(() => {
    handle?.setScreen("clue", clue ?? "");
    handle?.setScreen("code", code.padEnd(4, "_").split("").join(" "));
    handle?.setScreen("order", code.padEnd(5, "_").split("").join(" "));
    if (clue) handle?.canvas.setAttribute("data-mural", clue);
    handle?.canvas.setAttribute("data-code", code);
  });
  $effect(() => {
    handle?.setFloor(walk ? { at: walk.at, lit: walk.lit.map((l) => ({ ...l })) } : null, onStep);
  });
  $effect(() => {
    handle?.setPlan(plan);
  });

  // The wall read-outs follow the Deck's view; the hold counts up between snapshots (#55).
  let arrived = Date.now();
  let tick = $state(0);
  $effect(() => {
    void instrument;
    arrived = Date.now();
    tick = 0;
  });
  $effect(() => {
    const timer = setInterval(() => tick++, 250);
    return () => clearInterval(timer);
  });
  $effect(() => {
    void tick;
    const launched = opened.includes("finale");
    handle?.setDisplays(Object.fromEntries(room.displays.map((d) => [d.id, displayText(d, instrument, Date.now() - arrived, launched)])));
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
    {#if seen}<p class="seen" data-testid="examine-text" role="status">{seen}</p>{/if}
  </div>
{/if}

<style>
  .scene { position: relative; width: 100%; height: 50vh; min-height: 240px; background: #1d2229; }
  .scene :global(canvas) { width: 100%; height: 100%; display: block; touch-action: none; }
  .mode { position: absolute; right: 0.5rem; top: 0.5rem; min-width: 44px; min-height: 44px; }
  .stick { position: absolute; left: 1rem; bottom: 0.75rem; width: 120px; height: 120px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); border: 2px solid rgba(255, 255, 255, 0.4); touch-action: none; display: grid; place-items: center; }
  .knob { width: 48px; height: 48px; border-radius: 50%; background: rgba(255, 255, 255, 0.6); pointer-events: none; }
  .prompt { min-height: 44px; position: absolute; left: 0.5rem; top: 0.5rem; } /* a corner, so it never covers a station the Player clicks */
  .seen { position: absolute; left: 50%; top: 0.75rem; transform: translateX(-50%); margin: 0; padding: 0.4rem 0.8rem; background: #000b; color: #fff; }
</style>
