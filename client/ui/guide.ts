// First-time orientation: for each phase and role, where to look in your own
// room and what your partner holds instead. Shown as a short banner when a
// phase starts and on the briefing card. Says *where*, never *how*: no
// solutions, no glyph names.

import type { Phase, Role } from "../../shared/protocol.ts";

/** `partner` completes the sentence "<callsign> in the <room> …". */
type Guide = { title: string; you: string; partner: string };

export const PHASE_GUIDE: Partial<Record<Phase, Record<Role, Guide>>> = {
  PROLOGUE: {
    ENGINEER: {
      title: "DEAD SHIP",
      you: "The EMERGENCY BUS lever is on the wall in front of you.",
      partner: "is in the dark until you restore power.",
    },
    NAVIGATOR: {
      title: "DEAD SHIP",
      you: "Your consoles are dead. The ALARM ACKNOWLEDGE button is on the centre console.",
      partner: "is the only one who can bring the power back.",
    },
  },
  POWER: {
    ENGINEER: {
      title: "EMERGENCY POWER",
      you: "The MAIN SWITCHBOARD (breakers and generator meter) is beside the bus lever.",
      partner: "has the routing diagram: which breakers feed what, and the generator's rating.",
    },
    NAVIGATOR: {
      title: "EMERGENCY POWER",
      you: "The ROUTING DIAGRAM is on the left-hand console under the windows.",
      partner: "has the breakers and their loads.",
    },
  },
  FLOOD: {
    ENGINEER: {
      title: "ACT II · FLOOD CONTROL",
      you: "The BILGE SUCTION MANIFOLD is on the wall opposite the switchboard. The AUX MACHINERY door in the generator wall is open now: the generator's heat gauge and RESET live there.",
      partner: "has the water levels and the pump switches — and sees when a compartment runs dry.",
    },
    NAVIGATOR: {
      title: "ACT II · FLOOD CONTROL",
      you: "The DAMAGE CONTROL map and pump switches are on the right-hand console under the windows. Warn the Engineer when a compartment runs dry.",
      partner: "has the suction valves and their pressure gauges, and the generator.",
    },
  },
  RADIO: {
    ENGINEER: {
      title: "ACT III · MAYDAY",
      you: "The W/T TRANSMITTER cabinet is at the far end of the switchboard wall.",
      partner: "has the tuner, the station chart and the codebook.",
    },
    NAVIGATOR: {
      title: "ACT III · MAYDAY",
      you: "The RADIO DESK is on the left wall, with the chart table and codebook nearby. The COMMS room is open (door on the right-hand bulkhead): its distribution panel switches the radio, lighting and evac circuits.",
      partner: "has the resonance meter, the pulse lamp and the antenna.",
    },
  },
  CASCADE: {
    ENGINEER: {
      title: "ACT IV · CASCADE",
      you: "Keep the generator out of the red (Aux Machinery), keep the right valves open as the hull gives way, and turn the antenna when a coast station calls.",
      partner: "is charging the evac accumulator, sees where the hull breaches and which bearing a station calls from.",
    },
    NAVIGATOR: {
      title: "ACT IV · CASCADE",
      you: "Switch on the EVAC accumulator in the COMMS room and keep it charging. Shed load the generator can't carry, chase breaches with the pumps, answer calls.",
      partner: "sees the generator's heat and output, and turns the antenna.",
    },
  },
  ESCAPE: {
    ENGINEER: {
      title: "ABANDON SHIP",
      you: "The hand pump, watertight door and ABANDON lever share the end wall, away from the generator. The water is still coming: keep the grid up.",
      partner: "knows the pressure the door rams need, holds the release, and must arm the lifeboat davits.",
    },
    NAVIGATOR: {
      title: "ABANDON SHIP",
      you: "ARM DAVITS in the COMMS room first (needs the accumulator powered and half charged), then the DOOR RAMS panel on the back wall.",
      partner: "pumps the pressure, sees the door itself and keeps the generator alive.",
    },
  },
};
