/**
 * iOS home screen widget — per docs/research/10-remaining-feature-gaps.md,
 * a genuine "only possible on iOS" polish item. The widget itself
 * (ios/BelizeMapWidgets/BelizeMapHomeWidget.swift) can't usefully fetch
 * its own data on a live cadence, so this is a one-way mirror: whenever
 * this app's own weather/favorites state changes, push a copy into a
 * shared App Group store (ios/BelizeMap/WidgetSharedData.swift) via
 * WidgetDataModule.swift, the same legacy RCT_EXTERN_MODULE bridge as
 * Spotlight/LiveActivity.
 *
 * No-op wherever the native module isn't present, same as every other
 * native-iOS bridge in this app — this is pure polish, never load-bearing.
 */

import { NativeModules, Platform } from 'react-native';

const { WidgetDataModule } = NativeModules;

export type WidgetUpdate = {
  weatherEmoji?: string;
  weatherLabel?: string;
  tempDisplay?: string;
  favorites: { name: string; subtitle: string }[];
};

export function updateWidgetData(update: WidgetUpdate): void {
  if (Platform.OS !== 'ios' || !WidgetDataModule) return;
  WidgetDataModule.updateWidgetData(update);
}
