import { StyleSheet, View } from 'react-native'
import { Text } from '../tw'

const ACCENT = '#c8f04d'

/**
 * Purely visual 360×360 share card. `react-native-view-shot` is not installed,
 * so this renders as a plain <View> the user can screenshot; the surfacing
 * screen shares a text fallback via React Native's built-in Share API.
 */
export function ShareCard({
  comboCount,
  wornCount,
}: {
  comboCount: number
  wornCount: number
}) {
  return (
    <View style={s.card}>
      <Text style={s.small}>I own</Text>
      <Text style={s.big}>{comboCount.toLocaleString()}</Text>
      <Text style={s.small}>outfit combinations</Text>

      <View style={{ height: 28 }} />

      <Text style={s.worn}>I&apos;ve worn {wornCount.toLocaleString()} of them</Text>

      <View style={{ height: 28 }} />

      <Text style={s.footer}>WREN</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    width: 360,
    height: 360,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  small: { color: '#888888', fontSize: 14, textAlign: 'center' },
  big: {
    color: ACCENT,
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 70,
    textAlign: 'center',
  },
  worn: { color: '#ffffff', fontSize: 16, textAlign: 'center' },
  footer: {
    color: '#555555',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textAlign: 'center',
  },
})
