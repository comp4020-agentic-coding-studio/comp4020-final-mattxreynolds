import {
  KEYPAD_RULES,
  keyRuleText,
  OVERRIDE_RULES,
  SWITCH_RULES,
  SYMBOL_COLUMNS,
  WIRE_RULES,
} from "../../shared/game.ts";

// The Expert's side. It holds no device data at all: every rule here is
// general, so the Expert has to ask what's in front of the Operator.
export function Manual() {
  return (
    <div className="manual">
      <div className="eyebrow">FIELD MANUAL / REVISION 3.0</div>
      <h2>Listen first. Be precise.</h2>
      <p>
        You have the rules, your operator has the device. Every device is different, so ask them to
        describe what they see.
      </p>

      <article>
        <span>01</span>
        <div>
          <h3>Wire array</h3>
          <p>Ask how many wires there are, then their colours from top to bottom. Cut exactly one.</p>
          {Object.entries(WIRE_RULES).map(([n, rules]) => (
            <div className="rule-block" key={n}>
              <div className="label">{n} WIRES</div>
              <ol>
                {rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </article>

      <article>
        <span>02</span>
        <div>
          <h3>Symbol lock</h3>
          <p>
            Ask which four symbols are visible. Exactly one column below holds all four. Press them in
            the order they appear in that column, top to bottom. A wrong press resets the lock.
          </p>
          <div className="manual-columns">
            {SYMBOL_COLUMNS.map((col, i) => (
              <ol key={i} aria-label={`Column ${i + 1}`}>
                {col.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            ))}
          </div>
        </div>
      </article>

      <article>
        <span>03</span>
        <div>
          <h3>Memory keypad</h3>
          <p>
            Four stages. At each one, ask what the display shows, then use that stage's rule. Positions
            count from the left. Keep track of what was pressed: later stages refer back to it. A wrong
            key resets the keypad to stage 1 with new numbers.
          </p>
          <div className="keypad-table" role="table" aria-label="Keypad rules">
            {KEYPAD_RULES.map((stage, s) => (
              <div className="rule-block" role="row" key={s}>
                <div className="label">STAGE {s + 1}</div>
                <ul>
                  {stage.map((rule, d) => (
                    <li key={d}>
                      <b>Display {d + 1}:</b> {keyRuleText(rule)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article>
        <span>04</span>
        <div>
          <h3>Switch panel</h3>
          <p>
            Five switches, each under a light. Work left to right: each light says where its switch
            should be. Once all five are set, the operator presses ENGAGE. A wrong panel is a strike.
          </p>
          <ul className="switch-rules">
            {SWITCH_RULES.map((r) => (
              <li key={r.light}>
                <span className={`lamp ${r.light}`} aria-hidden="true" />
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      </article>

      <article>
        <span>05</span>
        <div>
          <h3>Override</h3>
          <p>
            <strong>Always last.</strong> Pressing it before the other four modules are cleared is a
            strike. Then ask for the casing colour and the label, and use the first rule that applies.
          </p>
          <ol>
            {OVERRIDE_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      </article>

      <div className="manual-note">
        Playing alone? Switch to the Operator tab to see the device. With a teammate, share the room
        code and they can take this seat from their own screen.
      </div>
    </div>
  );
}
