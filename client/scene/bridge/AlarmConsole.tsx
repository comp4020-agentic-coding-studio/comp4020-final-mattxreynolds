// Prologue station + status board: the central forward console. Before the
// emergency bus is restored everything here is dead except the self-lit
// instruction plate and the rotating alarm beacon.

import { useCallback } from "react";
import { SHIP_PHASES } from "../../../shared/protocol.ts";
import { send } from "../../net.ts";
import { IDS } from "../ids.ts";
import { Interactable } from "../interact.tsx";
import { useCanvasTexture } from "../canvasTexture.ts";
import { PALETTE } from "../palette.ts";
import { drawDead } from "./draw.ts";
import { ConsoleBody, Plate, PushButton, RISER_Z, Screen, Slope, SLOPE_AT, usePress } from "./kit.tsx";
import { AlarmBeacon } from "./Room.tsx";
import { drawStatus } from "./screens.ts";
import { useNav } from "./state.ts";

const W = 1.5;
const RISER = 1.0;

export function AlarmConsole({ position }: { position: [number, number, number] }) {
  const phase = useNav((v) => v.phase, "PROLOGUE");
  const busOn = useNav((v) => v.prologue.busOn, false);
  const acked = useNav((v) => v.prologue.acknowledged, false);
  const trend = useNav((v) => v.trend, "STABLE");
  const act = useNav((v) => v.act, 0);
  const gridDown = useNav((v) => v.ship.gridDown && SHIP_PHASES.includes(v.phase), false);
  // whole percent only while it matters (the CASCADE objective)
  const evac = useNav((v) => (v.phase === "CASCADE" ? Math.floor(v.ship.evac) : 0), 0);
  const { press, depth } = usePress();

  const status = useCanvasTexture(
    896,
    448,
    (ctx, w, h) => (busOn || phase !== "PROLOGUE" ? drawStatus(ctx, w, h, { phase, act, trend, acknowledged: acked, evac, gridDown }) : drawDead(ctx, w, h)),
    [busOn, phase, trend, acked, act, evac, gridDown],
  );

  const prologue = phase === "PROLOGUE";
  const plateText = !prologue
    ? "ALARM ACKNOWLEDGED"
    : !busOn
      ? "CONSOLES DEAD —\nENGINE ROOM MUST RESTORE\nEMERGENCY BUS"
      : acked
        ? "ALARM ACKNOWLEDGED"
        : "BUS RESTORED —\nACKNOWLEDGE ALARM";
  const plateFg = prologue && !acked ? (busOn ? PALETTE.lampAmber : "#ff8a7a") : PALETTE.plateText;

  const onUse = useCallback(() => {
    press();
    // before the bus is on the server rejects with "consoles dead" and the
    // client shows that reason; that rejection *is* the prologue's lesson
    if (prologue && !acked) void send({ t: "prologueAck" });
  }, [press, prologue, acked]);

  const prompt = !prologue
    ? "Alarm acknowledge — ACKNOWLEDGED · nothing to do"
    : !busOn
      ? "Alarm acknowledge — NO POWER · E to press"
      : acked
        ? "Alarm acknowledge — ACKNOWLEDGED"
        : "Alarm acknowledge — ALARM ACTIVE · E to acknowledge";

  return (
    <group position={position}>
      <ConsoleBody w={W} riserH={RISER}>
        <Screen map={status} width={0.96} height={0.48} position={[0, 0.9 + RISER - 0.28, RISER_Z]} delay={0.05} flashOn={["phase", "gridTrip", "evacCharged"]} />
        <Plate text={plateText} width={1.2} height={0.24} position={[0, 0.9 + 0.33, RISER_Z]} fg={plateFg} border={prologue && !acked ? PALETTE.hazardYellow : PALETTE.brassDark} />
        <Slope position={SLOPE_AT} angle={0.38}>
          <Plate text="ALARM ACKNOWLEDGE" width={0.62} height={0.09} position={[0, 0.15, 0.03]} border={PALETTE.brass} />
          <Interactable id={IDS.prologueAck} prompt={prompt} onUse={onUse}>
            <PushButton color="#d8301f" r={0.085} lit={busOn && prologue && !acked} blink depth={depth} />
          </Interactable>
          <Plate text={busOn ? "POWER" : "NO POWER"} width={0.22} height={0.06} position={[0.36, -0.06, 0.03]} fg={busOn ? PALETTE.lampGreen : "#8b8678"} />
        </Slope>
        <AlarmBeacon position={[0, 0.9 + RISER + 0.12, -0.25]} />
      </ConsoleBody>
    </group>
  );
}
