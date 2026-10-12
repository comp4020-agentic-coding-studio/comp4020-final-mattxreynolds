# What a 3D explorable world costs in the browser at the marking viewports

Research for [#4](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/4)
on the wayfinder map [#2](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/2).
Gathered 2026-10-13.

Two kinds of evidence appear below:

- **Measured**: numbers I produced on this machine. The method is under each
  table, so the numbers can be reproduced.
- **Sourced**: claims taken from the primary source that owns them, linked inline
  and listed at the end.

Anything marked **Judgement** is my opinion, not a fact.

## Answer in brief

- **Engine.** Plain three.js is the cheapest 3D option. A minimal lit scene bundles
  to **134 KB gzip** (measured). Adding glTF loading and pointer-lock look brings
  it to **158 KB**. React plus react-three-fiber (R3F) comes to **318 KB**,
  because R3F pulls in all of three.js. Babylon.js is **344 KB** with careful deep
  imports and **1.70 MB** with a barrel import. PlayCanvas is **532 KB**. All of
  these are MIT, except Babylon, which is Apache-2.0.
- **The 390×844 viewport is the harder target in two ways.**
  - Every DevTools iPhone preset at 390×844 runs at **DPR 3**, so it renders
    1170×2532 = **2.96 M device pixels**. That is more than 1920×1080 at DPR 1.
  - The marker drives touch emulation with **one mouse, which is one touch
    point**. Twin-stick controls (move with one thumb while looking with the
    other) cannot be operated there.
- **Pointer lock gives a false positive under emulation.** `requestPointerLock()`
  *succeeds* under DevTools-style touch emulation (measured), because the
  underlying device is still a mouse. On real touch phones it is a no-op. A
  pointer-lock-only design would pass marking but break on a phone.
- **Two side-by-side windows both keep rendering.** Chromium pauses rendering
  only for windows that are *fully* covered, minimised, or in background tabs.
  The real cost is fill rate. A greybox scene with a capped pixel ratio is cheap
  (judgement).
- **Assets.** Kenney, Quaternius and KayKit packs are **CC0**, so they are safe
  in a public repo. Poly Pizza licenses each model separately, as CC0 or
  CC-BY 3.0/4.0.
- **Bandwidth is negligible.** Position sync at 10–20 Hz with roughly 70-byte
  JSON messages costs about **1–2 KB/s per Player each way**. A 30-minute Attempt
  is about $0.0003 of Sydney egress.
- **Headless Chromium can render WebGL for tests.** It uses SwiftShader (CPU
  rendering) even after Chrome removed the *automatic* SwiftShader fallback for
  headed browsers. The rendered pixels are deterministic, and the scene runs at
  about 58 fps at 390×844@1x and about 20 fps at 1920×1080 (measured). The
  current `spec/` harness has no browser, so adding one is new CI work.

---

## 1. Engines: setup, bundle size, learning

### Measured bundle cost (minified, production, gzip -9)

| Bundle | min | gzip | Licence | Version |
|---|---:|---:|---|---|
| React 19 + react-dom only (baseline) | 223 KB | **69 KB** | MIT | react 19.3.0 |
| three.js: renderer, 2 meshes, 2 lights, `MeshStandardMaterial` | 536 KB | **134 KB** | MIT | three 0.186.1 |
| three.js + `GLTFLoader` + `PointerLockControls` | 620 KB | **158 KB** | MIT | three 0.186.1 |
| React + R3F `<Canvas>` with the same scene | 1,152 KB | **318 KB** | MIT | @react-three/fiber 9.8.1 |
| Babylon.js, deep per-file imports (`Engine`, `Scene`, `UniversalCamera`, box and ground builders) | 1,479 KB | **344 KB** | Apache-2.0 | @babylonjs/core 9.30.0 |
| Babylon.js, `import * as B from '@babylonjs/core'` | 7,537 KB | **1,697 KB** | Apache-2.0 | @babylonjs/core 9.30.0 |
| PlayCanvas `Application`: camera, light, box | 2,046 KB | **532 KB** | MIT | playcanvas 2.23.2 |

Method: each scene was bundled with esbuild 0.28.2 using `--bundle --minify
--format=esm` and `NODE_ENV=production`. The same minimal scene was used
throughout. Vite 8 (this repo's bundler) uses a different minifier, so expect
differences of a few percent, but not a different ranking.

What the sources say about these numbers:

- **R3F bundles all of three.js.** Its ESM entry and events module both contain
  `import * as THREE from 'three'` (checked in `@react-three/fiber/dist/*.esm.js`
  9.8.1), so the bundler cannot tree-shake three. Subtracting the React baseline
  leaves about 250 KB gzip for R3F plus all of three.js.
  - The R3F docs say "There is no overhead. Components render outside of React"
    ([R3F intro](https://r3f.docs.pmnd.rs/getting-started/introduction)). That
    claim is about runtime cost, not bundle size.
  - R3F major versions are tied to React versions: "@react-three/fiber@9 pairs
    with react@19". This repo is on React 19.3.
- **Babylon needs deep imports to shake.** Babylon's docs say its modules have
  side effects, so "if you import directly from index, all the imports will be
  followed and included". You have to "target individual files to fully benefit
  from tree shaking"
  ([Babylon ES6 support](https://doc.babylonjs.com/setup/frameworkPackages/es6Support)).
  The 5× gap in the table is that effect.
- **PlayCanvas** is published on npm with full TypeScript declarations and is MIT
  ([PlayCanvas engine manual](https://developer.playcanvas.com/user-manual/engine/)).
  - The site's main workflow is its hosted Editor. Using the engine on its own is
    the secondary path.
  - `@playcanvas/react` 0.11.7 (MIT) exists, but it is pre-1.0.

### Setup and learning cost for a solo React/TS developer (judgement)

| Option | Setup | Learning cost | Fit |
|---|---|---|---|
| **three.js (vanilla)** | `pnpm add three @types/three`. Addons import from `three/addons/...` ([PointerLockControls docs](https://threejs.org/docs/pages/PointerLockControls.html)). | Lowest. You need a scene, a camera, a renderer and a loop. It has the largest body of examples. | You own the game loop, which keeps game state out of React renders. |
| **react-three-fiber** | `pnpm add three @react-three/fiber`, optionally plus drei 10.7.9 for controls and helpers. | Medium. It is three.js *plus* R3F's reconciler and hooks model. Bugs can come from either layer. | Feels natural for UI-heavy views. It costs about +250 KB gzip over vanilla three. |
| **Babylon.js** | Ships its own types. Needs disciplined deep imports or it costs 1.7 MB. | Medium. It has more built in (cameras with WASD/touch inputs, collisions) but a bigger API. | A good engine, but the bundle trap and a separate idiom from React. |
| **PlayCanvas engine** | npm with types. Engine-only use is the secondary path. | Medium to high without the Editor. | The heaviest baseline measured here (532 KB). |

**Judgement:** with about five build days, vanilla three.js mounted from one
React component (`useEffect` creates the renderer, and React owns HUD and lobby
UI) costs the least. It also keeps "the server is authoritative, the 3D view is a
projection of state" easy to keep honest.

---

## 2. Movement and look controls at 390×844 with touch, and on desktop

### What the marker's 390×844 actually is (sourced)

Chrome DevTools' device list
([`EmulatedDevices.ts`](https://github.com/ChromeDevTools/devtools-frontend/blob/4c3993d1d327de80acc0b2f12d954c47472c1552/front_end/models/emulation/EmulatedDevices.ts))
has three presets at 390×844 portrait: **iPhone 12 Pro, iPhone 14 and iPhone 16e**.
All three have:

- `device-pixel-ratio: 3` and `capabilities: ['touch', 'mobile']`
- an iOS 18.5 Safari user-agent string (the page still runs Chrome's engine,
  so UA sniffing is misleading)
- top and bottom safe-area insets (47 and 34 px on the 12 Pro)

In device mode, the "Mobile" type shows a circle cursor and **fires touch events,
not click events**
([DevTools device mode](https://developer.chrome.com/docs/devtools/device-mode)).

### What a page sees under touch emulation (measured)

Method: headless Chrome for Testing 153. Touch emulation was switched on with the
same CDP calls DevTools uses:

- `Emulation.setDeviceMetricsOverride` with `mobile: true` and DPR 3
- `Emulation.setTouchEmulationEnabled` with `maxTouchPoints: 5`
- `Emulation.setEmitTouchEventsForMouse` with `configuration: 'mobile'`

A mouse drag was then dispatched over a full-screen canvas.

| | Desktop (no emulation) | Touch emulation |
|---|---|---|
| `navigator.maxTouchPoints` | 0 | 5 |
| `(pointer: coarse)` / `(hover: none)` | false / false | **true / true** |
| `(any-pointer: fine)` | true | false |
| Event stream for one drag | `pointerdown(mouse) → mousedown → pointermove(mouse)… → pointerup → click` | `pointerdown(touch) → touchstart → pointermove(touch) → touchmove… → pointerup(touch) → touchend` |
| `requestPointerLock()` on pointerdown | locks | **also locks** |

Implications:

- **One touch point.** The marker drives emulated touch with a single mouse, so
  only one touch point exists at a time. Any scheme that needs two simultaneous
  touches cannot be operated at the 390×844 marking viewport. That rules out a
  virtual joystick under one thumb with drag-to-look under the other. This
  follows from the input device, so it is not a judgement.
- **Pointer lock.** It is mouse-only by design. The Pointer Lock API "hides the
  cursor" and reports `movementX/Y`
  ([MDN Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)).
  three.js `PointerLockControls` is built on it, and its events are described in
  mouse terms ([three.js docs](https://threejs.org/docs/pages/PointerLockControls.html)).
  - On Chrome for Android, `requestPointerLock()` neither throws nor locks
    ([mdn/browser-compat-data#19829](https://github.com/mdn/browser-compat-data/issues/19829)).
  - Under emulation it *does* lock (table above). Emulation therefore hides the
    real-phone failure.
- **Detect touch with Pointer Events and media queries**, not the UA string.
  `pointerType === 'touch'` and `(pointer: coarse)` both report correctly under
  emulation. `'ontouchstart' in window` was `false` in the probe, so it is not a
  reliable check here.

**Judgement: control schemes that work at both marking viewports.**

- **Desktop:** WASD or arrow keys to move, plus look by pointer lock *or* by
  click-drag. Click (or E) interacts with whatever is under the crosshair.
- **390×844:** a single-pointer scheme. For example:
  - drag to look, and tap a surface or object to walk to it or use it
    (point-and-click navigation);
  - or drag to look, plus large hold-to-move buttons used one at a time.
- **Shared:** one interaction model for both is "tap or click an object to act
  on it". It needs only raycasting from a pointer event
  (`Raycaster.setFromCamera`) and keeps puzzles reachable without precise
  movement.
- **Navigation:** fixed viewpoints or node-to-node movement (We Were Here-style
  rooms rather than free roaming) cut control cost the most. It also avoids
  writing collision code.
- **Physics:** Rapier (`@dimforge/rapier3d-compat` 0.21.0, Apache-2.0, 15 MB
  unpacked including WASM) is overkill for greybox rooms. Axis-aligned box checks
  are enough.

---

## 3. Two Chrome windows side by side, each running WebGL

### Sourced

- **Visible windows keep rendering.** Chromium treats foreground tabs in an
  *occluded* window "as if they were background tabs; rendering stops, and js is
  throttled". A window counts as occluded only when it is entirely covered by
  windows above it. Minimised windows are marked hidden
  ([Chromium: Windows native window occlusion](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_native_window_occlusion_tracking.md)).
  Two side-by-side windows are both visible, so both render.
- **Focus does not throttle.** `requestAnimationFrame` is paused in background
  tabs and hidden iframes. Otherwise its rate "will generally match the display
  refresh rate"
  ([MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)).
  MDN also warns to drive movement by the timestamp argument, or "the animation
  will run faster on high refresh-rate screens".
- **No GPU means no WebGL in a normal Chrome window.** Since Chrome 138, Chrome
  no longer falls back to SwiftShader automatically: "WebGL context creation will
  fail instead"
  ([Chrome 138 beta](https://developer.chrome.com/blog/chrome-138-beta);
  [Chromium SwiftShader doc](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)).
  On a machine with a blocklisted or absent GPU, the game must show a clear
  message rather than a blank canvas.

### Load arithmetic (measured and calculated)

- The 390×844 window at DPR 3 draws **2.96 M** device pixels per frame.
  1920×1080 at DPR 1 draws 2.07 M. The marker's laptop screen likely has
  DPR ≥ 1.25, which would raise the large window to 3.2 M or more.
- Fill rate is therefore the main cost, not geometry. `antialias: true` at DPR 3
  multiplies it further.
- **CPU-only floor.** The same minimal three.js scene in headless SwiftShader,
  rendered on the CPU with no GPU at all, ran as follows on this 12-thread
  machine. Rates varied about 2× between runs.

| Viewport | fps |
|---|---:|
| 390×844 @1x | ~58 |
| 390×844 @3x | ~12 |
| 1920×1080 @1x | ~20 |

  Any real integrated GPU is far faster than SwiftShader.

**Judgement:**

- Cap the pixel ratio with `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Keep the scene greybox, with tens to a few hundred meshes and one or two
  lights.
- Consider `antialias: false` at DPR ≥ 2.

Under those limits, two windows on an ordinary laptop with integrated graphics
are well within budget. There is a cheap self-test: open both profiles side by
side, and watch DevTools Performance or a `renderer.info` overlay.

---

## 4. Assets without an artist

### Licences (sourced)

| Source | Licence | Attribution | Notes |
|---|---|---|---|
| [Kenney](https://kenney.nl/support) | "public domain licensed (CC0)" | "not required" | Do not use the Kenney logo. Many 3D packs are glTF/GLB. |
| [Quaternius](https://quaternius.com/faq.html) | "All models are under the CC0 License." | "not necessary" | Free to modify and combine with other packs. |
| [KayKit (Kay Lousberg)](https://kaylousberg.itch.io/kaykit-dungeon-remastered) | "Creative Commons Zero v1.0 Universal" (per itch.io pack page) | "no attribution required" | Licences are per pack, so check each page. The author asks that unmodified copies not be resold. |
| [Poly Pizza](https://poly.pizza/bundle/City-Pack-q11onRvPoJ) | **Per model**: CC0 *or* CC-BY (3.0 for the archived Google Poly models, 4.0 elsewhere) | Required for CC-BY | Bundles mix licences. Record title, author and licence version for every CC-BY model. |

All of these are compatible with a public repo. CC0 needs nothing, and CC-BY
needs a credit line. The repo already has a `CREDITS.md` and a `licenses/`
directory that third-party assets could join.

### Procedural or greybox vs packs

- **Greybox:** three.js primitives (`BoxGeometry`, `PlaneGeometry` and so on) plus
  flat `MeshStandardMaterial` colours cost **zero extra bundle and zero licence
  work**. This is the 134 KB row in section 1.
- **Packs:** using a pack adds `GLTFLoader`, about **+23 KB gzip** together with
  `PointerLockControls` (158 − 134, measured), plus the model files themselves.
- **Judgement:** greybox the first playable, so that puzzle legibility comes from
  colour, labels and shape. Swap in a single CC0 pack (Kenney or KayKit for a
  coherent style) only once puzzles work. Mixing packs from different artists
  clashes visually.

---

## 5. Syncing positions and object state in real time

### Sourced

- **Entity interpolation** (Gambetta): the server ticks at a low fixed rate, with
  "10 times per second" as the example. Clients render other players "in the
  past", about 100 ms behind, interpolating between two confirmed server
  positions. "seeing other entities with a 100 ms isn't generally noticeable"
  ([Gambetta, Entity Interpolation](https://www.gabrielgambetta.com/entity-interpolation.html)).
- **WebSocket framing** ([RFC 6455 §5.2](https://www.rfc-editor.org/rfc/rfc6455#section-5.2)):
  - A payload of 0–125 bytes has a 2-byte header.
  - Client-to-server frames must be masked, which adds 4 bytes, for 6 in total.
  - The server must not mask its frames.
- **Fly egress** ([Fly pricing](https://docs.fly.io/about/pricing)):
  - Sydney is in the Asia Pacific/Oceania group at **$0.04/GB** to the internet.
  - Inbound data is free.
  - New organisations have no free allowance.
- **Fly proxy and long-lived connections**
  ([Machines API guide](https://fly.io/docs/machines/guides-examples/managing-machines-with-the-api/);
  [fly-proxy WebSocket GoAway announcement](https://community.fly.io/t/fly-proxy-now-gracefully-terminates-websocket-connections-before-stopping-suspending-a-machine/27544)):
  - The proxy will not auto-stop a Machine with active connections.
  - fly-proxy now sends a WebSocket close frame before stopping or suspending a
    Machine.
- **Libraries:** `ws` 8.22.0 (MIT) and `socket.io` 4.8.4 (MIT) are the usual
  Node choices. Dead Air on `main` streams with Server-Sent Events
  (`server/rooms.ts` sets `Content-Type: text/event-stream`). SSE is
  server-to-client only, so client position updates would need a separate HTTP
  POST each time.

### Bandwidth arithmetic (calculated)

A position update for one Player looks like this:

```json
{"t":"pos","id":"p1","p":[12.34,1.6,-7.89],"r":[0,1.571],"s":12345}
```

| Item | Value |
|---|---|
| JSON payload | 67 bytes |
| Up: one Player → server at 20 Hz | (67 + 6) × 20 ≈ **1.5 KB/s** of WebSocket payload, ~2.5 KB/s with TCP/IP headers (~52 B/packet) |
| Down: server → the other Player at 20 Hz | (67 + 2) × 20 ≈ **1.4 KB/s**, ~2.4 KB/s on the wire |
| At 10 Hz (Gambetta's example rate) | half of the above |
| Server egress for a 30-minute Attempt, both Players, 20 Hz | ≈ 2 × 2.4 KB/s × 1800 s ≈ **8.6 MB ≈ $0.0003** |

Puzzle *object state* changes at human speed: a handful of events per minute,
each a few hundred bytes. It is negligible next to positions.

**Judgement:**

- Bandwidth and the 256 MB machine are not constraints.
- **Positions** are cosmetic: throttle them to 10–15 Hz, interpolate about
  100 ms behind, and never persist them.
- **Puzzle state** stays server-authoritative and event-driven, at the brief's
  "around 1 s" bar, which this easily beats.
- **Transport:**
  - WebSocket (`ws`) fits two-way position streaming better than SSE plus POSTs.
  - SSE plus POST is still viable at 10 Hz if the existing pattern is reused.
- **Avatars:** if the two Players are never in the same space (We Were Here-style
  separated rooms), there may be no remote avatar to sync at all. Then section 5
  shrinks to object state only.

---

## 6. Automated testing of WebGL in headless Chromium

### Sourced

- **Headless still gets SwiftShader.** Chromium's doc calls SwiftShader "a useful
  tool for web developers to test their sites on systems that are headless or do
  not have a supported GPU". It says that use "will still be supported by opting
  in" with `--enable-unsafe-swiftshader`
  ([Chromium SwiftShader doc](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)).
- **Playwright already passes the flag.** Playwright 1.64.0's CDP Chromium
  launcher pushes `--enable-unsafe-swiftshader` unconditionally
  (`playwright-core/lib/coreBundle.js`, Chromium `_innerDefaultArgs`).

### Measured (Chrome for Testing 153.0.8010.12, Playwright 1.64.0, Linux)

Five launch configurations were tested:

- headless shell with Playwright defaults
- headless shell without `--enable-unsafe-swiftshader` (via `ignoreDefaultArgs`)
- new headless (full `chrome` binary) with defaults
- new headless without the flag
- new headless with `--use-angle=swiftshader`

Results:

- **All five** gave a WebGL2 and a WebGL1 context. Each reported
  `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
- **Rendering is deterministic.** The three.js scene rendered in every
  configuration. `gl.readPixels` at the centre (the lit red box) returned exactly
  `152,0,0,255` every time. This makes pixel-level assertions possible. Screenshot
  diffs are possible but more brittle.
- **One frame takes 11–136 ms** depending on viewport and DPR (render plus
  readback). That is fine for assertions and too slow for gameplay-speed
  simulation.

### What this means for `spec/`

- **Today:** the `spec/` checks run Vitest against the running app over HTTP, and
  CI has no browser (`.github/workflows/checks.yml`, `spec/README.md`).
- **To add a browser check:** add `playwright` as a dev dependency and run
  `playwright install --with-deps chromium` in CI. The browser download is about
  100 MB+ per CI run unless it is cached.
- **Judgement:** keep the 3D view a thin projection of server state, and keep
  rules and checks on the server, where the existing HTTP-level `spec/` style
  already tests them. A single headless smoke test is enough to prove the 3D
  client works. It would:
  1. load the page at both viewports;
  2. assert that a WebGL context exists;
  3. assert that a debug hook (for example `window.__scene`) reports the
     expected objects;
  4. optionally read one pixel.

---

## Sources

- three.js PointerLockControls: https://threejs.org/docs/pages/PointerLockControls.html
- react-three-fiber introduction: https://r3f.docs.pmnd.rs/getting-started/introduction
- Babylon.js ES6 / tree shaking: https://doc.babylonjs.com/setup/frameworkPackages/es6Support
- PlayCanvas engine manual: https://developer.playcanvas.com/user-manual/engine/
- npm registry metadata (`npm view <pkg> version license`) for three, @react-three/fiber, @react-three/drei, @babylonjs/core, playcanvas, @playcanvas/react, nipplejs, ws, socket.io, @dimforge/rapier3d-compat
- Chrome DevTools device mode: https://developer.chrome.com/docs/devtools/device-mode
- DevTools emulated devices source: https://github.com/ChromeDevTools/devtools-frontend/blob/4c3993d1d327de80acc0b2f12d954c47472c1552/front_end/models/emulation/EmulatedDevices.ts
- MDN Pointer Lock API: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API
- MDN browser-compat-data, Pointer Lock on Chrome for Android: https://github.com/mdn/browser-compat-data/issues/19829
- MDN requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- Chromium native window occlusion: https://chromium.googlesource.com/chromium/src/+/main/docs/windows_native_window_occlusion_tracking.md
- Chromium SwiftShader: https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
- Chrome 138 beta (SwiftShader fallback removal): https://developer.chrome.com/blog/chrome-138-beta
- blink-dev Intent to Remove: SwiftShader Fallback: https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM
- Kenney support (licence): https://kenney.nl/support
- Quaternius FAQ: https://quaternius.com/faq.html
- KayKit Dungeon Remastered (itch.io licence field): https://kaylousberg.itch.io/kaykit-dungeon-remastered
- Poly Pizza bundle with mixed licences: https://poly.pizza/bundle/City-Pack-q11onRvPoJ
- Gambetta, Entity Interpolation: https://www.gabrielgambetta.com/entity-interpolation.html
- RFC 6455 §5.2: https://www.rfc-editor.org/rfc/rfc6455#section-5.2
- Fly.io pricing: https://docs.fly.io/about/pricing
- Fly Machines API (no auto-stop with active connections): https://fly.io/docs/machines/guides-examples/managing-machines-with-the-api/
- fly-proxy WebSocket GoAway: https://community.fly.io/t/fly-proxy-now-gracefully-terminates-websocket-connections-before-stopping-suspending-a-machine/27544
