/**
 * Exercises the coordinator's actual state machine through its real public
 * API — several independent components (a small test harness per id, since
 * this project has no @testing-library/react-hooks) each calling
 * useCoordinatedModal(id, desired) and subscribing to the shared singleton
 * store, the same way SearchBox's several simultaneous instances do, not
 * just one caller passing a whole map (which is how App.tsx's own
 * singleton panels happen to call it, but isn't the only supported shape).
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { modalCoordinatorStore, useCoordinatedModal, type ModalSlot } from './useModalCoordinator';

beforeEach(() => {
  modalCoordinatorStore.reset();
});

function renderSlots(initialDesired: Record<string, boolean>) {
  const latest: Record<string, ModalSlot> = {};

  function Harness({ id, desired }: { id: string; desired: boolean }) {
    latest[id] = useCoordinatedModal(id, desired);
    return null;
  }

  function Tree({ desired }: { desired: Record<string, boolean> }) {
    return (
      <>
        {Object.entries(desired).map(([id, d]) => (
          <Harness key={id} id={id} desired={d} />
        ))}
      </>
    );
  }

  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<Tree desired={initialDesired} />);
  });

  return {
    get: () => latest,
    setDesired: (desired: Record<string, boolean>) => {
      act(() => {
        renderer.update(<Tree desired={desired} />);
      });
      return latest;
    },
  };
}

describe('useCoordinatedModal', () => {
  it('promotes the only desired slot immediately when nothing else is active', () => {
    const h = renderSlots({ a: false, b: false });
    expect(h.get().a.visible).toBe(false);
    expect(h.get().b.visible).toBe(false);

    const after = h.setDesired({ a: true, b: false });
    expect(after.a.visible).toBe(true);
    expect(after.b.visible).toBe(false);
  });

  it("displaces an already-visible slot, but doesn't promote the new one until the old one's onDismiss fires", () => {
    const h = renderSlots({ a: true, b: false });
    expect(h.get().a.visible).toBe(true);

    // b becomes desired while a is still desired too — a must be forced
    // invisible immediately (this is what makes its real <Modal> actually
    // start dismissing), but b must NOT appear yet.
    let state = h.setDesired({ a: true, b: true });
    expect(state.a.visible).toBe(false);
    expect(state.b.visible).toBe(false);

    // Simulates a's real Modal reporting its dismiss animation finished.
    act(() => state.a.onDismiss());
    state = h.get();
    expect(state.a.visible).toBe(false);
    expect(state.b.visible).toBe(true);
  });

  it('falls back to a still-desired displaced slot once the displacing one closes and confirms dismissal', () => {
    const h = renderSlots({ a: true, b: false });
    let state = h.setDesired({ a: true, b: true });
    act(() => state.a.onDismiss()); // hand off a -> b
    state = h.get();
    expect(state.b.visible).toBe(true);

    // b is no longer desired (its own onClose ran), but its Modal hasn't
    // finished dismissing yet — b must be forced invisible right away,
    // and a must NOT reappear until b confirms via onDismiss.
    state = h.setDesired({ a: true, b: false });
    expect(state.b.visible).toBe(false);
    expect(state.a.visible).toBe(false);

    act(() => state.b.onDismiss());
    state = h.get();
    expect(state.a.visible).toBe(true);
    expect(state.b.visible).toBe(false);
  });

  it('never reports more than one slot visible at a time across an arbitrary sequence', () => {
    const h = renderSlots({ a: false, b: false, c: false });

    const steps: Array<Record<string, boolean>> = [
      { a: true, b: false, c: false },
      { a: true, b: true, c: false },
      { a: true, b: true, c: true },
      { a: false, b: true, c: true },
      { a: false, b: false, c: true },
      { a: false, b: false, c: false },
    ];

    for (const desired of steps) {
      const state = h.setDesired(desired);
      const visibleCount = Object.values(state).filter(slot => slot.visible).length;
      expect(visibleCount).toBeLessThanOrEqual(1);
      // Drain any pending dismissal so the next step starts from a
      // settled state, same as a real Modal eventually reporting back.
      for (const slot of Object.values(state)) {
        act(() => slot.onDismiss());
      }
    }
  });

  it('handles a slot that is already desired on the very first render', () => {
    const h = renderSlots({ a: true, b: false });
    expect(h.get().a.visible).toBe(true);
  });

  it('releases the floor when a still-active slot unmounts without closing first', () => {
    // Mirrors a MeetupPanel participant row (and its SearchBox instance)
    // being removed entirely while its dropdown happened to be the active
    // slot — the next-in-line slot must still be able to take over, not
    // find the floor permanently stuck.
    const h = renderSlots({ a: true, b: false });
    let state = h.setDesired({ a: true, b: true });
    act(() => state.a.onDismiss()); // hand off a -> b
    state = h.get();
    expect(state.b.visible).toBe(true);

    // Drop `b` from the tree entirely (its Harness unmounts) instead of
    // setting its desired to false — the cleanup effect should behave the
    // same as an explicit close, releasing the floor for `a`.
    state = h.setDesired({ a: true });
    expect(state.a.visible).toBe(true);
  });
});
