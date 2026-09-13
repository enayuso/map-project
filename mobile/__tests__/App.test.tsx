/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  // async act, not the plain sync callback this test used before — App
  // kicks off real async work on mount (favorites/recents from
  // AsyncStorage, a location-permission check, weather, the widget-data
  // bridge, etc. across its ~26 features), and a sync act() returns
  // before any of that settles, leaving dangling state updates that fire
  // after the test itself has already finished ("update not wrapped in
  // act" / "trying to import a file after the Jest environment has been
  // torn down" — confirmed these were exactly what happened before this
  // fix, not a hypothetical).
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // Unmounting explicitly runs every effect's cleanup function, which is
  // what actually stops those still-pending promises from touching a
  // component tree Jest considers gone once this test returns.
  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});
