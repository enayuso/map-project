/**
 * JS side of iOS Spotlight search integration — per docs/research/
 * 10-remaining-feature-gaps.md, the cheapest genuinely native-iOS win on
 * the shortlist (no new Xcode target needed, unlike Live Activity). Talks
 * to ios/BelizeMap/SpotlightModule.swift, exposed via the legacy
 * RCTEventEmitter/RCT_EXTERN_MODULE bridge (still honored by the New
 * Architecture's interop layer for a module this small).
 *
 * Every function here is a no-op on a platform/build where the native
 * module isn't present (Android — excluded from this project entirely
 * per its own iOS-only scope, or a JS environment like Jest with no
 * native modules linked) rather than throwing, since this is pure polish,
 * never something the rest of the app depends on.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { SearchResult } from '../search/api';

const { SpotlightModule } = NativeModules;

type SpotlightEvents = {
  SpotlightItemSelected: readonly [{ id: string }];
};

export function indexSpotlightItems(items: SearchResult[]): void {
  if (Platform.OS !== 'ios' || !SpotlightModule) return;
  SpotlightModule.indexItems(
    items.map(i => ({ id: i.id, title: i.name, subtitle: i.subtitle })),
  );
}

export function clearSpotlightIndex(): void {
  if (Platform.OS !== 'ios' || !SpotlightModule) return;
  SpotlightModule.deindexAll();
}

/**
 * Calls onSelect(id) whenever the user taps one of this app's indexed
 * Spotlight results — both for a live app (native event) and a cold
 * launch (checked once via getPendingItemId, since the tap may have
 * happened before any JS listener could possibly have attached yet).
 * Returns an unsubscribe function.
 */
export function subscribeToSpotlightSelection(onSelect: (id: string) => void): () => void {
  if (Platform.OS !== 'ios' || !SpotlightModule) return () => {};

  const emitter = new NativeEventEmitter<SpotlightEvents>(SpotlightModule);
  const subscription = emitter.addListener('SpotlightItemSelected', event => {
    onSelect(event.id);
  });

  SpotlightModule.getPendingItemId()
    .then((id: string | null) => {
      if (id) onSelect(id);
    })
    .catch(() => {
      // No pending id, or the native call itself failed — either way,
      // nothing to do; live taps still work via the listener above.
    });

  return () => subscription.remove();
}
