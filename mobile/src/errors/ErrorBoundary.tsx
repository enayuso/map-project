/**
 * Top-level render-error safety net. Before this, the audit finding was
 * blunt: an uncaught error anywhere in the app's render tree (any of its
 * ~26 features) crashed the whole app with no fallback UI at all — this
 * is what index.js wraps <App/> in to fix that.
 *
 * Must be a class component: componentDidCatch/getDerivedStateFromError
 * have no hook equivalent in React (still true as of React 19). Catches
 * render-phase errors only — same scope as any React error boundary. It
 * does NOT catch errors inside event handlers/async code (those already
 * go through their own try/catch + logError, see the many call sites in
 * App.tsx) or native crashes (below the JS bridge entirely — see
 * logger.ts's header comment).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { logError } from './logger';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logError('ErrorBoundary', error, { componentStack: errorInfo.componentStack });
  }

  // Re-renders the child tree from scratch, which is enough to recover
  // from most transient render errors without a full app relaunch. There's
  // no equivalent of a JS-bundle reload available in a production build
  // (DevSettings.reload() is dev-only), so this is the right scope for a
  // "try again" action here.
  handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The app hit an unexpected error. Your saved places and settings are safe — try again,
            or close and reopen the app if this keeps happening.
          </Text>
          <Pressable style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0ede4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3a3226',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#8a8578',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
});
