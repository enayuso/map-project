import ActivityKit
import Foundation
import React

/// Bridges JS (src/routing/liveActivity.ts) to ActivityKit, starting/
/// updating/ending the Live Activity that BelizeMapWidgets renders on the
/// Lock Screen and Dynamic Island. Same legacy RCT_EXTERN_MODULE bridging
/// approach as SpotlightModule.swift — see that file's header comment for
/// why that's the pragmatic choice here over a full Codegen'd TurboModule.
///
/// Every method is a plain fire-and-forget call from JS's point of view
/// (App.tsx's own navigation state — route/currentManeuverIndex/ETA — is
/// already the single source of truth; this module never reads it back,
/// it only mirrors whatever JS last sent).
@objc(LiveActivityModule)
class LiveActivityModule: NSObject, RCTBridgeModule {
  static func moduleName() -> String! {
    "LiveActivityModule"
  }

  static func requiresMainQueueSetup() -> Bool {
    false
  }

  private var currentActivityId: String?

  @objc(startActivity:withResolver:withRejecter:)
  func startActivity(
    _ data: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.2, *) else {
      resolve(false) // Not an error — just an iOS version this feature doesn't reach; nothing for JS to do differently.
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      resolve(false) // User has Live Activities disabled in Settings — not this app's call to make.
      return
    }
    do {
      let attributes = NavigationActivityAttributes(costingLabel: data["costingLabel"] as? String ?? "")
      let state = contentState(from: data)
      let activity = try Activity<NavigationActivityAttributes>.request(
        attributes: attributes,
        content: .init(state: state, staleDate: nil)
      )
      currentActivityId = activity.id
      resolve(true)
    } catch {
      print("[LiveActivityModule] failed to start: \(error)")
      resolve(false)
    }
  }

  @objc(updateActivity:withResolver:withRejecter:)
  func updateActivity(
    _ data: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.2, *) else {
      resolve(nil)
      return
    }
    let state = contentState(from: data)
    Task {
      for activity in Activity<NavigationActivityAttributes>.activities {
        await activity.update(.init(state: state, staleDate: nil))
      }
      resolve(nil)
    }
  }

  @objc(endActivity:withRejecter:)
  func endActivity(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.2, *) else {
      resolve(nil)
      return
    }
    Task {
      for activity in Activity<NavigationActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      currentActivityId = nil
      resolve(nil)
    }
  }

  @available(iOS 16.2, *)
  private func contentState(from data: [String: Any]) -> NavigationActivityAttributes.ContentState {
    .init(
      nextInstruction: data["nextInstruction"] as? String ?? "",
      distanceToManeuverKm: data["distanceToManeuverKm"] as? Double ?? 0,
      etaMinutes: data["etaMinutes"] as? Int ?? 0,
      maneuverEmoji: data["maneuverEmoji"] as? String ?? "➡️"
    )
  }
}
