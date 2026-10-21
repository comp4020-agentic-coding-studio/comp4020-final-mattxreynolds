// Diegetic status board: the current phase in stencil letters, and a list of
// the ship's systems ticked off as phases complete. Never shows solutions.

import type { Phase } from "../../../shared/protocol.ts";
import { PALETTE } from "../palette.ts";
import { At, B, CanvasPlane, M, STENCIL, useStage } from "./kit.tsx";
import { AT } from "./layout.ts";

const TITLE: Partial<Record<Phase, string>> = {
  LOBBY: "STAND BY",
  PROLOGUE: "DEAD SHIP",
  POWER: "EMERGENCY POWER",
  FLOOD: "FLOOD CONTROL",
  RADIO: "DISTRESS SIGNAL",
  ESCAPE: "ABANDON SHIP",
  SURVIVED: "ALL HANDS OFF",
  LOST: "SHIP LOST",
};

const ROWS: [string, number][] = [
  ["EMERGENCY BUS", 2],
  ["GENERATOR", 3],
  ["BILGE", 4],
  ["RADIO", 5],
  ["ESCAPE", 6],
];

export function StatusBoard() {
  const m = M();
  const { phase, stage } = useStage();
  return (
    <At p={AT.statusBoard}>
      <B p={[0, 1.65, 0.03]} s={[0.92, 0.95, 0.06]} m={m.brassDark} />
      <CanvasPlane
        w={0.84}
        h={0.87}
        px={512}
        position={[0, 1.65, 0.065]}
        glow={0.6}
        deps={[phase, stage]}
        draw={(ctx, W, H) => {
          ctx.fillStyle = "#1a2422";
          ctx.fillRect(0, 0, W, H);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = PALETTE.plateText;
          ctx.font = `900 ${W * 0.065}px ${STENCIL}`;
          ctx.fillText("SHIP STATUS", W / 2, H * 0.08);
          ctx.fillStyle = phase === "LOST" ? "#ff6a5a" : PALETTE.lampAmber;
          ctx.font = `900 ${W * 0.1}px ${STENCIL}`;
          ctx.fillText(TITLE[phase] ?? phase, W / 2, H * 0.21, W * 0.92);
          ctx.strokeStyle = "rgba(239,230,207,0.4)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(W * 0.06, H * 0.3);
          ctx.lineTo(W * 0.94, H * 0.3);
          ctx.stroke();
          ctx.textAlign = "left";
          ROWS.forEach(([label, doneAt], i) => {
            const y = H * (0.39 + i * 0.13);
            const done = stage >= doneAt;
            const now = stage === doneAt - 1;
            ctx.font = `900 ${W * 0.06}px ${STENCIL}`;
            ctx.fillStyle = done ? "#7dffb2" : now ? PALETTE.lampAmber : "rgba(239,230,207,0.55)";
            // shape-coded status: ✔ done, ▶ now, ○ pending
            ctx.fillText(done ? "✔" : now ? "▶" : "○", W * 0.07, y);
            ctx.fillText(label, W * 0.18, y);
            ctx.textAlign = "right";
            ctx.font = `700 ${W * 0.045}px ${STENCIL}`;
            ctx.fillText(done ? "OK" : now ? "NOW" : "—", W * 0.93, y);
            ctx.textAlign = "left";
          });
        }}
      />
    </At>
  );
}
