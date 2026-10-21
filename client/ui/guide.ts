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
      title: "FLOOD CONTROL",
      you: "The BILGE SUCTION MANIFOLD is on the wall opposite the switchboard.",
      partner: "has the water levels and the pump switches.",
    },
    NAVIGATOR: {
      title: "FLOOD CONTROL",
      you: "The DAMAGE CONTROL map and pump switches are on the right-hand console under the windows.",
      partner: "has the suction valves and their pressure gauges.",
    },
  },
  RADIO: {
    ENGINEER: {
      title: "DISTRESS SIGNAL",
      you: "The W/T TRANSMITTER cabinet is at the far end of the switchboard wall.",
      partner: "has the tuner, the station chart and the codebook.",
    },
    NAVIGATOR: {
      title: "DISTRESS SIGNAL",
      you: "The RADIO DESK is on the left wall, with the chart table and codebook nearby.",
      partner: "has the resonance meter, the pulse lamp and the antenna.",
    },
  },
  ESCAPE: {
    ENGINEER: {
      title: "ABANDON SHIP",
      you: "The hand pump, watertight door and ABANDON lever share the end wall, away from the generator.",
      partner: "knows the pressure the door rams need, and holds the release.",
    },
    NAVIGATOR: {
      title: "ABANDON SHIP",
      you: "The DOOR RAMS panel is on the back wall, opposite the windows.",
      partner: "pumps the pressure and sees the door itself.",
    },
  },
};
