// The compartment fire, Engineer's half (docs/SYSTEMS.md "Compartment fire").
// A FIRE PANEL: a smoke plate showing the class glyph and how thick the smoke
// is, five glyph-labelled isolator switches and a RE-ARM button. The panel
// never says where it burns or which order to throw: that is on the Bridge.
// Mount inside an <At> in the Aux room: <FirePanel />.

import { useCallback } from "react";
import { INCIDENT } from "../../../shared/config.ts";
import type { Glyph } from "../../../shared/glyphs.ts";
import { send } from "../../net.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { drawGlyph } from "../glyphDraw.ts";
import { Interactable } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { Lamp } from "../parts.tsx";
import { At, B, ev, M, Plate, STENCIL, useEVs } from "./kit.tsx";

function Roundel({ glyph, size, lit }: { glyph: Glyph | null; size: number; lit: boolean }) {
  const map = useCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = lit ? PALETTE.hazardYellow : PALETTE.dialFace;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = PALETTE.dialInk;
      ctx.fillStyle = PALETTE.dialInk;
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      if (glyph) drawGlyph(ctx, glyph, w / 2, h / 2, w * 0.62);
    },
    [glyph, lit],
  );
  return (
    <mesh scale={[size, size, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={map} toneMapped={false} fog={false} />
    </mesh>
  );
}

function SmokePlate() {
  const [state, smoke, symptom] = useEVs(
    (v) => [v?.fire.state ?? "idle", Math.round((v?.fire.smoke ?? 0) / 10) * 10, v?.fire.symptom ?? ""] as [string, number, string],
  );
  const burning = state === "burning";
  const map = useCanvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.plateBg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.plateText;
      ctx.textAlign = "center";
      ctx.font = `900 34px ${STENCIL}`;
      const label = state === "burning" ? "SMOKE DETECTED" : state === "out" ? "FIRE OUT" : state === "burnt" ? "FLASHOVER" : "SMOKE: CLEAR";
      ctx.fillText(label, w * 0.62, 56);
      // smoke bar: length, not colour
      ctx.strokeStyle = PALETTE.plateText;
      ctx.lineWidth = 4;
      ctx.strokeRect(w * 0.33, 100, w * 0.58, 36);
      ctx.fillRect(w * 0.33, 100, w * 0.58 * (smoke / 100), 36);
      ctx.font = `700 26px ${STENCIL}`;
      if (burning) {
        ctx.fillText(`SMOKE ${smoke}%`, w * 0.62, 180);
        ctx.font = `700 21px ${STENCIL}`;
        ctx.fillText("TELL BRIDGE THE MARK", w * 0.63, 220);
      }
      ctx.strokeStyle = PALETTE.hazardYellow;
      ctx.strokeRect(10, 10, 150, 236);
      if (symptom) {
        ctx.fillStyle = PALETTE.hazardYellow;
        drawGlyph(ctx, symptom as Glyph, 85, 128, 110);
      }
    },
    [state, smoke, symptom],
  );
  return (
    <mesh>
      <planeGeometry args={[1.0, 0.5]} />
      <meshBasicMaterial map={map} toneMapped={false} fog={false} />
    </mesh>
  );
}

function Isolator({ index, x }: { index: number; x: number }) {
  const m = M();
  const [glyph, thrown, live, locked] = useEVs(
    (v) => [v?.fire.isolators[index]?.glyph ?? "", v?.fire.isolators[index]?.thrown ?? false, v?.fire.state === "burning", v?.fire.locked ?? false] as [string, boolean, boolean, boolean],
  );
  const use = useCallback(() => void send({ t: "setIsolator", index, on: true }), [index]);
  const prompt = !live ? "Isolator: nothing burning" : locked ? "Panel locked after a wrong throw" : thrown ? "Isolator: THROWN" : "Isolator: E to throw";
  return (
    <At p={[x, 0, 0]}>
      <Interactable id={`fire-isolator-${index}`} prompt={prompt} onUse={live && !locked ? use : undefined} disabled={!live || locked}>
        <B p={[0, 0, 0.03]} s={[0.16, 0.34, 0.06]} m={m.enamel} />
        <B p={[0, thrown ? -0.08 : 0.08, 0.08]} s={[0.1, 0.14, 0.06]} m={thrown ? m.lampOff : m.valveRed} />
      </Interactable>
      <At p={[0, 0.26, 0.01]}>
        <Roundel glyph={(glyph || null) as Glyph | null} size={0.17} lit={thrown} />
      </At>
      <Plate text={thrown ? "ON" : "OFF"} w={0.16} h={0.06} position={[0, -0.26, 0.01]} glow={0.6} />
    </At>
  );
}

export function FirePanel() {
  const m = M();
  const live = useEVs((v) => [v?.fire.state === "burning"] as [boolean])[0];
  const rearm = useCallback(() => void send({ t: "setIsolator", index: 0, on: false }), []);
  const xs = Array.from({ length: INCIDENT.isolators }, (_, i) => -0.5 + i * 0.25);
  return (
    <group>
      <B p={[0, 0.125, -0.02]} s={[1.5, 1.7, 0.06]} m={m.cabinet} />
      <At p={[0, 0.71, 0.02]}>
        <SmokePlate />
      </At>
      <At p={[0, 0.1, 0.02]}>
        {xs.map((x, i) => (
          <Isolator key={i} index={i} x={x} />
        ))}
      </At>
      <At p={[0, -0.42, 0.02]}>
        <Interactable id="fire-rearm" prompt={live ? "RE-ARM: clear the isolators, start the order again" : "Re-arm: nothing burning"} onUse={live ? rearm : undefined} disabled={!live}>
          <B p={[0, 0, 0.03]} s={[0.4, 0.12, 0.06]} m={m.hazard} />
        </Interactable>
        <Plate text="RE-ARM" w={0.3} h={0.07} position={[0, 0, 0.065]} glow={0.8} />
        <Lamp position={[0.35, 0, 0.02]} color={PALETTE.lampRed} size={0.07} level={() => (ev()?.fire.state === "burning" ? 1 : 0)} />
      </At>
      <Plate text={"FIRE ISOLATION\nORDER: FROM THE BRIDGE"} w={1.0} h={0.14} position={[0, -0.62, 0.02]} border={PALETTE.hazardYellow} glow={0.55} />
    </group>
  );
}
