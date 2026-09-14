/**
 * Coordinates every full-screen <Modal>-based panel in the app so at most
 * one is ever actually presented at once. The constraint this exists for
 * is a real, confirmed one, not a guess: two React Native <Modal>s can't
 * both be presented at the same time from the same presenting view
 * controller — iOS silently drops the second present() call rather than
 * stacking it, logging "Attempt to present <RCTFabricModalHostViewController>
 * ... which is already presenting <RCTFabricModalHostViewController>". This
 * was first hit (and fixed by hand, for just that one pair) as
 * RoutePanel/AlongRouteSheet — see mobile/README.md's "Known issues" #10
 * for the full diagnosis — before being generalized here so every other
 * Modal-owning component in the app gets the same protection without each
 * needing its own bespoke handoff.
 *
 * Not used by src/search/SearchBox.tsx's own results dropdown — that one's
 * bug (README issue 9) is a same-tap race against its *own* backdrop, not
 * a conflict with a second Modal, so it's a different problem with its
 * own existing fix and doesn't go through this coordinator.
 *
 * ## Model
 *
 * App.tsx computes one `desired` boolean per slot, same as it already did
 * before this existed (`!!selectedPlace`, `showRoutePanel`, etc.) — that
 * part doesn't change. What changes is that a slot's `desired` being true
 * no longer means its Modal's `visible` is true; instead:
 *
 * - Whenever a slot's `desired` flips false -> true, it moves to the top
 *   of an internal request stack (most-recently-requested wins).
 * - Whenever a slot's `desired` flips true -> false, it's removed from the
 *   stack entirely.
 * - Only the slot at the top of the stack is ever a candidate to be
 *   visible, and only once it's also `activeId` — the one slot actually
 *   holding the floor right now.
 * - Promoting a new `activeId` only happens once the previous one has
 *   fully relinquished it, confirmed via that Modal's own `onDismiss`
 *   (iOS-only; fires once the dismiss *animation* has actually finished,
 *   not just when `visible` flips — the reliable primitive here instead
 *   of guessing at a delay long enough for the animation to finish).
 *
 * A practical consequence: a slot whose own `desired` is still true can
 * still be forced invisible — displaced — by a more recently requested
 * one (this is exactly what RoutePanel needs: it stays "desired" the
 * whole time AlongRouteSheet is open, but has to visually step aside for
 * it). It reappears automatically once the displacing slot's `desired`
 * goes back to false and its own dismiss finishes, with no special-casing
 * for that specific pair — any slot can displace and be displaced by any
 * other, in any order, any number of times.
 *
 * `visible`/`onDismiss` for a slot this hook doesn't know about (a typo,
 * or a slot removed from the `desired` map on some render) are simply
 * absent from the returned record — callers should only read slots they
 * also passed into `desired`.
 */
import { useEffect, useRef, useState } from 'react';

export type ModalSlot = {
  visible: boolean;
  onDismiss: () => void;
};

export function useModalCoordinator<Id extends string>(desired: Record<Id, boolean>): Record<Id, ModalSlot> {
  const [activeId, setActiveId] = useState<Id | null>(null);
  // The request stack, most-recently-requested at the end. Real state
  // (not a plain ref) deliberately — a slot currently being displaced
  // needs `top` to reflect the new stack *this same settling pass*, not
  // only after some later, unrelated render happens to occur. A ref
  // mutation alone doesn't schedule a re-render, so `top` (read during
  // render, below) would stay stale until something else nudged React
  // into rendering again — this bit an early version of this hook, caught
  // by its own test suite: a displacing slot's `visible` didn't actually
  // flip to false until a second, unrelated update came through.
  const [stack, setStack] = useState<Id[]>([]);
  const prevDesiredRef = useRef<Partial<Record<Id, boolean>>>({});

  useEffect(() => {
    const prev = prevDesiredRef.current;
    let next = stack;
    let changed = false;
    for (const id of Object.keys(desired) as Id[]) {
      const wasDesired = !!prev[id];
      const isDesired = !!desired[id];
      if (isDesired && !wasDesired) {
        next = [...next.filter(existing => existing !== id), id];
        changed = true;
      } else if (!isDesired && wasDesired) {
        next = next.filter(existing => existing !== id);
        changed = true;
      }
    }
    prevDesiredRef.current = { ...desired };
    if (changed) setStack(next);

    // Only promote the next slot once the floor is actually empty — i.e.
    // once whatever was previously active has confirmed (via onDismiss,
    // below) that it's fully gone.
    if (activeId === null) {
      const top = next[next.length - 1] ?? null;
      if (top !== null) setActiveId(top);
    }
    // `desired` is a fresh object literal every render by design (callers
    // pass an inline `{ id: bool, ... }`, same as any other derived-state
    // expression) — listing it here to satisfy exhaustive-deps doesn't
    // change behavior: since it never has referential stability, this
    // still runs after every render/commit exactly as intended, not only
    // when `stack` or `activeId` themselves change.
  }, [stack, desired, activeId]);

  const top = stack[stack.length - 1] ?? null;

  const result = {} as Record<Id, ModalSlot>;
  for (const id of Object.keys(desired) as Id[]) {
    result[id] = {
      // Only the current top-of-stack slot, and only once it's also the
      // one actually holding the floor — this is what forces a displaced
      // slot's own Modal to `visible={false}` immediately (triggering its
      // real dismiss) even though its own `desired` hasn't changed.
      visible: activeId === id && top === id,
      onDismiss: () => {
        setActiveId(current => (current === id ? null : current));
      },
    };
  }
  return result;
}
