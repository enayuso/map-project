import ActivityKit
import Foundation

/// Shared between the main app target (which starts/updates/ends the
/// activity from LiveActivityModule.swift) and the BelizeMapWidgets
/// extension (which renders it) — an ActivityAttributes type must be
/// visible to both, so this file has membership in both targets.
///
/// Per docs/research/10-remaining-feature-gaps.md: the single most
/// "Kakao/Naver literally cannot do this" feature available, since
/// Live Activities/Dynamic Island are iOS-only — directly extends the
/// existing Valhalla-powered turn-by-turn navigation (src/routing/) rather
/// than being a separate feature.
@available(iOS 16.2, *)
struct NavigationActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Human-readable next-turn instruction, straight from Valhalla's own
    /// maneuver text (src/routing/api.ts's RouteManeuver.instruction) — no
    /// re-derivation here, just display.
    var nextInstruction: String
    /// Distance to that maneuver, km — matches the precision the in-app
    /// NavigationBar already shows.
    var distanceToManeuverKm: Double
    /// Minutes remaining for the whole trip, not just to the next turn —
    /// this is what a glance at the Dynamic Island is really for.
    var etaMinutes: Int
    /// Emoji for the upcoming maneuver, reusing the same mapping already
    /// established in src/routing/navigation.ts's MANEUVER_ICONS, computed
    /// on the JS side and passed through rather than duplicated in Swift.
    var maneuverEmoji: String
  }

  /// Static for the lifetime of one activity — the travel mode, shown
  /// alongside the dynamic per-update fields above.
  var costingLabel: String
}
