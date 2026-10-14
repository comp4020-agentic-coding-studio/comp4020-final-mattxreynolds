import { describe, expect, it } from "vitest";
import { inReach, projectedSize, ROOMS, type Room, type Stance, type Thing } from "../shared/rooms.ts";

// The 44 px sweep (#18, #51): every control a Player presses in a scene, in
// either Room, measures 44 px or more at 390x844. The scene is 50vh tall, so
// the view is 390x422. A control is measured from the furthest spot within
// reach, looking straight at it, which is the smallest it will ever look.
// Controls come from Room data, so a button added to a Room is swept with no
// edit here: the keypad digits, the lever bank and the finale's dials.
const PHONE = { width: 390, height: 422 };
const MIN = 44;

// a control on the east wall is seen looking east, one on the north wall looking north
function farthestFace(room: Room, t: Thing): Stance {
  if (t.x > room.width - 0.5) return { x: t.x - (room.reach - 0.1), z: t.z, yaw: -Math.PI / 2 };
  return { x: t.x, z: t.z + (room.reach - 0.1), yaw: 0 };
}

for (const room of ROOMS) {
  describe(`${room.name} at 390x844`, () => {
    const pressed = room.things.filter((t) => t.press !== undefined || t.control !== undefined);

    it("has controls to sweep", () => {
      expect(pressed.length).toBeGreaterThan(0);
    });

    for (const t of pressed) {
      it(`${t.id} measures ${MIN} px or more from the furthest spot within reach`, () => {
        const far = farthestFace(room, t);
        expect(inReach(room, far, t), "in reach").toBe(true);
        const px = projectedSize(room, far, t, PHONE);
        expect(Math.min(px.width, px.height)).toBeGreaterThanOrEqual(MIN);
      });
    }
  });
}
