import SwiftUI
import WidgetKit

/// Home screen widget — per docs/research/10-remaining-feature-gaps.md,
/// a genuine "only possible on iOS" polish item, reusing data (weather,
/// favorites) already built rather than fetching anything new itself.
/// Widgets can't make their own network calls on a useful cadence here —
/// this just displays whatever WidgetDataModule.swift (main app target)
/// last wrote to the shared App Group store, refreshed whenever the app
/// itself refreshes weather/favorites (WidgetCenter.reloadAllTimelines()),
/// with a periodic fallback refresh in case the app hasn't been opened
/// in a while.
struct BelizeMapHomeEntry: TimelineEntry {
  let date: Date
  let data: WidgetSharedData?
}

struct BelizeMapHomeProvider: TimelineProvider {
  func placeholder(in context: Context) -> BelizeMapHomeEntry {
    BelizeMapHomeEntry(date: Date(), data: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (BelizeMapHomeEntry) -> Void) {
    completion(BelizeMapHomeEntry(date: Date(), data: WidgetSharedData.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<BelizeMapHomeEntry>) -> Void) {
    let entry = BelizeMapHomeEntry(date: Date(), data: WidgetSharedData.load())
    let nextUpdate = Calendar.current.date(byAdding: .hour, value: 2, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
  }
}

struct BelizeMapHomeWidgetView: View {
  var entry: BelizeMapHomeEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    if let data = entry.data {
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 6) {
          Text(data.weatherEmoji ?? "🌤️").font(.title2)
          Text(data.tempDisplay ?? "—").font(.headline)
        }
        if let label = data.weatherLabel {
          Text(label).font(.caption).foregroundStyle(.secondary)
        }
        if family == .systemMedium, !data.favorites.isEmpty {
          Divider()
          ForEach(data.favorites, id: \.name) { fav in
            Text("📍 \(fav.name)")
              .font(.caption)
              .lineLimit(1)
          }
        }
      }
      .padding(12)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      Text("Open Belize Map to load weather & favorites")
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}

struct BelizeMapHomeWidget: Widget {
  let kind = "BelizeMapHomeWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: BelizeMapHomeProvider()) { entry in
      if #available(iOS 17.0, *) {
        BelizeMapHomeWidgetView(entry: entry)
          .containerBackground(.fill.tertiary, for: .widget)
      } else {
        BelizeMapHomeWidgetView(entry: entry)
          .background(Color(uiColor: .systemBackground))
      }
    }
    .configurationDisplayName("Belize Map")
    .description("Current weather and your saved places.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
