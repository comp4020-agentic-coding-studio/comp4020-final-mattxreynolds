# ADR 008 — Touch play on phones and tablets

## Context
The game was keyboard-and-mouse only: pointer lock to look, WASD to move,
E or click to use. `PRODUCT.md` listed mobile/touch play as a non-goal. On a
phone or tablet the briefing card's "Click to take the controls" did nothing
useful: there is no pointer lock, no keyboard and no way to move or use a
control. Players who join from a phone (a common way to open a link a
partner sends) were stuck on the card.

## Options
1. **Keep it desktop-only** and say so on the join screen.
2. **A separate tap-to-select UI** (2D panels of each station's controls).
   It's simple on a small screen, but it's a second interface for every
   station, and it would drop the spatial "where in the room is it" half of
   the puzzles.
3. **Touch controls for the same first-person room.** A floating move stick
   on the left, drag-to-look on the right, a tap on a control to use it, and
   an on-screen USE button for the control under the reticle. Hold-controls
   are held by keeping a finger down.

## Decision
Option 3. Every station keeps working unchanged because touch drives the
same `Player` and the same interactables:

- `client/scene/input.ts` holds the shared input state: stick, look drag,
  aimed control, and one `press()`/`release()` with one debounce and one hold.
  E, a left click, the USE button and a tap all go through it.
- `client/scene/touch.ts` holds the pure parts (stick maths, tap test,
  fingertip ring, prompt wording, portrait lens) and the device detector.
- `client/ui/TouchControls.tsx` is the on-screen layer. It writes input state
  directly and never sets React state per move event.

Touch mode follows the last pointer used (`pointerType`), starting from
`(pointer: coarse)`. A touchscreen laptop switches as soon as the player
reaches for the mouse. In touch mode, "on the controls" doesn't take pointer
lock: tapping the card shows the touch layer, and the ❚❚ button brings the
card back. Prompts that say "E to …" read "USE to …".

A tap checks the exact point, then a ring 16 px around it, because the
ship's roll moves the view by about a degree and a fingertip is wider than a
pixel. A browser spec caught this: a tap aimed at the alarm button missed it
one run in three.

## Fitting the visible screen (follow-up)
On iPhone Safari the thumb controls sat half under the toolbar, and the
briefing card didn't fit. `inset: 0` fills the *large* viewport, and
Safari's toolbar covers its bottom. On touch, the game is now `100dvh` tall,
and every thumb control is offset by the safe-area insets (home indicator,
notch). The briefing card puts "Tap to take the controls" right after the
objective, and the controls list folds away once it has been seen. The
desktop short-screen rules no longer squeeze it into four columns.
`spec/browser-touch.test.ts` checks that both fit at Safari's visible sizes
(393×659 portrait, 750×340 landscape) with the insets forced on.

## Consequences
- The server, protocol and puzzles are untouched. Touch players send the
  same intents, so secrecy and authority are unaffected.
- Audio unlock now waits for a gesture that the browser counts as user
  activation (`pointerup`/`touchend`). A touch `pointerdown` isn't one, and
  the old one-shot unlock left phones silent.
- A portrait phone gets a wider vertical field of view (`fitFov`), so the
  room isn't a keyhole. Landscape is still recommended, and the card says so.
- Phones are slow GPUs. The existing quality tiers (ADR 007) and the
  automatic step-down apply unchanged. Nothing here was measured on a real
  phone (see TODO).
- `spec/browser-touch.test.ts` plays the opening as a phone and a tablet in
  two touch-enabled contexts with real CDP touch events, and holds the door
  release with a finger and with USE. `spec/touch.unit.test.ts` covers the
  pure parts.
