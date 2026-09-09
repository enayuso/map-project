# mobile (BelizeMap)

React Native app (0.87.1) + `@maplibre/maplibre-react-native` (11.3.10), rendering the same [PostGIS + Martin backend](../backend/) and [style](../styles/basic.json) already proven out in [web-preview/](../web-preview/). Also wires up search ([search/](../search/) + [geocoding/](../geocoding/), see `src/search/`) and turn-by-turn directions ([routing/](../routing/), see `src/routing/`). See [docs/PLAN.md](../docs/PLAN.md) for phase context.

### Directions (Phase 4)

Tap **🧭 Directions**, then either tap two points on the map or use the search box to set a start and end point (first pick = origin, second = destination — searching while a place is already pinned uses it as the destination immediately, the "search then get directions to it" flow). Renders the route line, distance/duration, a ferry badge when relevant, and the turn-by-turn instruction list in a bottom sheet; a costing switcher (🚗/🚶/🚲) re-fetches the same trip with a different profile.

**Verified**: the client-side polyline decoding + Valhalla response parsing (`src/routing/api.ts`) was checked directly against a real `/route` response outside the UI — the first decoded coordinate matched the query's origin exactly, the last matched the destination, and all 65 points along the route fell inside Belize's bounding box. The UI wiring itself (button → map taps → route line + panel) renders without crashing, but — per issue 7 below — needs a manual tap-through in the real Simulator.app to fully confirm, the same way Phase 2's search box did.

### Whole-country coverage, location, and compass (Phase 4.5)

- **Coverage**: the app isn't actually limited to the two pilot areas — all backend services were built from the full Belize OSM extract, confirmed working for Belmopan, Corozal, and Punta Gorda too. See [docs/PLAN.md](../docs/PLAN.md) Phase 4.5.
- **Current location**: tap 📍 (bottom-right) to center the map on the device's current position — uses MapLibre Native's built-in `useCurrentPosition`/`<NativeUserLocation>`, no extra geolocation package. Location tracking only starts on first tap, so the permission prompt doesn't fire before it's needed. On the Simulator, set a fake GPS location first: `xcrun simctl location <udid> set <lat>,<lon>` (the Simulator has no real GPS).
- **Compass**: built into MapLibre Native (`compass`, `compassHiddenFacingNorth`, `compassPosition` props on `<Map>`) — appears only when the map is rotated, hides at north, and resets bearing on tap, all native behavior with zero custom code. Confirmed the hide-at-north behavior works (no compass visible at the default view).

## Running it (iOS Simulator)

1. Backend must be running: `cd ../backend && docker compose up -d` (see [backend/README.md](../backend/README.md))
2. Install pods (first time, or after changing native deps):
   ```bash
   cd ios && bundle install && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install
   ```
3. Start Metro: `npx react-native start`
4. Build for the simulator (see "Known issues" below for why plain `npx react-native run-ios` may not work as-is):
   ```bash
   xcodebuild -workspace ios/BelizeMap.xcworkspace -scheme BelizeMap -configuration Debug \
     -destination "platform=iOS Simulator,id=<SIMULATOR_UDID>" -derivedDataPath ios/build \
     CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""
   ```
5. Install & launch the built `.app` (`ios/build/Build/Products/Debug-iphonesimulator/BelizeMap.app`) on the simulator.

## Known issues hit getting this running (and their fixes)

These cost real time to track down — recorded so they don't get re-debugged from scratch:

1. **CocoaPods + non-ASCII project path**: `pod install` crashed with `Encoding::CompatibilityError` when the project lived under a Korean-named folder (지도). Ruby's `unicode_normalize` (used internally by CocoaPods for path handling) can't handle non-ASCII path components reliably, and a downstream `Pod::Executable.execute_command` subprocess call hit the same issue one level deeper (hermes-engine podspec). **Fix: keep the project path ASCII-only.** (This is why the project now lives at `MAP/map-project`, not the original `지도/map-project`.)

2. **Missing native MapLibre SDK — `'MapLibre/MapLibre.h' file not found`**: `@maplibre/maplibre-react-native` v11.x does **not** pull in the native MapLibre iOS SDK via CocoaPods — it injects it as a **Swift Package Manager** dependency from a `post_install` hook (`$MLRN.post_install(installer)`) that the library expects you to add to your own Podfile manually. It's not autolinked and isn't mentioned in the package's own README (only in the external docs site). **Fix**: added the following to `ios/Podfile`'s `post_install` block:
   ```ruby
   $MLRN.post_install(installer)
   ```

3. **Codesign failure — `resource fork, Finder information, or similar detritus not allowed`**: a currently-active, ecosystem-wide bug (affects Flutter too — see `flutter/flutter#180351`, `#181103`, `#189734`) where recent macOS versions tag files from "untrusted" sources (Homebrew, CocoaPods downloads, and apparently anything created by processes in this dev environment's lineage) with a kernel-enforced `com.apple.provenance` extended attribute that **cannot be stripped** by `xattr -d`/`-c` (it silently "succeeds" without actually removing it), and newer Xcode's codesign rejects bundles containing it. **Fix**: disable code signing for simulator builds — it isn't needed there anyway: `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""`.

4. **Watchman hangs**: `watchman watch-project` hung indefinitely (0% CPU, not actually crawling) on this project, which made Metro appear stuck at "Waiting for Watchman". **Fix**: stopped and disabled the Watchman LaunchAgent (`launchctl unload -w ~/Library/LaunchAgents/com.github.facebook.watchman.plist`) — Metro falls back to Node's own file watcher without it, and the "Waiting for Watchman" log line turned out to be a harmless periodic retry message, not a hard blocker, once Watchman was out of the picture entirely.

5. **Camera not moving to the initial position — tiles requested at `0/0/0`**: `<Camera centerCoordinate={...} zoomLevel={...} />` silently did nothing (map sat at zoom 0 / world view). The library renamed these props: the current API is `<Camera initialViewState={{ center: [lng, lat], zoom }} />` (`center`/`zoom`, not `centerCoordinate`/`zoomLevel`). Since Metro doesn't type-check, the stale prop names were just silently dropped rather than raising a build error. Confirmed via `xcrun simctl spawn <udid> log show` showing tile requests for `.../planet_osm_line/0/0/0` instead of the expected zoom-13 tiles — that log-based check is the fastest way to diagnose "map renders but shows nothing/wrong area" in the simulator.

6. **Search results dropdown not receiving taps**: `src/search/SearchBox.tsx`'s results list, rendered as a plain absolutely-positioned `View` sibling after `</Map>` (the standard, documented pattern for overlaying UI on a map), never received touches — taps landed but `onPress` never fired, no matter the exact coordinates. This matches a known, unresolved React Native issue (`facebook/react-native#35612`): an absolutely-positioned RN overlay can have its touches swallowed by a native map view sibling underneath it, and no `pointerEvents` combination reliably fixes it. **Fix**: the results dropdown now renders inside a `<Modal transparent animationType="none">` — a genuinely separate native presentation layer, not just a z-index trick — which sidesteps the bug entirely. The search bar itself stays a plain overlay (unaffected by this issue); only the results list is wrapped in the Modal, and only while there's something to show, so the map stays fully interactive the rest of the time.

   **Confirmed working by hand.** Automated tap/text-injection through Claude Code's embedded simulator *panel* was unreliable enough (roughly 1-in-5 success, occasional spurious element-inspector triggers) that it couldn't be trusted as a test signal — turned out that panel is a lightweight preview, not a real interactive input surface (see issue 7 below). Opening the actual **Simulator.app** (`open -a Simulator`) and testing by hand confirmed the full flow works correctly: search → tap a result → camera flies to it → pin drops.

7. **Claude Code's embedded simulator panel is a preview, not a full input surface**: taps/typing sent through it (by both the automation tool *and* the user clicking the panel directly) were unreliable — inconsistent focus, dropped keystrokes, occasional accidental triggering of React Native's dev-mode element inspector. The `iosSimulator` capability was also seen flagged `"unsupported...disabled by its rollout flag"` in the desktop app's own feature-flag list, consistent with this being an early/rollout-gated integration rather than a full remote-control surface. **For any interaction-heavy testing, prefer the real Simulator.app** (`open -a Simulator`, or run from Xcode) over the embedded panel — its clicks/keystrokes go directly to the simulator with no intermediate layer, and behave like a real device.

8. **This dev machine is memory-constrained (8GB total) for this stack**: Xcode + iOS Simulator + Docker (Postgres/Nominatim/Typesense/Martin) + Metro + Claude Code running together can push free RAM to near zero and force active swapping (confirmed via `vm_stat`/`sysctl vm.swapusage` — as low as ~60MB free, 2.4GB in swap, mid-session). This shows up as sluggishness, dropped input, and occasional Simulator crash/reboot — not application bugs. If things feel unresponsive, check `memory_pressure` and close other apps (a browser, Spotify, editors) before assuming something's broken. Colima's Docker VM was tuned down from 4GB (needed transiently for the Nominatim import) to 3GB for ongoing use — see [geocoding/README.md](../geocoding/README.md).
