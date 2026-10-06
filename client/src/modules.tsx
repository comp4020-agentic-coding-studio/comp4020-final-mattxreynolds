import type { Action, RoomView } from "../../shared/view.ts";

// The Operator's side: the five modules, drawn from the room view. Every
// button sends an intent; the server decides whether it was right.
type Act = (a: Action) => void;

function Led({ done }: { done: boolean }) {
  return <span className={`led${done ? " done" : ""}`} aria-label={done ? "cleared" : "armed"} />;
}

export function Device({ view, clock, act }: { view: RoomView; clock: string; act: Act }) {
  const d = view.device!;
  const { solved } = view;
  const over = view.status === "over";
  const sequence = d.symbols
    .filter((s) => s.step !== null)
    .sort((a, b) => a.step! - b.step!)
    .map((s) => s.glyph);

  return (
    <div className="modules">
      <article className="module">
        <div className="module-top">
          <span>01 / WIRE ARRAY</span>
          <Led done={solved.wires} />
        </div>
        <h2>{d.wires.length} wires. One decision.</h2>
        <p>Describe the colours, top to bottom.</p>
        <div className="wires">
          {d.wires.map((w, i) => (
            <button
              key={i}
              className={`wire ${w.color}${w.cut ? " cut" : ""}`}
              disabled={over || w.cut || solved.wires}
              aria-label={`Cut wire ${i + 1}, ${w.color}${w.cut ? " (cut)" : ""}`}
              onClick={() => act({ type: "cut", wire: i })}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <i />
              <span>{w.color.toUpperCase()}</span>
            </button>
          ))}
        </div>
        <div className="module-foot">
          SERIAL: {d.serial} <span>CLICK A WIRE TO CUT</span>
        </div>
      </article>

      <article className="module">
        <div className="module-top">
          <span>02 / SYMBOL LOCK</span>
          <Led done={solved.symbols} />
        </div>
        <h2>Order matters.</h2>
        <p>Read the symbols. Follow the manual.</p>
        <div className="symbols">
          {d.symbols.map((s, i) => (
            <button
              key={i}
              className={s.step !== null ? "pressed" : ""}
              disabled={over || solved.symbols || s.step !== null}
              aria-label={`Symbol ${s.glyph}`}
              onClick={() => act({ type: "symbol", index: i })}
            >
              {s.glyph}
            </button>
          ))}
        </div>
        <div className="sequence">
          SEQUENCE: {[...sequence, ...Array(4 - sequence.length).fill("_")].join(" ")}
        </div>
        <div className="module-foot">
          4 INPUTS <span>PRESS IN THE RIGHT ORDER</span>
        </div>
      </article>

      <article className="module">
        <div className="module-top">
          <span>03 / MEMORY KEYPAD</span>
          <Led done={solved.keypad} />
        </div>
        <h2>Remember what you pressed.</h2>
        <p>Read the display, then the keys, left to right.</p>
        <div className="keypad">
          <div className="keypad-screen" aria-label={`Display shows ${d.keypad.display ?? "nothing"}`}>
            {d.keypad.display ?? "✓"}
          </div>
          <div className="keypad-stages" aria-label={`Stage ${Math.min(d.keypad.stage + 1, 4)} of 4`}>
            {[0, 1, 2, 3].map((s) => (
              <span key={s} className={s < d.keypad.stage ? "done" : s === d.keypad.stage ? "now" : ""} />
            ))}
          </div>
          <div className="keypad-keys">
            {d.keypad.keys.map((label, pos) => (
              <button
                key={pos}
                disabled={over || solved.keypad}
                aria-label={`Key in position ${pos + 1}, labelled ${label}`}
                onClick={() => act({ type: "key", position: pos })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="module-foot">
          STAGE {Math.min(d.keypad.stage + 1, 4)} / 4 <span>A WRONG KEY RESETS IT</span>
        </div>
      </article>

      <article className="module">
        <div className="module-top">
          <span>04 / SWITCH PANEL</span>
          <Led done={solved.switches} />
        </div>
        <h2>Set every switch.</h2>
        <p>Read each light. Flip freely, then engage.</p>
        <div className="switches">
          {d.switches.lights.map((light, i) => {
            const up = d.switches.up[i];
            return (
              <div className="switch" key={i}>
                <span className={`lamp ${light}`} aria-hidden="true" />
                <button
                  className={up ? "up" : "down"}
                  role="switch"
                  aria-checked={up}
                  aria-label={`Switch ${i + 1}, ${light === "off" ? "no" : light} light, ${up ? "up" : "down"}`}
                  disabled={over || solved.switches}
                  onClick={() => act({ type: "flip", index: i })}
                >
                  <i />
                </button>
                <span className="switch-label">{light === "off" ? "—" : light.toUpperCase()}</span>
              </div>
            );
          })}
        </div>
        <button
          className="engage"
          disabled={over || solved.switches}
          onClick={() => act({ type: "engage" })}
        >
          ENGAGE
        </button>
        <div className="module-foot">
          5 SWITCHES <span>WRONG PANEL ON ENGAGE IS A STRIKE</span>
        </div>
      </article>

      <article className="module button-module">
        <div className="module-top">
          <span>05 / OVERRIDE</span>
          <Led done={solved.override} />
        </div>
        <h2>The final switch.</h2>
        <p>Clear the other four modules, then ask exactly when to press. Countdown: {clock}.</p>
        <button
          className={`override ${d.override.casing}`}
          disabled={over}
          onClick={() => act({ type: "override" })}
        >
          {d.override.label}
        </button>
        <div className="module-foot">
          LABEL: {d.override.label} <span>{d.override.casing.toUpperCase()} CASING</span>
        </div>
      </article>
    </div>
  );
}
