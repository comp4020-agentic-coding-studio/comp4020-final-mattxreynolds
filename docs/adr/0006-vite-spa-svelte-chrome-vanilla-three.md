# The client is a Vite SPA: Svelte 5 chrome around a vanilla three.js scene

The game is one 3D canvas surrounded by ordinary 2D screens (landing, lobby, profile, Clock and Strike readouts, paused screen, Leaderboard, and the 2D fallback view of every Puzzle), on a throttled shared machine and a 390×844 phone at device pixel ratio 3. We chose a plain Vite 8 single-page app built to hashed static assets and served by the same Hono process, with no meta-framework; Svelte 5 for the 2D screens, with a module-level `$state` store fed by the `EventSource`; and vanilla three.js for the scene, built by a plain `buildScene(roomData)` function that the Svelte root mounts once and never re-creates on a state change. There is no physics engine: walking is an axis-separated box check against the wall and blocking-tile data in the Room, and the same check runs on the server and in the 2D fallback.

## Considered Options

UI layer (gzip KB for the same small app: a store fed by an `EventSource`, a readout, a list and a canvas mount, before three.js):

- **Vanilla TypeScript:** 1.2. Smallest, but all the screens are hand-written DOM.
- **Solid 6.3, Preact 6.7, Lit 7.1:** all keep the canvas alive. **Preact 11 is the runner-up** (the React mental model, the largest corpus of the small ones). **If Svelte's Vite 8 plugin or one jsdom component test fails in the first hour, or agent-written Svelte turns out brittle, switch to Preact.**
- **Svelte 5:** 15.7, with the least store code.
- **Vue 25.2.**
- **React 19:** 68.4, about 50% on top of three.js's 132, and the largest corpus. The closest call: nobody measured how well an agent writes Svelte 5 against React.

3D engine (gzip KB, hello-cube with a pointer raycast):

- **three.js 0.186 (MIT): 132.** Built-in `Raycaster`, opt-in GLTF loader, and the largest corpus.
- **Threlte 209, react-three-fiber 308, Babylon 396, PlayCanvas 525:** each costs 1.5–4× more, and a declarative binding earns nothing when the scene is built from data.
- **Rapier physics: 1,670 (WASM embedded in JavaScript), about 12× three.js.** [How do Players move and look in 3D with a single pointer?](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/17) needs only walls and blocking tiles.
- **Needle Engine:** an alpha with no declared licence.

Build and meta-framework (production idle RSS in MB):

- **Plain Node 60, Hono 66, SvelteKit 65, React Router 79, Nuxt 80, Astro 94, Next.js 102.** Vite, Rsbuild and esbuild all produced the same 134–136 KB bundle.
- **Astro** is the course's default, and costs about 30 MB more at idle and 146 MB of `node_modules` for rendering the game does not do. **SvelteKit in SPA mode is the runner-up,** with similar memory and file routing; reopen it if the 2D screens multiply.

## Consequences

- A Svelte root never owns the canvas: state changes re-render DOM only, and the render loop does not read Svelte state.
- Mobile frame rates were not measured (only bundle sizes were), so the first dressed Room is tested on a real phone before the final.
- Everything here is reversible later at modest cost except the three.js choice, which Rooms-as-data ([Does the world take 3D form, and for which Player?](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/8)) already isolates behind one function.

Evidence: [the stack comparison](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/blob/research/stack-comparison/docs/research/stack-comparison.md).
