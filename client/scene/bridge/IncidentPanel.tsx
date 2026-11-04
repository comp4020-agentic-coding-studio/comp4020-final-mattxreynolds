// The compartment fire, Bridge's half: the damage-control FIRE CARD. It shows
// where it burns, how bad, and the procedure book: for each class mark, the
// isolator marks to throw in order. It does not say which class is burning:
// the Engineer reads that off the smoke plate. Mount in the Comms Room:
// <IncidentPanel position={[x, y, z]} rotationY={...} />.

import { COMPARTMENT_LABEL, type Compartment, type Glyph } from "../../../shared/glyphs.ts";
import { useCanvasTexture } from "../canvasTexture.ts";
import { drawGlyph } from "../glyphDraw.ts";
import { PALETTE } from "../palette.ts";
import { Block, MAT, Plate, Screen } from "./kit.tsx";
import { useNav, useNavSlice } from "./state.ts";

type Fire = {
  state: string;
  compartment: Compartment | null;
  intensity: number;
  done: number;
  steps: number;
  locked: boolean;
  book: { kind: Glyph; sequence: Glyph[] }[];
};
const NONE: Fire = { state: "idle", compartment: null, intensity: 0, done: 0, steps: 4, locked: false, book: [] };

export function IncidentPanel({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const gridDown = useNav((v) => v.ship.gridDown, false);
  const fire = useNavSlice((v): Fire => ({ ...v.fire, intensity: Math.round(v.fire.intensity / 5) * 5 }), NONE);
  const map = useCanvasTexture(
    1024,
    640,
    (ctx, w, h) => {
      ctx.fillStyle = PALETTE.screen;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.screenInk;
      ctx.strokeStyle = PALETTE.screenInk;
      ctx.textAlign = "left";
      ctx.font = "bold 44px monospace";
      const head =
        fire.state === "burning"
          ? `FIRE: ${fire.compartment ? COMPARTMENT_LABEL[fire.compartment] : "?"}  [${fire.intensity}%]`
          : fire.state === "out"
            ? "FIRE OUT"
            : fire.state === "burnt"
              ? "FLASHOVER: SEAM CRACKED"
              : "DAMAGE CONTROL: NO FIRE";
      ctx.fillText(head, 30, 64);
      ctx.font = "bold 28px monospace";
      if (fire.state === "burning") {
        ctx.fillText(`ENGINEER: ${fire.done}/${fire.steps} ISOLATED${fire.locked ? "  PANEL LOCKED" : ""}${gridDown ? "  GRID DOWN" : ""}`, 30, 108);
      } else ctx.fillText("PROCEDURE BOOK: ISOLATOR ORDER BY CLASS MARK", 30, 108);
      // the book: one row per class, mark then the order of isolator marks
      fire.book.forEach((row, i) => {
        const y = 210 + i * 150;
        ctx.lineWidth = 5;
        ctx.strokeRect(30, y - 56, 110, 110);
        drawGlyph(ctx, row.kind, 85, y - 1, 78);
        ctx.font = "bold 40px monospace";
        ctx.fillText("=>", 160, y + 14);
        row.sequence.forEach((g, j) => {
          const x = 250 + j * 175;
          ctx.font = "bold 24px monospace";
          ctx.fillText(String(j + 1), x - 10, y - 40);
          ctx.strokeRect(x + 10, y - 56, 110, 110);
          drawGlyph(ctx, g, x + 65, y - 1, 78);
        });
      });
    },
    [fire, gridDown],
  );
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* slim wall cabinet behind the card */}
      <Block p={[0, 0.06, -0.05]} s={[1.7, 1.36, 0.08]} m={MAT.consoleDark} />
      <Block p={[0, 0.06, -0.012]} s={[1.64, 1.16, 0.01]} m={MAT.bezel} />
      <Screen map={map} width={1.6} height={1.0} flashOn={["fire"]} />
      <Plate text="DAMAGE CONTROL · FIRE" width={0.9} height={0.1} position={[0, 0.65, 0.0]} border={PALETTE.hazardYellow} />
    </group>
  );
}
