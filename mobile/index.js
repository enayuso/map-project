/**
 * @format
 */

import React from 'react';
import { AppRegistry } from 'react-native';
import App from './App';
import ErrorBoundary from './src/errors/ErrorBoundary';
import { name as appName } from './app.json';

// Wrapped here, not inside App.tsx's own return — a boundary only catches
// errors from its descendants' render phase, so it has to be an ancestor
// of <App/> itself to catch anything App's own hooks/body might throw
// before ever reaching App's return statement. See ErrorBoundary.tsx.
function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

AppRegistry.registerComponent(appName, () => Root);
