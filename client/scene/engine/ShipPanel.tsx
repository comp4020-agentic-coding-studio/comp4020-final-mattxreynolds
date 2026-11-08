// Ship systems repeater on the east bulkhead's north end, beside the
// transmitter: the EVAC ACCUMULATOR charge gauge (both seats see the charge),
// and the COAST STATION CALLING lamp with its answered / missed tally. The
// bearing of a calling station is the Bridge's alone: the plate says so.
// Indicator only: nothing here is interactable.

import { PALETTE } from "../palette.ts";
import { Dial, Lamp, type DialSpec } from "../parts.tsx";
import { At, B, ev, M, Plate, useEVs } from "./kit.tsx";
import { FACE, SHIP_PANEL_AT } from "./layout.ts";

const EVAC_SPEC: DialSpec = {
  min: 0,
  max: 100,
  ticks: [0, 25, 50, 75, 100].map((v) => ({ v, label: String(v) })),
  minor: 5,
  title: "EVAC %",
  subtitle: "ACCUMULATOR",
  zones: [{ from: 50, to: 100, color: "rgba(57,160,90,0.4)" }],
  marks: [{ v: 50, color: "#1b1b1b", text: "DAVITS" }],
};

export function ShipPanel() {
  const m = M();
  const [online, calling, answered, missed, charge] = useEVs(
    (v) =>
      [v?.ship.evacOnline ?? false, v?.ship.calling ?? false, v?.ship.callsAnswered ?? 0, v?.ship.callsMissed ?? 0, Math.round(v?.ship.evac ?? 0)] as [
        boolean,
        boolean,
        number,
        number,
        number,
      ],
  );
  return (
    <At p={SHIP_PANEL_AT} r={[0, FACE.east, 0]}>
      <B p={[0, 1.55, 0.04]} s={[1.05, 1.6, 0.08]} m={m.panel} />
      <Plate text="SHIP SYSTEMS REPEATER" w={0.95} h={0.1} position={[0, 2.28, 0.085]} glow={0.7} />
      {/* evac accumulator */}
      <Dial position={[0, 1.88, 0.09]} diameter={0.5} spec={EVAC_SPEC} specKey="evac" value={() => ev()?.ship.evac ?? 0} />
      <Lamp position={[-0.32, 1.52, 0.1]} color={PALETTE.lampGreen} size={0.055} level={() => (ev()?.ship.evacOnline ? 1 : 0)} />
      <Plate
        text={`${online ? "CHARGING" : "EVAC OFF"} · ${charge}%`}
        w={0.56}
        h={0.09}
        position={[0.06, 1.52, 0.085]}
        bg={online ? "#1d5a33" : PALETTE.plateBg}
        glow={0.7}
      />
      {/* coast-station call */}
      <B p={[0, 1.08, 0.085]} s={[0.95, 0.5, 0.01]} m={m.enamel} />
      <Lamp
        position={[-0.34, 1.18, 0.1]}
        color={PALETTE.lampAmber}
        size={0.075}
        level={() => (ev()?.ship.calling ? (Math.sin(performance.now() / 160) > 0 ? 1 : 0.15) : 0)}
      />
      <Plate
        text={calling ? "COAST STATION\nCALLING" : "COAST STATION\nSILENT"}
        w={0.6}
        h={0.17}
        position={[0.1, 1.18, 0.092]}
        bg={calling ? "#5a3a08" : PALETTE.plateBg}
        border={calling ? PALETTE.lampAmber : undefined}
        glow={calling ? 1.1 : 0.45}
      />
      <Plate text={`ANSWERED ${answered} · MISSED ${missed}`} w={0.85} h={0.08} position={[0, 1.0, 0.092]} glow={0.6} />
      <Plate text="BEARING FROM BRIDGE → AIM ANTENNA" w={0.85} h={0.065} position={[0, 0.9, 0.092]} glow={0.45} />
    </At>
  );
}
