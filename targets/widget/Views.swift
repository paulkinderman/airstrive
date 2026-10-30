import SwiftUI
import WidgetKit

// MARK: - Pieces

/// A grid drawn small, like MiniGrid in the app: done squares in the grid's color, revealed ones
/// tinted, hidden ones grey, and `ring` outlined (the Next up square).
struct MiniGrid: View {
  let states: String
  let cols: Int
  let color: Color
  let cell: CGFloat
  var gap: CGFloat = 3
  var ring: Int? = nil

  var body: some View {
    let chars = Array(states)
    let rows = max(1, (chars.count + cols - 1) / max(cols, 1))
    VStack(spacing: gap) {
      ForEach(0..<rows, id: \.self) { r in
        HStack(spacing: gap) {
          ForEach(0..<cols, id: \.self) { c in
            let i = r * cols + c
            square(i < chars.count ? chars[i] : "h", ringed: i == ring)
          }
        }
      }
    }
    .accessibilityHidden(true)
  }

  @ViewBuilder
  private func square(_ state: Character, ringed: Bool) -> some View {
    let shape = RoundedRectangle(cornerRadius: max(1, cell / 3.5), style: .continuous)
    if ringed {
      shape.fill(Color.white)
        .overlay(shape.strokeBorder(color, lineWidth: cell > 8 ? 2 : 1.5))
        .frame(width: cell, height: cell)
    } else {
      shape.fill(state == "d" ? color : state == "r" ? color.opacity(0.33) : Palette.hidden)
        .frame(width: cell, height: cell)
    }
  }

  /// The largest whole-point square that fits the grid in `width` × `height`.
  static func cell(cols: Int, rows: Int, width: CGFloat, height: CGFloat, gap: CGFloat, max top: CGFloat) -> CGFloat {
    let w = (width - gap * CGFloat(cols - 1)) / CGFloat(max(cols, 1))
    let h = (height - gap * CGFloat(rows - 1)) / CGFloat(max(rows, 1))
    return max(2, min(top, floor(min(w, h))))
  }
}

/// The logo from the app's header: a three by three grid with two squares lit.
struct AppGlyph: View {
  var cell: CGFloat = 5
  var body: some View {
    MiniGrid(states: "hdhrhrhhh", cols: 3, color: Palette.accent, cell: cell, gap: cell * 0.3)
  }
}

struct Caps: View {
  let text: String
  var size: CGFloat = 11
  var color: Color = Palette.label
  init(_ text: String, size: CGFloat = 11, color: Color = Palette.label) {
    self.text = text
    self.size = size
    self.color = color
  }
  var body: some View {
    Text(text.uppercased()).font(Fonts.heavy(size)).tracking(1.4).foregroundColor(color).lineLimit(1)
  }
}

/// A taped polaroid from the Lately stack. Without a caption it keeps a deeper bottom edge.
struct Polaroid: View {
  let image: UIImage?
  let fill: Color
  var caption: String? = nil
  let width: CGFloat
  let photoHeight: CGFloat
  var captionSize: CGFloat = 16
  var tape = false

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Group {
        if let image {
          Image(uiImage: image).resizable().scaledToFill()
        } else {
          Rectangle().fill(fill)
        }
      }
      .frame(width: width - 14, height: photoHeight)
      .clipped()
      if let caption {
        Text(caption)
          .font(Fonts.hand(captionSize))
          .foregroundColor(Palette.ink)
          .lineLimit(2)
          .minimumScaleFactor(0.75)
          .frame(width: width - 14, alignment: .leading)
      }
    }
    .padding(.horizontal, 7)
    .padding(.top, 7)
    .padding(.bottom, caption == nil ? 16 : 6)
    .background(Color.white)
    .shadow(color: Palette.ink.opacity(0.16), radius: 5, x: 0, y: 3)
    .overlay(alignment: .top) {
      if tape {
        Rectangle().fill(Palette.tape).frame(width: width * 0.42, height: 13).rotationEffect(.degrees(-6)).offset(y: -7)
      }
    }
  }
}

struct Message: View {
  let text: String
  var body: some View {
    VStack(spacing: 10) {
      AppGlyph(cell: 7)
      Text(text)
        .font(Fonts.body(13))
        .foregroundColor(Palette.muted)
        .multilineTextAlignment(.center)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private let avatarColors = ["#2E8A6E", "#4C6EB1", "#C4612D", "#9C8CB8", "#3B9BE0", "#F0634A"]

struct Avatar: View {
  let name: String
  var body: some View {
    let h = name.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
    Text(String(name.prefix(1)).uppercased())
      .font(Fonts.display(13))
      .foregroundColor(.white)
      .frame(width: 28, height: 28)
      .background(Circle().fill(Color(hex: avatarColors[h % avatarColors.count])))
      .overlay(Circle().strokeBorder(Color.white, lineWidth: 2))
  }
}

// MARK: - Next up (small and medium)

struct NextUpView: View {
  let entry: Entry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    if let snap = entry.snapshot {
      let items = snap.nextUps
      if items.isEmpty {
        Message(text: snap.grids.isEmpty ? "Add a grid in AirStrive to see Next up here." : "Nothing waiting. Reveal a square in AirStrive.")
      } else {
        let item = items[entry.turn % items.count]
        Group {
          if family == .systemMedium {
            medium(snap, item.grid, item.square)
          } else {
            small(item.grid, item.square)
          }
        }
        .widgetURL(AppLink.square(grid: item.grid.id, square: item.square.id))
      }
    } else {
      Message(text: "Open AirStrive to see Next up here.")
    }
  }

  private func small(_ g: Snapshot.Grid, _ s: Snapshot.Square) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Caps("Next up")
        Spacer()
        AppGlyph(cell: 4.5)
      }
      Spacer(minLength: 6)
      Text(s.prompt)
        .font(Fonts.display(22))
        .foregroundColor(Palette.ink)
        .lineLimit(3)
        .minimumScaleFactor(0.7)
      Spacer(minLength: 6)
      HStack(spacing: 6) {
        RoundedRectangle(cornerRadius: 3).fill(Color(hex: g.color)).frame(width: 8, height: 8)
        Text(g.title).font(Fonts.body(12)).foregroundColor(Palette.muted).lineLimit(1)
        Spacer(minLength: 4)
        Text("\(g.done)/\(g.total)").font(Fonts.body(12)).foregroundColor(Palette.muted)
      }
    }
    .padding(16)
  }

  private func medium(_ snap: Snapshot, _ g: Snapshot.Grid, _ s: Snapshot.Square) -> some View {
    // One dot per grid with something waiting, the current grid's drawn long in its color.
    var shelf: [String] = []
    for i in snap.nextUps where !shelf.contains(i.grid.id) { shelf.append(i.grid.id) }
    let current = shelf.firstIndex(of: g.id) ?? 0
    let color = Color(hex: g.color)
    return HStack(spacing: 18) {
      ZStack {
        RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Palette.paper)
        MiniGrid(states: g.states, cols: g.cols, color: color,
                 cell: MiniGrid.cell(cols: g.cols, rows: g.rows, width: 96, height: 118, gap: 3, max: 12),
                 gap: 3, ring: s.idx)
      }
      .frame(width: 120)
      VStack(alignment: .leading, spacing: 0) {
        Caps("Next up")
        Spacer(minLength: 4)
        Text(s.prompt)
          .font(Fonts.display(24))
          .foregroundColor(Palette.ink)
          .lineLimit(3)
          .minimumScaleFactor(0.7)
        Text("\(g.title) · \(g.done) of \(g.total)")
          .font(Fonts.body(13))
          .foregroundColor(Palette.muted)
          .lineLimit(1)
          .padding(.top, 5)
        Spacer(minLength: 4)
        if shelf.count > 1 {
          HStack(spacing: 5) {
            ForEach(0..<min(shelf.count, 6), id: \.self) { i in
              Capsule()
                .fill(i == current ? color : Color(hex: "#D5DAE1"))
                .frame(width: i == current ? 16 : 6, height: 6)
            }
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(16)
  }
}

// MARK: - Lately (small and medium)

struct LatelyView: View {
  let entry: Entry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    if let snap = entry.snapshot, !snap.photoMoments.isEmpty {
      let list = snap.photoMoments
      let m = list[entry.turn % list.count]
      let under = list.count > 1 ? list[(entry.turn + 1) % list.count] : nil
      Group {
        if family == .systemMedium {
          LatelyMedium(snap: snap, moment: m, under: under)
        } else {
          small(snap, m, under)
        }
      }
      .widgetURL(AppLink.moment(m.id))
    } else {
      Message(text: entry.snapshot == nil ? "Open AirStrive to see your moments here." : "Your moments will show up here.")
    }
  }

  private func small(_ snap: Snapshot, _ m: Snapshot.Moment, _ under: Snapshot.Moment?) -> some View {
    ZStack(alignment: .topLeading) {
      ZStack {
        if let under {
          Polaroid(image: snap.photo(under), fill: Color(hex: under.color), width: 102, photoHeight: 96)
            .rotationEffect(.degrees(5))
            .offset(x: 8, y: 2)
        }
        Polaroid(image: snap.photo(m), fill: Color(hex: m.color), caption: m.caption, width: 110, photoHeight: 78, captionSize: 16, tape: true)
          .rotationEffect(.degrees(-4))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .padding(.top, 16)
      Caps("Lately", size: 10, color: Palette.scrapInk)
        .padding(.leading, 14)
        .padding(.top, 12)
    }
  }
}

/// Lately's medium layout, also the top of the Scrapbook: two polaroids and the caption beside them.
struct LatelyMedium: View {
  let snap: Snapshot
  let moment: Snapshot.Moment
  let under: Snapshot.Moment?
  var captionSize: CGFloat = 25

  var body: some View {
    HStack(spacing: 14) {
      ZStack {
        if let under {
          Polaroid(image: snap.photo(under), fill: Color(hex: under.color), width: 112, photoHeight: 98)
            .rotationEffect(.degrees(7))
            .offset(x: 20, y: 2)
        }
        Polaroid(image: snap.photo(moment), fill: Color(hex: moment.color), width: 118, photoHeight: 104, tape: true)
          .rotationEffect(.degrees(-5))
          .offset(x: -6)
      }
      .frame(width: 164)
      VStack(alignment: .leading, spacing: 0) {
        Caps("Lately", size: 10, color: Palette.scrapInk)
        Spacer(minLength: 4)
        Text(moment.caption)
          .font(Fonts.hand(captionSize))
          .foregroundColor(Palette.ink)
          .lineLimit(3)
          .minimumScaleFactor(0.6)
        Spacer(minLength: 4)
        Caps("\(moment.grid) · \(shortDate(moment.date))", size: 10, color: Palette.scrapInk)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(16)
  }
}

// MARK: - Your grids (medium)

struct ShelfView: View {
  let entry: Entry

  var body: some View {
    if let snap = entry.snapshot, !snap.grids.isEmpty {
      let grids = Array(snap.grids.prefix(4))
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Caps("Your grids", color: Palette.muted)
          Spacer()
          if snap.waiting > 0 {
            Text("\(snap.waiting) waiting").font(Fonts.body(12)).foregroundColor(Palette.label)
          }
        }
        HStack(alignment: .top, spacing: 8) {
          ForEach(Array(grids.enumerated()), id: \.offset) { _, g in
            Link(destination: AppLink.square(grid: g.id, square: g.open.first?.id ?? "")) {
              VStack(alignment: .leading, spacing: 6) {
                MiniGrid(states: g.states, cols: g.cols, color: Color(hex: g.color),
                         cell: MiniGrid.cell(cols: g.cols, rows: g.rows, width: 70, height: 62, gap: 2, max: 7),
                         gap: 2, ring: g.complete ? nil : g.open.first?.idx)
                  .frame(height: 62, alignment: .topLeading)
                Text(g.title).font(Fonts.display(14)).foregroundColor(Palette.ink).lineLimit(1)
                Text(g.complete ? "Complete" : "\(g.done) of \(g.total)")
                  .font(Fonts.body(11)).foregroundColor(Palette.muted).padding(.top, -4)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
          ForEach(grids.count..<4, id: \.self) { _ in
            Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
          }
        }
        Spacer(minLength: 0)
      }
      .padding(16)
      .widgetURL(AppLink.home)
    } else {
      Message(text: entry.snapshot == nil ? "Open AirStrive to see your grids here." : "Add a grid in AirStrive to see it here.")
    }
  }
}

// MARK: - Scrapbook (large)

struct ScrapbookView: View {
  let entry: Entry

  var body: some View {
    if let snap = entry.snapshot {
      VStack(spacing: 0) {
        lately(snap)
          .frame(height: 200)
          .background(Palette.scrap)
        VStack(alignment: .leading, spacing: 0) {
          nextUp(snap)
          Spacer(minLength: 8)
          Rectangle().fill(Palette.line).frame(height: 1)
          Spacer(minLength: 8)
          friends(snap)
        }
        .padding(16)
        .frame(maxHeight: .infinity)
      }
      .widgetURL(AppLink.home)
    } else {
      Message(text: "Open AirStrive to fill your scrapbook.")
    }
  }

  @ViewBuilder
  private func lately(_ snap: Snapshot) -> some View {
    let list = snap.photoMoments
    if list.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Caps("Lately", size: 10, color: Palette.scrapInk)
        Spacer()
        Text("Your moments will show up here.").font(Fonts.hand(24)).foregroundColor(Palette.ink)
        Spacer()
      }
      .padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      let m = list[entry.turn % list.count]
      Link(destination: AppLink.moment(m.id)) {
        LatelyMedium(snap: snap, moment: m, under: list.count > 1 ? list[(entry.turn + 1) % list.count] : nil, captionSize: 26)
      }
    }
  }

  @ViewBuilder
  private func nextUp(_ snap: Snapshot) -> some View {
    let items = snap.nextUps
    if items.isEmpty {
      HStack(spacing: 12) {
        AppGlyph(cell: 9)
        Text(snap.grids.isEmpty ? "Add a grid to see Next up here." : "Nothing waiting. Reveal a square.")
          .font(Fonts.body(13)).foregroundColor(Palette.muted)
      }
    } else {
      let item = items[entry.turn % items.count]
      let g = item.grid
      Link(destination: AppLink.square(grid: g.id, square: item.square.id)) {
        HStack(spacing: 12) {
          MiniGrid(states: g.states, cols: g.cols, color: Color(hex: g.color),
                   cell: MiniGrid.cell(cols: g.cols, rows: g.rows, width: 62, height: 66, gap: 2, max: 7),
                   gap: 2, ring: item.square.idx)
          VStack(alignment: .leading, spacing: 1) {
            Caps("Next up")
            Text(item.square.prompt)
              .font(Fonts.display(19))
              .foregroundColor(Palette.ink)
              .lineLimit(2)
              .minimumScaleFactor(0.8)
            Text(g.title).font(Fonts.body(12)).foregroundColor(Palette.muted).lineLimit(1)
          }
          Spacer(minLength: 0)
        }
      }
    }
  }

  /// Up to three different friends, newest first, for the row of faces.
  private static func names(_ friends: [Snapshot.FriendMoment]) -> [String] {
    var out: [String] = []
    for f in friends where !out.contains(f.name) && out.count < 3 { out.append(f.name) }
    return out
  }

  @ViewBuilder
  private func friends(_ snap: Snapshot) -> some View {
    if let first = snap.friends.first {
      HStack(spacing: 10) {
        HStack(spacing: -8) {
          ForEach(Self.names(snap.friends), id: \.self) { Avatar(name: $0) }
        }
        (Text(first.name).font(Fonts.heavy(13))
          + Text(" did ").font(Fonts.body(13)).foregroundColor(Palette.muted)
          + Text(first.title).font(Fonts.body(13))
          + Text(snap.friends.count > 1 ? " · \(snap.friends.count - 1) more from friends" : "").font(Fonts.body(13)).foregroundColor(Palette.muted))
          .foregroundColor(Palette.ink)
          .lineLimit(2)
        Spacer(minLength: 0)
      }
    } else {
      HStack(spacing: 10) {
        AppGlyph(cell: 6)
        Text(snap.waiting == 1 ? "1 square waiting" : "\(snap.waiting) squares waiting")
          .font(Fonts.body(13)).foregroundColor(Palette.muted)
        Spacer(minLength: 0)
      }
    }
  }
}
