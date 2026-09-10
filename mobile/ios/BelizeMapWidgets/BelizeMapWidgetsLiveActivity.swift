import ActivityKit
import SwiftUI
import WidgetKit

/// Renders the Live Activity started by LiveActivityModule.swift (main
/// app target) on the Lock Screen banner and the Dynamic Island — see
/// BelizeMap/NavigationActivityAttributes.swift for the shared data shape
/// this reads.
@available(iOS 16.2, *)
struct BelizeMapWidgetsLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: NavigationActivityAttributes.self) { context in
      LockScreenView(context: context)
        .activityBackgroundTint(Color(red: 0.996, green: 0.996, blue: 0.996))
        .activitySystemActionForegroundColor(Color(red: 0.227, green: 0.196, blue: 0.149))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(context.state.maneuverEmoji).font(.title2)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text("\(context.state.etaMinutes) min").font(.headline)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(context.state.nextInstruction)
            .font(.subheadline)
            .lineLimit(2)
        }
      } compactLeading: {
        Text(context.state.maneuverEmoji)
      } compactTrailing: {
        Text("\(context.state.etaMinutes)m")
      } minimal: {
        Text(context.state.maneuverEmoji)
      }
    }
  }
}

@available(iOS 16.2, *)
private struct LockScreenView: View {
  let context: ActivityViewContext<NavigationActivityAttributes>

  var body: some View {
    HStack(spacing: 14) {
      Text(context.state.maneuverEmoji)
        .font(.system(size: 34))
      VStack(alignment: .leading, spacing: 4) {
        Text(context.state.nextInstruction)
          .font(.subheadline)
          .fontWeight(.semibold)
          .lineLimit(2)
        Text(
          String(
            format: "%.1f km · %d min left · %@",
            context.state.distanceToManeuverKm,
            context.state.etaMinutes,
            context.attributes.costingLabel
          )
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      Spacer()
    }
    .padding(16)
  }
}
