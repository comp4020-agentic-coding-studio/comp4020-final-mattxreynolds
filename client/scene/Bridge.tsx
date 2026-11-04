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
//
// The Comms Room (bridge/Comms.tsx) adjoins the starboard bulkhead (x = +5)
// through a watertight door at z 0…1.2 that opens from Act III (RADIO):
//
//   x=5 ─┬─ [ DISTRIBUTION ] ─┐  z=-3
//   door │                    [EVAC/DAVITS]
//        └─ [ CALL / ANSWER ] ┘  z=+3      x=10

import { useEffect } from "react";
import { onFx } from "../store.ts";
import { AlarmConsole } from "./bridge/AlarmConsole.tsx";
import { EscapePanel } from "./bridge/EscapePanel.tsx";
import { FloodConsole } from "./bridge/FloodConsole.tsx";
import { PowerConsole } from "./bridge/PowerConsole.tsx";
import { ChartTable, Codebook, RadioDesk } from "./bridge/RadioDesk.tsx";
import { Decor } from "./bridge/Decor.tsx";
import { Dressing, DRESS_SOLIDS } from "./bridge/Dressing.tsx";
import { CommsDressing, COMMS_SOLIDS } from "./bridge/CommsDressing.tsx";
import { COMMS_DOOR, RoomLights, RoomShell } from "./bridge/Room.tsx";
import { COMMS, CommsDoor, commsOpen, CommsRoom } from "./bridge/Comms.tsx";
import { Staged, Warm } from "./bridge/kit.tsx";
import { IncidentPanel } from "./bridge/IncidentPanel.tsx";
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
/** ms between staged station mounts */
const STAGE = 350;

const DOOR_W = COMMS_DOOR[1] - COMMS_DOOR[0];
const DOOR_Z = (COMMS_DOOR[0] + COMMS_DOOR[1]) / 2;

export const BRIDGE_LAYOUT: RoomLayout = {
  // the inner faces of the bulkheads (walls are 0.12 m thick), plus the
  // starboard doorway and the Comms Room beyond it
  bounds: [
    box(0, 0, 9.76, 7.76),
    box(4.95, DOOR_Z, 0.3, DOOR_W),
    box((COMMS.x0 + COMMS.x1) / 2, (COMMS.z0 + COMMS.z1) / 2, COMMS.x1 - COMMS.x0, COMMS.z1 - COMMS.z0),
  ],
  // the watertight door is solid until the distress phase (roomOpen COMMS)
  doors: [{ box: box(4.94, DOOR_Z, 0.14, DOOR_W), open: commsOpen }],
  solids: [
    box(AT.power.x, AT.power.z, AT.power.w, DEPTH),
    box(AT.alarm.x, AT.alarm.z, AT.alarm.w, DEPTH),
    box(AT.flood.x, AT.flood.z, AT.flood.w, DEPTH),
    box(AT.radio.x, AT.radio.z, DEPTH, AT.radio.w),
    box(AT.chart.x, AT.chart.z, 1.24, 1.05),
    ...Object.values(DRESS_SOLIDS).map((d) => box(d.x, d.z, d.w, d.d)),
    ...Object.values(COMMS_SOLIDS).map((d) => box(d.x, d.z, d.w, d.d)),
    // Comms Room furniture
    box(COMMS.dist.x, COMMS.dist.z, COMMS.dist.w, DEPTH),
    box(COMMS.call.x, COMMS.call.z, COMMS.call.w, DEPTH),
    box(COMMS.x1 - COMMS.evac.d / 2, COMMS.evac.z, COMMS.evac.d, COMMS.evac.w),
    // the door leaf's pocket on the Comms side once it has slid open
    box(5.04, COMMS_DOOR[0] - DOOR_W / 2 - 0.05, 0.1, DOOR_W + 0.1),
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
      <Warm>
        <RoomShell />
        <CommsDoor />
        <AlarmConsole position={[AT.alarm.x, 0, AT.alarm.z]} />
      </Warm>
      {/* staged mount: see Staged in bridge/kit.tsx */}
      <Staged after={STAGE}>
        <PowerConsole position={[AT.power.x, 0, AT.power.z]} />
      </Staged>
      <Staged after={STAGE * 2}>
        <FloodConsole position={[AT.flood.x, 0, AT.flood.z]} />
      </Staged>
      <Staged after={STAGE * 3}>
        <RadioDesk position={[AT.radio.x, 0, AT.radio.z]} rotationY={Math.PI / 2} />
      </Staged>
      <Staged after={STAGE * 4}>
        <ChartTable position={[AT.chart.x, 0, AT.chart.z]} />
        <Codebook position={[AT.codebook.x, 1.5, AT.codebook.z]} rotationY={Math.PI / 2} />
      </Staged>
      <Staged after={STAGE * 5}>
        <EscapePanel position={[AT.escape.x, 0, AT.escape.z]} rotationY={Math.PI} />
      </Staged>
      <Staged after={STAGE * 6}>
        <Decor />
        <Dressing />
      </Staged>
      <Staged after={STAGE * 7}>
        <CommsRoom />
        <CommsDressing />
        {/* compartment fire card (ADR 006): Comms west bulkhead, beside the door */}
        <IncidentPanel position={[COMMS.x0 + 0.1, 1.55, -0.78]} rotationY={Math.PI / 2} />
      </Staged>
    </group>
  );
}
