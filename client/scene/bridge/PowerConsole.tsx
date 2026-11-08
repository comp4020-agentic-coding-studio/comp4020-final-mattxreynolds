// Phase 1 — the damaged routing diagram and the three system lamps. The
// Navigator has no controls here: pure interpretation.

import { SYSTEMS, type ShipSystem } from "../../../shared/glyphs.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { PALETTE } from "../palette.ts";
import { drawDead, drawStandby } from "./draw.ts";
import { ConsoleBody, Lamp, Plate, RISER_Z, Screen, Slope, SLOPE_AT } from "./kit.tsx";
import { drawPower, type PowerData } from "./screens.ts";
import { useNavSlice, useStationMode } from "./state.ts";

const W = 1.9;
const RISER = 1.05;
const EMPTY: PowerData = {
  diagram: [],
  shorted: "bolt",
  capacity: 0,
  fed: { PUMPS: false, RADIO: false, HELM: false },
  tripped: false,
  online: false,
};

const LAMP_LABEL: Record<ShipSystem, string> = { PUMPS: "PUMPS", RADIO: "RADIO", HELM: "HELM" };

export function PowerConsole({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const mode = useStationMode("POWER");
  const d = useNavSlice((v) => v.power, EMPTY);
  const map = useCanvasTexture(
    1024,
    640,
    (ctx, w, h) => {
      if (mode === "dead") drawDead(ctx, w, h);
      else if (mode === "standby" || d.diagram.length === 0) drawStandby(ctx, w, h, "ROUTING DIAGRAM", "STANDBY", "ACKNOWLEDGE THE ALARM TO BEGIN");
      else drawPower(ctx, w, h, mode === "done" ? { ...d, online: true, tripped: false, fed: { PUMPS: true, RADIO: true, HELM: true } } : d);
    },
    [mode, d],
  );
  const live = mode !== "dead";
  // once POWER is complete every system is fed (pumps locked running)
  const fed = (s: ShipSystem) => mode === "done" || (mode === "active" && d.fed[s]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <ConsoleBody w={W} riserH={RISER}>
        <Screen map={map} width={1.52} height={0.95} position={[0, 0.9 + RISER / 2 + 0.03, RISER_Z]} delay={0.15} flashOn={["powerOnline"]} />
        <Slope position={SLOPE_AT} angle={0.38}>
          <Plate text="SYSTEM FEED" width={0.5} height={0.07} position={[-0.55, 0.13, 0.03]} border={PALETTE.brassDark} />
          {SYSTEMS.map((s, i) => {
            const x = -0.64 + i * 0.36;
            const on = fed(s);
            return (
              <group key={s} position={[x, 0, 0]}>
                <Lamp on={on} color={PALETTE.lampGreen} r={0.045} position={[-0.12, 0.0, 0.01]} />
                <Plate text={LAMP_LABEL[s]} width={0.2} height={0.065} position={[0.06, 0.035, 0.03]} />
                <Plate
                  text={!live ? "" : on ? "FED" : "NO FEED"}
                  width={0.2}
                  height={0.06}
                  position={[0.06, -0.04, 0.03]}
                  fg={on ? PALETTE.lampGreen : "#9a9586"}
                />
              </group>
            );
          })}
          <Plate text={"VIEW ONLY · NO CONTROLS\nDIRECT THE ENGINE ROOM"} width={0.56} height={0.1} position={[0.6, 0.14, 0.03]} fg="#9a9586" />
          {live && d.capacity > 0 && (
            <Plate
              text={`GENERATOR RATED ${d.capacity}\nTOTAL LOAD MUST NOT EXCEED ${d.capacity}`}
              width={0.56}
              height={0.11}
              position={[0.6, 0.0, 0.03]}
              border={PALETTE.hazardYellow}
            />
          )}
        </Slope>
      </ConsoleBody>
    </group>
  );
}
