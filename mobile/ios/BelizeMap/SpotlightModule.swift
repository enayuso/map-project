import CoreSpotlight
import Foundation
import React
import UniformTypeIdentifiers

/// iOS Spotlight search integration — per docs/research/
/// 10-remaining-feature-gaps.md, the cheapest genuinely native-iOS win on
/// the shortlist (no new Xcode target needed, unlike Live Activity/
/// CarPlay/Watch). Indexes favorites + recent searches as CSSearchableItem
/// so they surface in the system-wide Spotlight search (swipe down on the
/// home screen); tapping one launches/foregrounds the app via
/// `application(_:continue:restorationHandler:)` in AppDelegate.swift,
/// which hands the tapped item's id back here for JS to pick up.
///
/// Exposed to JS the legacy RCTEventEmitter/RCT_EXTERN_MODULE way (see
/// SpotlightModule.m) rather than a full Codegen'd TurboModule spec — the
/// New Architecture's interop layer still supports this for a module this
/// small, and it's a fraction of the ceremony.
@objc(SpotlightModule)
class SpotlightModule: RCTEventEmitter {
  /// Domain identifier for everything this app indexes — lets
  /// deindexAll(domain:) clear just "places" without touching anything
  /// else Spotlight might index for this app in the future.
  static let placesDomain = "com.belizemap.places"

  /// Set when a Spotlight tap launches the app cold (before any JS
  /// listener has attached yet) — getPendingItemId lets the JS side pick
  /// it up once it's ready, instead of losing the launch intent.
  static var pendingItemId: String?
  static weak var sharedInstance: SpotlightModule?
  private var hasListeners = false

  override init() {
    super.init()
    SpotlightModule.sharedInstance = self
  }

  override static func requiresMainQueueSetup() -> Bool {
    false
  }

  override func supportedEvents() -> [String]! {
    ["SpotlightItemSelected"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc(indexItems:)
  func indexItems(_ items: [[String: Any]]) {
    let searchableItems: [CSSearchableItem] = items.compactMap { item in
      guard let id = item["id"] as? String, let title = item["title"] as? String else { return nil }
      let attributeSet = CSSearchableItemAttributeSet(contentType: UTType.item)
      attributeSet.title = title
      if let subtitle = item["subtitle"] as? String {
        attributeSet.contentDescription = subtitle
      }
      let searchableItem = CSSearchableItem(
        uniqueIdentifier: id,
        domainIdentifier: SpotlightModule.placesDomain,
        attributeSet: attributeSet
      )
      return searchableItem
    }
    CSSearchableIndex.default().indexSearchableItems(searchableItems) { error in
      if let error = error {
        // Best-effort — a failed index just means this batch of places
        // won't show up in Spotlight yet, not a user-facing failure.
        print("[SpotlightModule] indexing error: \(error)")
      }
    }
  }

  @objc(deindexAll)
  func deindexAll() {
    CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [SpotlightModule.placesDomain]) { _ in }
  }

  @objc(getPendingItemId:rejecter:)
  func getPendingItemId(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(SpotlightModule.pendingItemId)
    SpotlightModule.pendingItemId = nil
  }

  /// Called from AppDelegate when a Spotlight result is tapped. Emits
  /// straight to JS if a listener is already attached (app was already
  /// running); otherwise stashes it for getPendingItemId to pick up once
  /// the JS side has mounted and asks.
  static func handleContinuation(itemId: String) {
    if let instance = sharedInstance, instance.hasListeners {
      instance.sendEvent(withName: "SpotlightItemSelected", body: ["id": itemId])
    } else {
      pendingItemId = itemId
    }
  }
}
