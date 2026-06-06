import { Component, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

type Props = { children: ReactNode }
type State = { hasError: boolean }

const ACCENT = '#c8f04d'

/**
 * Catches render-time crashes anywhere below it and shows a graceful recovery
 * screen instead of an unrecoverable white screen. Wraps the app's root <Slot/>.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  // Install @sentry/react-native and wire SENTRY_DSN env var before App Store submission.
  componentDidCatch(error: unknown) {
    if (__DEV__) console.error('ErrorBoundary caught:', error)

    if (!__DEV__) {
      // TODO: replace with Sentry.captureException(error) once Sentry is configured
      // For now, log structured error for EAS log ingestion
      const err = error as { message?: string; stack?: string }
      console.error(JSON.stringify({
        type: 'CRASH',
        message: err?.message,
        stack: err?.stack?.slice(0, 500),
        timestamp: new Date().toISOString(),
      }))
    }
  }

  // Reset state so React re-mounts the tree (recovers transient render errors).
  // expo-updates is not installed; if added later, call Updates.reloadAsync() here.
  handleReload = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <View style={s.root}>
        <Text style={s.title}>Something went wrong.</Text>
        <Text style={s.sub}>Tap reload, or fully close and reopen the app.</Text>
        <Pressable onPress={this.handleReload} style={({ pressed }) => [s.btn, { opacity: pressed ? 0.85 : 1 }]}>
          <Text style={s.btnLabel}>Reload</Text>
        </Pressable>
      </View>
    )
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub: { color: '#555555', fontSize: 15, textAlign: 'center' },
  btn: { marginTop: 12, height: 50, paddingHorizontal: 32, backgroundColor: ACCENT, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { color: '#0a0a0a', fontSize: 16, fontWeight: '700' },
})
