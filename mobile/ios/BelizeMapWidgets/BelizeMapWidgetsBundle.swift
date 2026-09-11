import SwiftUI
import WidgetKit

@main
struct BelizeMapWidgetsBundle: WidgetBundle {
  var body: some Widget {
    BelizeMapHomeWidget()
    if #available(iOS 16.2, *) {
      BelizeMapWidgetsLiveActivity()
    }
  }
}
