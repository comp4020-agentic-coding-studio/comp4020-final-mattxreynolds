// The interaction system. Wrap any mesh group in <Interactable> to make it
// usable: the Player raycasts from the screen centre each frame, shows the
// prompt under the reticle and calls onUse on E / left click.
//
//   <Interactable id="breaker-2" prompt="Breaker — OPEN · E to close" onUse={...}>
//     <mesh .../>
//   </Interactable>
//
// Hold controls pass onHold(true|false) instead of (or as well as) onUse.

import { useEffect, useRef, type ReactNode } from "react";
import type { Group, Object3D } from "three";

export type InteractableDef = {
  id: string;
  prompt: string;
  onUse?: () => void;
  onHold?: (held: boolean) => void;
  disabled?: boolean;
};

type Entry = { def: InteractableDef; object: Object3D };

/** Registry of every interactable currently mounted (id → entry). */
export const interactables = new Map<string, Entry>();

export function Interactable(props: InteractableDef & { children: ReactNode; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const ref = useRef<Group>(null);
  const { id, prompt, onUse, onHold, disabled, children, position, rotation } = props;

  useEffect(() => {
    const object = ref.current;
    if (!object) return;
    object.userData.interactId = id;
    interactables.set(id, { def: { id, prompt, onUse, onHold, disabled }, object });
    return () => {
      if (interactables.get(id)?.object === object) interactables.delete(id);
    };
  }, [id, prompt, onUse, onHold, disabled]);

  return (
    <group ref={ref} position={position} rotation={rotation}>
      {children}
    </group>
  );
}

/** Walks up from a hit object to the interactable that owns it. */
export function findInteractable(obj: Object3D | null): Entry | null {
  for (let o = obj; o; o = o.parent) {
    const id = o.userData?.interactId as string | undefined;
    if (id) return interactables.get(id) ?? null;
  }
  return null;
}

/** Uses an interactable by id, as if aimed at and pressed. Used by the
 * automated browser specs (window.__btw.use) and nothing else. */
export function useById(id: string, held?: boolean): boolean {
  const e = interactables.get(id);
  if (!e || e.def.disabled) return false;
  if (held !== undefined) e.def.onHold?.(held);
  else e.def.onUse?.();
  return true;
}
