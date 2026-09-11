import Foundation
import React
import WidgetKit

/// Bridges JS (src/widget/api.ts) to the shared App Group store the home
/// screen widget reads from — see WidgetSharedData.swift. Same legacy
/// RCT_EXTERN_MODULE bridging approach as SpotlightModule.swift/
/// LiveActivityModule.swift.
///
/// Purely a one-way mirror: App.tsx already holds weather/favorites as
/// its own state (fetched from Open-Meteo / AsyncStorage respectively);
/// this module just copies the current values into shared storage
/// whenever they change and asks WidgetKit to refresh, exactly like
/// LiveActivityModule.swift mirrors navigation state into ActivityKit.
@objc(WidgetDataModule)
class WidgetDataModule: NSObject, RCTBridgeModule {
  static func moduleName() -> String! {
    "WidgetDataModule"
  }

  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(updateWidgetData:)
  func updateWidgetData(_ data: [String: Any]) {
    let favoritesRaw = data["favorites"] as? [[String: Any]] ?? []
    let favorites: [WidgetFavorite] = favoritesRaw.prefix(3).compactMap { f in
      guard let name = f["name"] as? String else { return nil }
      return WidgetFavorite(name: name, subtitle: f["subtitle"] as? String ?? "")
    }

    let shared = WidgetSharedData(
      weatherEmoji: data["weatherEmoji"] as? String,
      weatherLabel: data["weatherLabel"] as? String,
      tempDisplay: data["tempDisplay"] as? String,
      favorites: favorites,
      updatedAt: ISO8601DateFormatter().string(from: Date())
    )
    shared.save()

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
