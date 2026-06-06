import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '../tw'
import { combinationsLive } from '../lib/combinations'

const ACCENT = '#c8f04d'

type Props = {
  tops: number
  bottoms: number
  shoes: number
  dresses: number
  compact?: boolean
  /** Optional one-liner shown under the compact counter (e.g. gap hint). */
  gapHint?: string | null
}

export function CombinationsCounter({ tops, bottoms, shoes, dresses, compact = false, gapHint = null }: Props) {
  const target = combinationsLive({ tops, bottoms, shoes, dresses })
  const [display, setDisplay] = useState(0)
  const animated = useSharedValue(0)
  const opacity = useSharedValue(0)

  useAnimatedReaction(
    () => Math.round(animated.value),
    (curr, prev) => {
      if (curr !== prev) runOnJS(setDisplay)(curr)
    }
  )

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) })
    animated.value = withTiming(target, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    })
  }, [target])

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  if (compact) {
    return (
      <Animated.View style={[s.compactContainer, containerStyle]}>
        <Text style={s.compactNumber}>{display.toLocaleString()}</Text>
        <View style={s.compactTextGroup}>
          <Text style={s.compactLabel}>combinations</Text>
          <Text style={s.compactSub}>{gapHint ?? 'from your wardrobe'}</Text>
        </View>
      </Animated.View>
    )
  }

  return (
    <Animated.View style={[s.container, containerStyle]}>
      <Text style={s.number}>{display.toLocaleString()}</Text>
      <Text style={s.combinationsLabel}>combinations</Text>
      <Text style={s.sub}>from your wardrobe</Text>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  // Full-size (centred, used on standalone counter screen)
  container: {
    alignItems: 'center',
  },
  number: {
    color: ACCENT,
    fontSize: 88,
    fontWeight: '800',
    lineHeight: 96,
    letterSpacing: -4,
    textAlign: 'center',
  },
  combinationsLabel: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  sub: {
    color: '#555555',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },

  // Compact (horizontal, used as sticky wardrobe header)
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  compactNumber: {
    color: ACCENT,
    fontSize: 52,
    fontWeight: '800',
    lineHeight: 56,
    letterSpacing: -2,
  },
  compactTextGroup: {
    gap: 2,
  },
  compactLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  compactSub: {
    color: '#555555',
    fontSize: 13,
    lineHeight: 16,
  },
})
