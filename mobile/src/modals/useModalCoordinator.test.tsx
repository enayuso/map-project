/**
 * Exercises the coordinator's actual state machine — a small test harness
 * component drives the hook through react-test-renderer's `act()` (this
 * project has no @testing-library/react-hooks), since the interesting
 * behavior here is the two-phase "wait for a real onDismiss before
 * promoting the next slot" handoff, not just a snapshot of one render.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useModalCoordinator, type ModalSlot } from './useModalCoordinator';

function renderCoordinator(initialDesired: Record<string, boolean>) {
  let latest: Record<string, ModalSlot> = {};

  function Harness({ desired }: { desired: Record<string, boolean> }) {
    latest = useModalCoordinator(desired);
    return null;
  }

  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<Harness desired={initialDesired} />);
  });

  return {
    get: () => latest,
    setDesired: (desired: Record<string, boolean>) => {
      act(() => {
        renderer.update(<Harness desired={desired} />);
      });
      return latest;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('useModalCoordinator', () => {
  it('promotes the only desired slot immediately when nothing else is active', () => {
    const h = renderCoordinator({ a: false, b: false });
    expect(h.get().a.visible).toBe(false);
    expect(h.get().b.visible).toBe(false);

    const after = h.setDesired({ a: true, b: false });
    expect(after.a.visible).toBe(true);
    expect(after.b.visible).toBe(false);
  });

  it("displaces an already-visible slot, but doesn't promote the new one until the old one's onDismiss fires", () => {
    const h = renderCoordinator({ a: true, b: false });
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
    const h = renderCoordinator({ a: true, b: false });
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
    const h = renderCoordinator({ a: false, b: false, c: false });

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
    const h = renderCoordinator({ a: true, b: false });
    expect(h.get().a.visible).toBe(true);
  });
});
