import CoreText
import Foundation
import SwiftUI
import UIKit

/// The App Group the app writes to (src/widgets/publish.ios.ts) and the widgets read from:
/// "group." and the app's bundle id, which is this extension's without ".widget", so the
/// preview build (app.airstrive.mobile.preview) gets its own.
let appGroup: String = {
  let id = Bundle.main.bundleIdentifier ?? "app.airstrive.mobile.widget"
  return "group." + (id.hasSuffix(".widget") ? String(id.dropLast(".widget".count)) : id)
}()

/// What the app last saved for the widgets: your grids with their open squares, your newest
/// moments, and what friends shared. Kept in step with WidgetSnapshot in src/widgets/snapshot.ts.
struct Snapshot: Codable {
  var v: Int
  var waiting: Int
  var grids: [Grid]
  var lately: [Moment]
  var friends: [FriendMoment]

  struct Grid: Codable {
    var id: String
    var title: String
    var color: String
    var cols: Int
    var rows: Int
    var done: Int
    var total: Int
    /// One letter per square: h hidden, r revealed, d done.
    var states: String
    var complete: Bool
    var open: [Square]
  }

  struct Square: Codable {
    var id: String
    var idx: Int
    var prompt: String
  }

  struct Moment: Codable {
    var id: String
    var caption: String
    var grid: String
    var color: String
    /// yyyy-mm-dd
    var date: String
    /// Relative to the App Group folder, or nil for a moment with no photo.
    var photo: String?
  }

  struct FriendMoment: Codable {
    var name: String
    var title: String
    var grid: String
  }

  static var folder: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
  }

  static func load() -> Snapshot? {
    guard let url = folder?.appendingPathComponent("widget.json"),
          let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: data)
  }

  /// Next up across the shelf, taking turns between grids: each grid's first open square, then
  /// each grid's second, and so on, so the widget moves from grid to grid.
  var nextUps: [(grid: Grid, square: Square)] {
    let live = grids.filter { !$0.complete && !$0.open.isEmpty }
    let rounds = live.map(\.open.count).max() ?? 0
    var out: [(grid: Grid, square: Square)] = []
    for r in 0..<rounds {
      for g in live where r < g.open.count { out.append((grid: g, square: g.open[r])) }
    }
    return out
  }

  /// Moments with a photo first, so Lately shows pictures when there are any.
  var photoMoments: [Moment] {
    let withPhoto = lately.filter { $0.photo != nil }
    return withPhoto.isEmpty ? lately : withPhoto
  }

  func photo(_ m: Moment) -> UIImage? {
    guard let rel = m.photo, let url = Snapshot.folder?.appendingPathComponent(rel) else { return nil }
    return UIImage(contentsOfFile: url.path)
  }

  /// Shown in the widget gallery and while a widget first loads.
  static let sample = Snapshot(
    v: 1,
    waiting: 19,
    grids: [
      Grid(id: "", title: "Us and the dog", color: "#F0634A", cols: 6, rows: 8, done: 1, total: 48,
           states: sampleStates(48, done: [21], revealed: [14, 20, 22, 27, 28]), complete: false,
           open: [Square(id: "", idx: 15, prompt: "A walk in the snow")]),
      Grid(id: "", title: "Chess", color: "#3B9BE0", cols: 6, rows: 8, done: 14, total: 48,
           states: sampleStates(48, done: Array(13...26), revealed: [8, 9, 10, 31, 32, 33]), complete: false,
           open: [Square(id: "", idx: 27, prompt: "Teach someone the moves")]),
      Grid(id: "", title: "Fall", color: "#C4612D", cols: 6, rows: 8, done: 0, total: 48,
           states: sampleStates(48, done: [], revealed: [20, 21, 27]), complete: false,
           open: [Square(id: "", idx: 26, prompt: "Make a fall playlist")]),
      Grid(id: "", title: "Running", color: "#F5B61C", cols: 8, rows: 10, done: 1, total: 80,
           states: sampleStates(80, done: [35], revealed: [27, 34, 36, 43, 44]), complete: false,
           open: [Square(id: "", idx: 28, prompt: "Run on a track, just once")]),
    ],
    lately: [
      Moment(id: "", caption: "Run with someone slower and match them", grid: "Running", color: "#2EB08A", date: "2026-10-30", photo: nil),
      Moment(id: "", caption: "Snow angels", grid: "Us and the dog", color: "#3B9BE0", date: "2026-10-28", photo: nil),
    ],
    friends: [
      FriendMoment(name: "Maya", title: "Sunrise swim", grid: "Summer"),
      FriendMoment(name: "Jordan", title: "Bake bread from scratch", grid: "Kitchen"),
    ]
  )

  private static func sampleStates(_ n: Int, done: [Int], revealed: [Int]) -> String {
    String((0..<n).map { done.contains($0) ? "d" : revealed.contains($0) ? "r" : "h" })
  }
}

// MARK: - Links into the app (Expo Router paths under the airstrive:// scheme)

enum AppLink {
  static let home = URL(string: "airstrive://")!

  static func square(grid: String, square: String) -> URL {
    guard !grid.isEmpty else { return home }
    return URL(string: square.isEmpty ? "airstrive://grid/\(grid)" : "airstrive://grid/\(grid)?select=\(square)") ?? home
  }

  static func moment(_ id: String) -> URL {
    id.isEmpty ? home : URL(string: "airstrive://lane/\(id)") ?? home
  }
}

// MARK: - Look

enum Palette {
  static let accent = Color(hex: "#F5B61C")
  static let ink = Color(hex: "#1F2937")
  static let muted = Color(hex: "#5B6470")
  /// accentDeep darkened so small labels pass contrast on white.
  static let label = Color(hex: "#946700")
  static let line = Color(hex: "#E6E9EE")
  static let hidden = Color(hex: "#ECEEF1")
  static let paper = Color(hex: "#FBFAF7")
  static let scrap = Color(hex: "#F6F1E7")
  static let scrapInk = Color(hex: "#6E6250")
  static let tape = Color(red: 245 / 255, green: 196 / 255, blue: 81 / 255).opacity(0.78)
}

extension Color {
  init(hex: String) {
    let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var n: UInt64 = 0
    Scanner(string: s).scanHexInt64(&n)
    if s.count != 6 { n = 0xF5B61C }
    self.init(red: Double((n >> 16) & 0xFF) / 255, green: Double((n >> 8) & 0xFF) / 255, blue: Double(n & 0xFF) / 255)
  }
}

/// The app's fonts, bundled with the widget and registered the first time one is asked for.
enum Fonts {
  private static let registered: Bool = {
    let urls = (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [])
      + (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: "assets") ?? [])
    for url in urls { _ = CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil) }
    return true
  }()

  static func display(_ size: CGFloat) -> Font { _ = registered; return .custom("Fredoka-SemiBold", size: size) }
  static func body(_ size: CGFloat) -> Font { _ = registered; return .custom("Nunito-Bold", size: size) }
  static func heavy(_ size: CGFloat) -> Font { _ = registered; return .custom("Nunito-ExtraBold", size: size) }
  static func hand(_ size: CGFloat) -> Font { _ = registered; return .custom("Caveat-Medium", size: size) }
}

func shortDate(_ day: String) -> String {
  let parse = DateFormatter()
  parse.dateFormat = "yyyy-MM-dd"
  parse.locale = Locale(identifier: "en_US_POSIX")
  guard let d = parse.date(from: String(day.prefix(10))) else { return "" }
  let out = DateFormatter()
  out.setLocalizedDateFormatFromTemplate("MMM d")
  return out.string(from: d)
}
