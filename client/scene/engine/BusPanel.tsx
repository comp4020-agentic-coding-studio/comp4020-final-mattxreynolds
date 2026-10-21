// PROLOGUE station: the EMERGENCY BUS knife lever (self-lit until thrown)
// and the BRIDGE LINK lamp that lights when the Bridge acknowledges.

import { useCallback } from "react";
import { send } from "../../net.ts";
import { IDS } from "../ids.ts";
import { Interactable } from "../interact.tsx";
import { PALETTE } from "../palette.ts";
import { Lamp, Lever } from "../parts.tsx";
import { At, B, ev, M, Plate, STAGE, useEV, useStage } from "./kit.tsx";
import { AT } from "./layout.ts";

export function BusPanel() {
  const m = M();
  const busOn = useEV((v) => v.prologue.busOn, false);
  const acked = useEV((v) => v.prologue.acknowledged, false);
  const { stage } = useStage();
  const live = stage === STAGE.PROLOGUE && !busOn;
  const pull = useCallback(() => void send({ t: "prologueBreaker" }), []);
  const prompt = busOn ? "Emergency bus lever — ON" : live ? "Emergency bus lever — OFF · E to pull down" : "Emergency bus lever — OFF";

  return (
    <At p={AT.busPanel}>
      {/* back plate + hazard surround */}
      <B p={[0, 1.35, 0.03]} s={[1.05, 1.5, 0.06]} m={m.hazard} />
      <B p={[0, 1.35, 0.08]} s={[0.9, 1.35, 0.06]} m={m.panel} />
      <Plate text="EMERGENCY BUS" w={0.84} h={0.2} position={[0, 1.88, 0.115]} border={PALETTE.hazardYellow} glow={0.9} />
      <Interactable id={IDS.prologueLever} prompt={prompt} onUse={live ? pull : undefined} position={[0, 1.25, 0.11]}>
        {/* knife-switch housing; a box big enough to aim at easily */}
        <B p={[0, 0, 0.04]} s={[0.4, 0.62, 0.08]} m={m.enamel} />
        <B p={[0, 0.22, 0.09]} s={[0.26, 0.05, 0.04]} m={m.brass} />
        <B p={[0, -0.22, 0.09]} s={[0.26, 0.05, 0.04]} m={m.brass} />
        {/* up = OFF, pulled down = ON */}
        <Lever position={[0, 0, 0.12]} angle={busOn ? Math.PI - 0.5 : 0.45} length={0.3} thickness={0.045} knob={PALETTE.valveRed} />
      </Interactable>
      <Plate text="OFF" w={0.2} h={0.1} position={[0.33, 1.47, 0.115]} bg={busOn ? PALETTE.plateBg : "#5a1a14"} glow={busOn ? 0.3 : 0.9} />
      <Plate text="ON" w={0.2} h={0.1} position={[0.33, 1.03, 0.115]} bg={busOn ? "#1d5a33" : PALETTE.plateBg} glow={busOn ? 0.9 : 0.3} />
      <Plate text={busOn ? "▼ BUS ON" : "PULL DOWN ▼"} w={0.6} h={0.11} position={[0, 0.82, 0.115]} bg={busOn ? "#1d5a33" : "#3a2a10"} glow={0.8} />
      {/* bridge link lamp */}
      <Lamp position={[-0.24, 0.65, 0.12]} color={PALETTE.lampGreen} size={0.07} level={() => (ev()?.prologue.acknowledged ? 1 : 0)} />
      <Plate text={acked ? "BRIDGE LINK\nUP" : "BRIDGE LINK\nDOWN"} w={0.42} h={0.14} position={[0.13, 0.65, 0.115]} glow={0.7} />
      {/* conduit to the switchboard */}
      <B p={[0.6, 2.25, 0.06]} s={[0.3, 0.06, 0.06]} m={m.pipeDark} />
    </At>
  );
}
