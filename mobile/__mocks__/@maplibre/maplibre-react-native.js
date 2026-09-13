/**
 * Manual mock for @maplibre/maplibre-react-native, used automatically by
 * Jest for every test (this is a scoped node_modules package, so a mock
 * placed here needs no explicit jest.mock() call in any test file — see
 * jest.config.js's own comment on why this package needs one at all).
 *
 * Why: this package's components are thin wrappers around real native
 * TurboModules (MLRNCameraModule etc.) that don't exist in Jest's plain
 * Node test environment — rendering the real components throws
 * "TurboModuleRegistry.getEnforcing(...): could not be found" (confirmed
 * directly, not assumed, before writing this). __tests__/App.test.tsx
 * predates this project's own test suite and was silently failing to even
 * run before this fix, for exactly that reason.
 *
 * Scope: just enough surface for App.tsx and mobile/src/offline/api.ts to
 * import and render without crashing — plain View/Text stand-ins for
 * components (this smoke test only needs the tree to mount, not to
 * pixel-match a real map), a no-op OfflineManager, and useCurrentPosition
 * returning null (no GPS fix) since that's a real, valid, handled state
 * the app already renders correctly for.
 */
const React = require('react');
const { View } = require('react-native');

function makeStubComponent(displayName) {
  const Stub = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }, props.children));
  Stub.displayName = displayName;
  return Stub;
}

const Map = makeStubComponent('Map');
const Camera = makeStubComponent('Camera');
const Marker = makeStubComponent('Marker');
const GeoJSONSource = makeStubComponent('GeoJSONSource');
const Layer = makeStubComponent('Layer');
const NativeUserLocation = makeStubComponent('NativeUserLocation');

function useCurrentPosition() {
  // No GPS fix — a real, already-handled state (the app treats this the
  // same as "location permission not yet granted / no fix acquired").
  return null;
}

const OfflineManager = {
  createPack: () => Promise.resolve({ id: 'mock-pack' }),
  getPacks: () => Promise.resolve([]),
  deletePack: () => Promise.resolve(),
};

// Only ever used as a TypeScript type in this project (see
// src/offline/api.ts) — this export exists purely so an unelided import
// binding has *something* to resolve to at runtime, not because anything
// calls `new OfflinePack()`.
class OfflinePack {}

module.exports = {
  Map,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  NativeUserLocation,
  useCurrentPosition,
  OfflineManager,
  OfflinePack,
};
