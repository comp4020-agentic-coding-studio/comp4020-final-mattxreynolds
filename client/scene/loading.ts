// First-mount loading gate. Rooms mount their heavy parts in stages and
// compile each stage's shaders asynchronously (bridge/kit.tsx Warm); every
// stage holds a ticket here until its programs are compiled. Scene.tsx's
// ReadyProbe only lets the player take the controls once no tickets are
// open, so no multi-second shader link lands mid-play (where it would hold
// up socket messages: CLAUDE.md invariant 3).

let open = 0;

/** Take a ticket; call the returned function exactly once when done. */
export function holdLoading(): () => void {
  open++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    open--;
  };
}

export const loadingOpen = (): number => open;
