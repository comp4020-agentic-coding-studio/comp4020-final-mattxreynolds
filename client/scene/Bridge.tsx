// Bridge (Radio Officer / Navigator). A compact radio room: forward consoles
// under the windows (routing diagram · alarm + status · damage control), the
// radio desk and codebook along the port bulkhead, a chart table mid-room and
// the door-ram panel on the aft bulkhead. Components live in ./bridge/.
//
// Plan (x right, z aft; the room is 10 × 8 m, spawn faces forward = -Z):
//
//   z=-4  [ POWER ]   [ ALARM/STATUS ]   [ FLOOD ]      ← windows
//         R
//         A        [CHART]
//         D             (spawn)
//         I
//   z=+4  O codebook                 [ DOOR RAMS ]

import { useEffect } from "react";
import { onFx } from "../store.ts";
import { AlarmConsole } from "./bridge/AlarmConsole.tsx";
import { EscapePanel } from "./bridge/EscapePanel.tsx";
import { FloodConsole } from "./bridge/FloodConsole.tsx";
import { PowerConsole } from "./bridge/PowerConsole.tsx";
import { ChartTable, Codebook, RadioDesk } from "./bridge/RadioDesk.tsx";
import { Decor } from "./bridge/Decor.tsx";
import { RoomLights, RoomShell } from "./bridge/Room.tsx";
import { fxClock, nowS } from "./bridge/state.ts";
import { box, type RoomLayout } from "./colliders.ts";

/** Station placement (shared by the scene and the collision layout). */
const AT = {
  power: { x: -3.05, z: -3.48, w: 1.9 },
  alarm: { x: 0, z: -3.48, w: 1.5 },
  flood: { x: 3.0, z: -3.48, w: 2.0 },
  radio: { x: -4.48, z: 0.7, w: 2.8 },
  chart: { x: -1.7, z: 1.0 },
  codebook: { x: -4.87, z: 2.95 },
  escape: { x: 2.4, z: 3.87 },
} as const;
const DEPTH = 0.8;

export const BRIDGE_LAYOUT: RoomLayout = {
  // the inner faces of the bulkheads (walls are 0.12 m thick)
  bounds: box(0, 0, 9.76, 7.76),
  solids: [
    box(AT.power.x, AT.power.z, AT.power.w, DEPTH),
    box(AT.alarm.x, AT.alarm.z, AT.alarm.w, DEPTH),
    box(AT.flood.x, AT.flood.z, AT.flood.w, DEPTH),
    box(AT.radio.x, AT.radio.z, DEPTH, AT.radio.w),
    box(AT.chart.x, AT.chart.z, 1.24, 1.05),
  ],
  spawn: [0, 1.6, 1.4],
  spawnYaw: 0,
};

export function Bridge() {
  // one-shot effects stamp the fx clock; screens and lights read it in useFrame
  useEffect(() => onFx((fx) => void (fxClock[fx.k] = nowS())), []);

  return (
    <group>
      <RoomLights />
      <RoomShell />
      <Decor />
      <PowerConsole position={[AT.power.x, 0, AT.power.z]} />
      <AlarmConsole position={[AT.alarm.x, 0, AT.alarm.z]} />
      <FloodConsole position={[AT.flood.x, 0, AT.flood.z]} />
      <RadioDesk position={[AT.radio.x, 0, AT.radio.z]} rotationY={Math.PI / 2} />
      <ChartTable position={[AT.chart.x, 0, AT.chart.z]} />
      <Codebook position={[AT.codebook.x, 1.5, AT.codebook.z]} rotationY={Math.PI / 2} />
      <EscapePanel position={[AT.escape.x, 0, AT.escape.z]} rotationY={Math.PI} />
    </group>
  );
}
