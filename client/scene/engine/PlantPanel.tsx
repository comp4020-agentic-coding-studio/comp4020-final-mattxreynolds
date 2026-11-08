// Aux Machinery Room: the GENERATOR PLANT panel on the west wall, facing the
// doorway. LOAD vs OUTPUT bar meter (numbers + a marked output line; any
// excess is hatched and labelled OVER), HEAT gauge (red from 70, trips at
// 100), a big TRIPPED lamp, the WEAR plate and the RESET button (gridReset).
// The Engineer sees the plant; the Bridge sees where the load goes.

import { useCallback } from "react";
import { send } from "../../net.ts";
import { IDS } from "../ids.ts";
import { Interactable } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { Dial, Lamp, type DialSpec } from "../parts.tsx";
import { At, B, C, CanvasPlane, ev, G, M, Plate, shipLive, STENCIL, useEVs } from "./kit.tsx";
import { AUX_AT, FACE, RESET_AT } from "./layout.ts";

const HEAT_SPEC: DialSpec = {
  min: 0,
  max: 100,
  ticks: [0, 20, 40, 60, 80, 100].map((v) => ({ v, label: String(v) })),
  minor: 5,
  title: "HEAT %",
  subtitle: "TRIPS AT 100",
  zones: [
    { from: 50, to: 70, color: "rgba(224,179,31,0.45)" },
    { from: 70, to: 100, color: "rgba(192,40,28,0.75)" },
  ],
  marks: [{ v: 100, color: "#8a1a10", text: "TRIP" }],
};

/** Fixed scale so the bar's length always means the same thing. */
const SCALE_MAX = 16;

/** LOAD vs OUTPUT: numbered scale, a bar for load, a bold output line. */
export function drawLoadMeter(ctx: CanvasRenderingContext2D, W: number, H: number, load: number, output: number, tripped: boolean): void {
  ctx.fillStyle = PALETTE.dialFace;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PALETTE.dialInk;
  ctx.lineWidth = W * 0.008;
  ctx.strokeRect(W * 0.01, W * 0.01, W - W * 0.02, H - W * 0.02);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.dialInk;
  ctx.font = `900 ${H * 0.11}px ${STENCIL}`;
  ctx.fillText("LOAD  vs  OUTPUT", W / 2, H * 0.1);

  const x0 = W * 0.06;
  const x1 = W * 0.94;
  const xOf = (v: number) => x0 + (Math.min(SCALE_MAX, Math.max(0, v)) / SCALE_MAX) * (x1 - x0);
  const barTop = H * 0.3;
  const barH = H * 0.24;
  // bar trough
  ctx.fillStyle = "#c9bfa6";
  ctx.fillRect(x0, barTop, x1 - x0, barH);
  // load within output: solid dark bar
  const within = Math.min(load, output);
  ctx.fillStyle = tripped ? "#6b6b62" : "#2d5a3a";
  ctx.fillRect(x0, barTop, xOf(within) - x0, barH);
  // excess beyond output: red with diagonal hatching (pattern, not just colour)
  if (load > output) {
    const ex0 = xOf(output);
    const ex1 = xOf(load);
    ctx.fillStyle = "#b8322a";
    ctx.fillRect(ex0, barTop, ex1 - ex0, barH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ex0, barTop, ex1 - ex0, barH);
    ctx.clip();
    ctx.strokeStyle = "#1b1b1b";
    ctx.lineWidth = W * 0.01;
    for (let x = ex0 - barH; x < ex1 + barH; x += W * 0.03) {
      ctx.beginPath();
      ctx.moveTo(x, barTop + barH);
      ctx.lineTo(x + barH, barTop);
      ctx.stroke();
    }
    ctx.restore();
  }
  // scale ticks + numbers
  ctx.strokeStyle = PALETTE.dialInk;
  ctx.fillStyle = PALETTE.dialInk;
  ctx.font = `900 ${H * 0.085}px ${STENCIL}`;
  for (let v = 0; v <= SCALE_MAX; v++) {
    const x = xOf(v);
    const major = v % 2 === 0;
    ctx.lineWidth = W * (major ? 0.006 : 0.003);
    ctx.beginPath();
    ctx.moveTo(x, barTop + barH);
    ctx.lineTo(x, barTop + barH + H * (major ? 0.07 : 0.035));
    ctx.stroke();
    if (major) ctx.fillText(String(v), x, barTop + barH + H * 0.14);
  }
  // output line: a thick black bar across the trough with a tag above
  const ox = xOf(output);
  ctx.fillStyle = "#111";
  ctx.fillRect(ox - W * 0.008, barTop - H * 0.07, W * 0.016, barH + H * 0.1);
  ctx.font = `900 ${H * 0.085}px ${STENCIL}`;
  const tag = `OUTPUT ${output}`;
  const tw = ctx.measureText(tag).width + W * 0.03;
  const tx = Math.max(x0 + tw / 2, Math.min(x1 - tw / 2, ox));
  ctx.fillRect(tx - tw / 2, barTop - H * 0.15, tw, H * 0.09);
  ctx.fillStyle = "#fff";
  ctx.fillText(tag, tx, barTop - H * 0.105);
  // readout line
  const over = load - output;
  ctx.font = `900 ${H * 0.11}px ${STENCIL}`;
  ctx.fillStyle = tripped ? "#8a1a10" : over > 0 ? "#8a1a10" : PALETTE.dialInk;
  const txt = tripped ? `GRID DEAD · LOAD ${load}` : over > 0 ? `LOAD ${load} · OVER +${over}` : `LOAD ${load} · HEADROOM ${-over}`;
  ctx.fillText(txt, W / 2, H * 0.87, W * 0.92);
}

function LoadMeter() {
  const [load, output, tripped] = useEVs((v) => [v?.grid.load ?? 0, v?.grid.output ?? 10, v?.grid.tripped ?? false] as [number, number, boolean]);
  return (
    <CanvasPlane
      w={0.95}
      h={0.56}
      px={640}
      glow={0.45}
      deps={[load, output, tripped]}
      draw={(ctx, W, H) => drawLoadMeter(ctx, W, H, load, output, tripped)}
    />
  );
}

/** The RESET prompt for a given plant state (exported for tests). */
export function resetPrompt(live: boolean, tripped: boolean, ready: boolean): string {
  if (!live) return "Generator RESET — plant not on line";
  if (!tripped) return "Generator running — RESET not needed";
  if (!ready) return "Generator RESET — tripped, cooling…";
  return "E to reset generator";
}

function ResetButton() {
  const m = M();
  const [live, tripped, ready] = useEVs((v) => [shipLive(v?.phase ?? "LOBBY"), v?.grid.tripped ?? false, v?.grid.resetReady ?? false] as [boolean, boolean, boolean]);
  const reset = useCallback(() => void send({ t: "gridReset" }), []);
  const armed = live && tripped && ready;
  // Not tripped: no prompt at all (disabled). Tripped but cooling: still
  // aimable, and a press is sent so the server's refusal is toasted.
  return (
    <group position={[RESET_AT.x, RESET_AT.y, 0.08]}>
      {/* yellow guard collar with a black mushroom head: red when it will take */}
      <mesh geometry={G().torus} material={m.hazard} scale={[0.36, 0.36, 1.2]} />
      <Interactable id={IDS.gridReset} prompt={resetPrompt(live, tripped, ready)} onUse={live && tripped ? reset : undefined} disabled={!live || !tripped}>
        <C p={[0, 0, 0.03]} d={0.26} l={0.06} m={m.enamel} r={[Math.PI / 2, 0, 0]} />
        <C p={[0, 0, armed ? 0.09 : 0.075]} d={0.2} l={0.06} m={armed ? m.valveRed : m.lampOff} r={[Math.PI / 2, 0, 0]} />
      </Interactable>
      <Plate text="RESET" w={0.3} h={0.08} position={[0, 0.25, 0]} border={PALETTE.hazardYellow} glow={0.8} />
      <Plate text="PUSH" w={0.14} h={0.05} position={[0, 0, 0.125]} bg="#5a1610" glow={armed ? 0.9 : 0.2} />
    </group>
  );
}

export function PlantPanel() {
  const m = M();
  const [tripped, ready, wear, output] = useEVs(
    (v) => [v?.grid.tripped ?? false, v?.grid.resetReady ?? false, v?.grid.wear ?? 0, v?.grid.output ?? 10] as [boolean, boolean, number, number],
  );
  return (
    <At p={AUX_AT.panel} r={[0, FACE.west, 0]}>
      {/* cabinet */}
      <B p={[0, 1.3, 0.1]} s={[2.1, 2.2, 0.2]} m={m.cabinet} />
      <B p={[0, 1.42, 0.205]} s={[1.95, 1.7, 0.01]} m={m.enamel} />
      <B p={[0, 0.1, 0.12]} s={[2.15, 0.2, 0.24]} m={m.pipeDark} />
      <Plate text="GENERATOR PLANT" w={1.4} h={0.16} position={[0, 2.25, 0.215]} glow={0.75} />
      <group position={[0, 0, 0.215]}>
        {/* left column: load vs output, wear */}
        <group position={[-0.45, 1.8, 0.002]}>
          <LoadMeter />
        </group>
        <Plate
          text={wear > 0 ? `DERATED −${wear} · OUTPUT ${output}` : `RATED · OUTPUT ${output}`}
          w={0.95}
          h={0.1}
          position={[-0.45, 1.42, 0.002]}
          bg={wear > 0 ? "#4a3010" : PALETTE.plateBg}
          border={wear > 0 ? PALETTE.lampAmber : undefined}
          glow={0.7}
        />
        <Plate text={"WEAR: EACH TRIP DERATES\nTHE MACHINE BY 1"} w={0.95} h={0.13} position={[-0.45, 1.25, 0.002]} glow={0.45} />
        {/* right column: heat + tripped */}
        <Dial position={[0.5, 1.8, 0.01]} diameter={0.52} spec={HEAT_SPEC} specKey="heat" value={() => ev()?.grid.heat ?? 0} />
        <Lamp
          position={[0.28, 1.36, 0.02]}
          color={PALETTE.lampRed}
          size={0.11}
          level={() => {
            const v = ev();
            if (!v?.grid.tripped) return 0;
            return Math.sin(performance.now() / 140) > 0 ? 1 : 0.35;
          }}
        />
        <Plate text={tripped ? "TRIPPED" : "TRIP"} w={0.38} h={0.13} position={[0.6, 1.36, 0.002]} bg={tripped ? "#6a1810" : PALETTE.plateBg} glow={tripped ? 1.1 : 0.4} />
        {/* bottom row: reset + ready lamp */}
        <ResetButton />
        <Lamp position={[0.42, RESET_AT.y + 0.03, 0.02]} color={PALETTE.lampGreen} size={0.07} level={() => (ev()?.grid.resetReady ? 1 : 0)} />
        <Plate
          text={!tripped ? "RUNNING" : ready ? "READY" : "COOLING"}
          w={0.32}
          h={0.09}
          position={[0.66, RESET_AT.y + 0.03, 0.002]}
          bg={!tripped ? "#1d5a33" : ready ? "#1d5a33" : "#4a3010"}
          glow={0.8}
        />
        <Plate text={"SHED LOAD FIRST\nA HOT SET TRIPS AGAIN"} w={0.62} h={0.12} position={[-0.6, RESET_AT.y + 0.03, 0.002]} border={PALETTE.hazardYellow} glow={0.55} />
      </group>
      {/* cable gland trunk to the deckhead */}
      <B p={[0.75, 2.75, 0.08]} s={[0.3, 0.5, 0.12]} m={m.pipeDark} />
    </At>
  );
}
