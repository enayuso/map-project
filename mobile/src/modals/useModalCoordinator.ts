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
 * ## Model
 *
 * Each participating component calls `useCoordinatedModal(id, desired)`
 * with a unique, stable id and the same `desired` boolean it always
 * computed (`!!selectedPlace`, `showRoutePanel`, etc. — that part doesn't
 * change). What changes is that `desired` being true no longer means the
 * component's own Modal `visible` is true; instead:
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
 * ## Why a plain singleton store, not React Context
 *
 * Most participating components are singletons App.tsx renders directly
 * (PlaceCard, RoutePanel, HazardInfoCard, ...) — those could take their
 * slot as a prop computed by one shared call in App.tsx, same as the
 * first version of this file did. But src/search/SearchBox.tsx isn't a
 * singleton: it's instantiated up to several times at once (the main
 * search bar, each of DirectionsSearchPanel's two fields, one per
 * MeetupPanel participant row — a number that changes at runtime as
 * people are added/removed), nested inside components that have no
 * reason to know the coordinator exists. A per-instance id registered on
 * demand — via a plain module-level store every call site subscribes to
 * with `useSyncExternalStore` — handles that without threading a
 * Provider through every intermediate component, and without a growing,
 * hand-maintained map of every possible slot in one place. This app only
 * ever has one live tree, so a singleton (reset() below for test
 * isolation) is simpler than Context for the same result here.
 *
 * `visible`/`onDismiss` for a slot that's since unmounted without calling
 * `close()` first (e.g. a removed MeetupPanel participant row) are
 * cleaned up automatically — see the unmount effect in
 * `useCoordinatedModal` below — so a stale id can never get stuck holding
 * the floor forever.
 *
 * Not used by anything's *own* same-tap backdrop race (SearchBox's issue
 * 9, documented in mobile/README.md) — that's a different problem (a
 * Modal racing against its own dismiss, not a conflict with a second
 * Modal) with its own existing, separate fix; both apply to SearchBox at
 * once, solving two unrelated things.
 */
import { useEffect, useSyncExternalStore } from 'react';

export type ModalSlot = {
  visible: boolean;
  onDismiss: () => void;
};

class ModalCoordinatorStore {
  private activeId: string | null = null;
  private stack: string[] = [];
  private desired = new Map<string, boolean>();
  private listeners = new Set<() => void>();
  // Cached per-id slot objects — useSyncExternalStore requires getSnapshot
  // to return a referentially stable result when nothing relevant to that
  // subscriber changed, or React treats every read as a fresh update.
  private slots = new Map<string, ModalSlot>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    for (const listener of this.listeners) listener();
  }

  private tryPromote() {
    if (this.activeId === null) {
      const top = this.stack[this.stack.length - 1] ?? null;
      if (top !== null) this.activeId = top;
    }
  }

  setDesired = (id: string, desired: boolean): void => {
    const was = this.desired.get(id) ?? false;
    if (was === desired) return; // no-op — nothing for any subscriber to react to
    this.desired.set(id, desired);
    if (desired) {
      this.stack = [...this.stack.filter(existing => existing !== id), id];
    } else {
      this.stack = this.stack.filter(existing => existing !== id);
    }
    this.tryPromote();
    this.notify();
  };

  private dismiss = (id: string) => {
    if (this.activeId !== id) return;
    this.activeId = null;
    this.tryPromote();
    this.notify();
  };

  /**
   * Called when a slot's component unmounts entirely, rather than a
   * normal `desired=false` transition. A normal transition still waits
   * for that slot's own Modal to report a real `onDismiss` before
   * considering the floor free, since the Modal is still presented and
   * animating out — but an unmounted component will never call
   * `onDismiss` itself (there's no component left to receive the native
   * callback). If it was currently holding the floor, release it
   * immediately so the next slot in line isn't stuck waiting on a dismiss
   * that can now never happen. Caught by this file's own test suite: a
   * MeetupPanel participant row (and its SearchBox instance) removed
   * while its dropdown was the active slot used to leave every other
   * slot permanently unable to gain the floor.
   */
  release = (id: string): void => {
    this.desired.delete(id);
    this.stack = this.stack.filter(existing => existing !== id);
    if (this.activeId === id) this.activeId = null;
    this.tryPromote();
    this.notify();
  };

  getSlot = (id: string): ModalSlot => {
    const top = this.stack[this.stack.length - 1] ?? null;
    const visible = this.activeId === id && top === id;
    const cached = this.slots.get(id);
    if (cached && cached.visible === visible) return cached;
    const slot: ModalSlot = { visible, onDismiss: () => this.dismiss(id) };
    this.slots.set(id, slot);
    return slot;
  };

  /** Test-only: clears all state between tests in the same file. */
  reset(): void {
    this.activeId = null;
    this.stack = [];
    this.desired.clear();
    this.listeners.clear();
    this.slots.clear();
  }
}

export const modalCoordinatorStore = new ModalCoordinatorStore();

export function useCoordinatedModal(id: string, desired: boolean): ModalSlot {
  // Registering from an effect (not synchronously during render) is what
  // React's useSyncExternalStore contract expects for a store mutation
  // that other subscribed components need to react to.
  useEffect(() => {
    modalCoordinatorStore.setDesired(id, desired);
  }, [id, desired]);

  // If this instance unmounts outright without ever calling close() first
  // (a MeetupPanel participant row removed while its own SearchBox
  // dropdown happened to be the active slot) — release() clears activeId
  // too when it matches, unlike setDesired(id, false) alone.
  useEffect(() => {
    return () => modalCoordinatorStore.release(id);
  }, [id]);

  return useSyncExternalStore(modalCoordinatorStore.subscribe, () => modalCoordinatorStore.getSlot(id));
}
