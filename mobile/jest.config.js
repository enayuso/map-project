module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    // The package ships a real in-memory mock for exactly this — every
    // module under test that persists something locally (favorites,
    // recents, the temp-unit/appearance preference, the error log) goes
    // through the real AsyncStorage API, which has no native module to
    // bridge to inside Jest's Node environment without this.
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest',
  },
  // The preset's own default only lets react-native/@react-native(-
  // community) packages through Babel. @react-native-async-storage ships
  // ESM-only (no CommonJS build at all, confirmed: only lib/module
  // exists) — same treatment needed or Jest chokes on its `export`
  // syntax. @maplibre needs it too: __tests__/App.test.tsx (the one test
  // file that predates this project's own test suite) was silently
  // failing to even run before this fix — confirmed by reverting this
  // change and re-running, not assumed — because MapLibre's own
  // CommonJS build re-exports a source .ts file straight through.
  // @invertase (react-native-apple-authentication, added for the profile
  // feature) ships an ESM `import` in its main entry point too — same
  // fix, confirmed the same way (reverting this addition reproduces the
  // exact "Cannot use import statement outside a module" failure in
  // App.test.tsx, which imports App.tsx, which imports ProfilePanel.tsx).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|@maplibre|@invertase)/)',
  ],
};
