/**
 * @format
 */

import React from 'react';
import { AppRegistry } from 'react-native';
import App from './App';
import ErrorBoundary from './src/errors/ErrorBoundary';
import { ThemeProvider } from './src/theme/ThemeContext';
import { name as appName } from './app.json';

// Wrapped here, not inside App.tsx's own return — a boundary only catches
// errors from its descendants' render phase, so it has to be an ancestor
// of <App/> itself to catch anything App's own hooks/body might throw
// before ever reaching App's return statement. See ErrorBoundary.tsx.
//
// ThemeProvider sits inside the boundary, not outside it — see
// ThemeContext.tsx's header comment for why.
function Root() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

AppRegistry.registerComponent(appName, () => Root);
