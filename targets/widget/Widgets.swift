import SwiftUI
import WidgetKit

@main
struct AirStriveWidgets: WidgetBundle {
  var body: some Widget {
    NextUpWidget()
    LatelyWidget()
    ShelfWidget()
    ScrapbookWidget()
  }
}

/// One entry an hour for the next twelve hours. `turn` moves Next up and Lately along, so the
/// widget changes through the day without the app running; the app reloads it when data changes.
struct Entry: TimelineEntry {
  let date: Date
  let snapshot: Snapshot?
  let turn: Int
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), snapshot: .sample, turn: 0)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: Date(), snapshot: context.isPreview ? (Snapshot.load() ?? .sample) : Snapshot.load(), turn: 0))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let snapshot = Snapshot.load()
    let now = Date()
    // Start from the hour of the day, so a reload doesn't always go back to the first square.
    let start = Calendar.current.component(.hour, from: now)
    let entries = (0..<12).map { i in
      Entry(date: now.addingTimeInterval(Double(i) * 3600), snapshot: snapshot, turn: start + i)
    }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}

struct NextUpWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NextUp", provider: Provider()) { entry in
      NextUpView(entry: entry).widgetBackground(.white)
    }
    .configurationDisplayName("Next up")
    .description("A square waiting on your shelf, a different one each hour.")
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}

struct LatelyWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "Lately", provider: Provider()) { entry in
      LatelyView(entry: entry).widgetBackground(Palette.scrap)
    }
    .configurationDisplayName("Lately")
    .description("Your newest moments as polaroids, a different one each hour.")
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}

struct ShelfWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "Shelf", provider: Provider()) { entry in
      ShelfView(entry: entry).widgetBackground(.white)
    }
    .configurationDisplayName("Your grids")
    .description("Four of your grids at a glance.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

struct ScrapbookWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "Scrapbook", provider: Provider()) { entry in
      ScrapbookView(entry: entry).widgetBackground(.white)
    }
    .configurationDisplayName("Scrapbook")
    .description("Lately, Next up and what friends shared, together.")
    .supportedFamilies([.systemLarge])
    .contentMarginsDisabled()
  }
}

extension View {
  func widgetBackground(_ color: Color) -> some View {
    containerBackground(for: .widget) { color }
  }
}
