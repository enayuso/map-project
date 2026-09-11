import Foundation

/// Shared between the main app target (writer, via WidgetDataModule.swift)
/// and the BelizeMapWidgets extension (reader, via BelizeMapHomeWidget.swift)
/// — membership in both targets, same pattern as NavigationActivityAttributes.swift.
///
/// Stored as JSON in a shared App Group UserDefaults suite rather than a
/// file — this is small (current weather + up to 3 favorites) and
/// UserDefaults(suiteName:) is the simplest shared-storage primitive that
/// behaves identically whether read from a native module or a WidgetKit
/// timeline provider. Requires the "App Groups" entitlement on both
/// targets (see BelizeMap.entitlements / BelizeMapWidgets.entitlements).
struct WidgetFavorite: Codable {
  let name: String
  let subtitle: String
}

struct WidgetSharedData: Codable {
  var weatherEmoji: String?
  var weatherLabel: String?
  var tempDisplay: String?
  var favorites: [WidgetFavorite]
  var updatedAt: String

  static let appGroupId = "group.org.reactjs.native.example.BelizeMap"
  private static let storageKey = "widgetSharedData"

  static func load() -> WidgetSharedData? {
    guard
      let defaults = UserDefaults(suiteName: appGroupId),
      let raw = defaults.string(forKey: storageKey),
      let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetSharedData.self, from: data)
  }

  func save() {
    guard
      let defaults = UserDefaults(suiteName: WidgetSharedData.appGroupId),
      let data = try? JSONEncoder().encode(self),
      let raw = String(data: data, encoding: .utf8)
    else { return }
    defaults.set(raw, forKey: WidgetSharedData.storageKey)
  }
}
