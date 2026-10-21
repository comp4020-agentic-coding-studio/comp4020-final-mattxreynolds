// The room itself: deck, ceiling, bulkheads (east wall has the escape
// doorway cut out), ceiling beams, overhead pipe runs and some purposeful-
// looking but non-interactive clutter (pipes, conduit, a bench). Static: no
// per-frame work.

import { useMemo } from "react";
import { Shape, ExtrudeGeometry } from "three";
import { B, C, M, Pipe } from "./kit.tsx";
import { ESC, ROOM } from "./layout.ts";

/** A rounded-rectangle shape centred on x, base at y=0. */
export function roundRect(w: number, h: number, r: number, y0 = 0): Shape {
  const s = new Shape();
  const x0 = -w / 2;
  const x1 = w / 2;
  const y1 = y0 + h;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

export function Shell() {
  const m = M();
  const { w, d, h } = ROOM;
  // escape-door coaming: a thick rounded frame around the doorway
  const coaming = useMemo(() => {
    const outer = roundRect(ESC.doorW + 0.34, ESC.doorH + 0.3, 0.32, -0.02);
    outer.holes.push(roundRect(ESC.doorW, ESC.doorH, 0.22, 0.12));
    return new ExtrudeGeometry(outer, { depth: 0.16, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 8 });
  }, []);

  const dw = ESC.doorW + 0.34; // wall gap width at the east wall
  const sideLen = (d - dw) / 2;
  return (
    <group>
      {/* deck */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={m.deck}>
        <planeGeometry args={[w, d]} />
      </mesh>
      {/* ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, h, 0]} material={m.ceiling}>
        <planeGeometry args={[w, d]} />
      </mesh>
      {/* north / south / west walls */}
      <mesh position={[0, h / 2, -d / 2]} material={m.wall10}>
        <planeGeometry args={[w, h]} />
      </mesh>
      <mesh position={[0, h / 2, d / 2]} rotation={[0, Math.PI, 0]} material={m.wall10}>
        <planeGeometry args={[w, h]} />
      </mesh>
      <mesh position={[-w / 2, h / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={m.wall8}>
        <planeGeometry args={[d, h]} />
      </mesh>
      {/* east wall, in pieces around the doorway */}
      <mesh position={[w / 2, h / 2, -d / 2 + sideLen / 2]} rotation={[0, -Math.PI / 2, 0]} material={m.wall4}>
        <planeGeometry args={[sideLen, h]} />
      </mesh>
      <mesh position={[w / 2, h / 2, d / 2 - sideLen / 2]} rotation={[0, -Math.PI / 2, 0]} material={m.wall4}>
        <planeGeometry args={[sideLen, h]} />
      </mesh>
      <B p={[w / 2 + 0.05, (h + ESC.doorH + 0.3) / 2, 0]} s={[0.1, h - ESC.doorH - 0.3, dw]} m={m.cabinet} />
      <mesh geometry={coaming} material={m.steel} position={[w / 2 - 0.08, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />
      {/* fill the coaming corners so no gap shows beside the rounded frame */}
      <B p={[w / 2 + 0.05, 0.25, -dw / 2 + 0.1]} s={[0.12, 0.5, 0.2]} m={m.steel} />
      <B p={[w / 2 + 0.05, 0.25, dw / 2 - 0.1]} s={[0.12, 0.5, 0.2]} m={m.steel} />

      {/* ceiling beams (frames every 2 m) */}
      {[-4, -2, 0, 2, 4].map((x) => (
        <group key={x}>
          <B p={[x, h - 0.09, 0]} s={[0.16, 0.18, d]} m={m.beam} />
          <B p={[x, h / 2, -d / 2 + 0.02]} s={[0.16, h, 0.04]} m={m.beam} />
          <B p={[x, h / 2, d / 2 - 0.02]} s={[0.16, h, 0.04]} m={m.beam} />
        </group>
      ))}
      {/* skirting angle along the deck edge */}
      <B p={[0, 0.04, -d / 2 + 0.03]} s={[w, 0.08, 0.06]} m={m.pipeDark} />
      <B p={[0, 0.04, d / 2 - 0.03]} s={[w, 0.08, 0.06]} m={m.pipeDark} />
      <B p={[-w / 2 + 0.03, 0.04, 0]} s={[0.06, 0.08, d]} m={m.pipeDark} />

      {/* overhead pipe runs */}
      <Pipe a={[-5, 2.62, -3.7]} b={[5, 2.62, -3.7]} d={0.14} />
      <Pipe a={[-5, 2.74, -3.45]} b={[5, 2.74, -3.45]} d={0.08} m={m.brassDark} />
      <Pipe a={[-5, 2.65, 3.65]} b={[5, 2.65, 3.65]} d={0.18} />
      <Pipe a={[-4.7, 2.7, -4]} b={[-4.7, 2.7, 4]} d={0.12} />
      {/* pipe flanges */}
      {[-3, -1, 1, 3].map((x) => (
        <C key={x} p={[x, 2.62, -3.7]} d={0.22} l={0.05} m={m.pipeDark} r={[0, 0, Math.PI / 2]} />
      ))}
      {[-3.4, -0.6, 2.4].map((x) => (
        <C key={x} p={[x, 2.65, 3.65]} d={0.27} l={0.06} m={m.pipeDark} r={[0, 0, Math.PI / 2]} />
      ))}
      {/* vertical risers in the corners */}
      <Pipe a={[4.75, 0, -3.75]} b={[4.75, 3, -3.75]} d={0.16} />
      <Pipe a={[4.75, 0, 3.75]} b={[4.75, 3, 3.75]} d={0.16} />
      <Pipe a={[-4.75, 0, 3.75]} b={[-4.75, 3, 3.75]} d={0.2} />
      {/* deck grating strip in front of the switchboard */}
      <B p={[-0.85, 0.012, -3.05]} s={[3.2, 0.02, 0.9]} m={m.grille} />
      {/* workbench in the south-east corner */}
      <group position={[3.4, 0, 3.55]}>
        <B p={[0, 0.85, 0]} s={[1.6, 0.06, 0.7]} m={m.brassDark} />
        <B p={[-0.72, 0.42, 0]} s={[0.06, 0.84, 0.6]} m={m.steel} />
        <B p={[0.72, 0.42, 0]} s={[0.06, 0.84, 0.6]} m={m.steel} />
        <B p={[0, 0.2, 0]} s={[1.5, 0.04, 0.55]} m={m.steel} />
        <C p={[-0.4, 0.98, 0.05]} d={0.18} l={0.2} m={m.valveRed} />
        <B p={[0.3, 0.9, 0.1]} s={[0.4, 0.04, 0.25]} m={m.enamel} />
        <B p={[0.45, 0.97, -0.1]} s={[0.3, 0.1, 0.18]} m={m.green} />
      </group>
    </group>
  );
}
