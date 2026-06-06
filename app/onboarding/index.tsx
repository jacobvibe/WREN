import { useState, useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { View, Text } from '../../src/tw'
import { onboardingStore } from '../../src/lib/onboarding-store'
import { ensureAnonSession } from '../../src/lib/ensure-anon-session'
import { combinations } from '../../src/lib/combinations'

const ACCENT = '#c8f04d'
const MAX = 99

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <View className="flex-1 items-center" style={{ gap: 10 }}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View className="flex-row items-center" style={{ gap: 2 }}>
        <Pressable
          onPress={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          style={({ pressed }) => [
            styles.stepBtn,
            { borderColor: value === 0 ? '#1e1e1e' : '#3a3a3a', opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <Text style={{ color: value === 0 ? '#282828' : '#777', fontSize: 24, lineHeight: 28 }}>
            −
          </Text>
        </Pressable>

        <Text style={styles.stepValue}>{value}</Text>

        <Pressable
          onPress={() => onChange(Math.min(MAX, value + 1))}
          style={({ pressed }) => [
            styles.stepBtn,
            { borderColor: ACCENT, opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <Text style={{ color: ACCENT, fontSize: 24, lineHeight: 28 }}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

export default function OnboardingScreen() {
  const router = useRouter()
  const [tops, setTops] = useState(0)
  const [bottoms, setBottoms] = useState(0)
  const [shoes, setShoes] = useState(0)
  const [dresses, setDresses] = useState(0)
  const [displayCount, setDisplayCount] = useState(0)

  const total = combinations({ tops, bottoms, shoes, dresses })
  const visible = total > 0

  // Start a fresh onboarding session and ensure an anonymous Supabase session so
  // the AI cut-out / tagging functions and item inserts (all auth-gated) work
  // before the user picks Apple/Google sign-in.
  useEffect(() => {
    onboardingStore.reset()
    ensureAnonSession().then(({ error }) => {
      if (error && __DEV__) console.error('ensureAnonSession failed:', error)
    })
  }, [])

  const animatedCount = useSharedValue(0)
  const sectionOpacity = useSharedValue(0)
  const sectionY = useSharedValue(32)
  const btnOpacity = useSharedValue(0)

  // Sync the animated float count → React state each frame it changes
  useAnimatedReaction(
    () => Math.round(animatedCount.value),
    (curr, prev) => {
      if (curr !== prev) runOnJS(setDisplayCount)(curr)
    }
  )

  useEffect(() => {
    if (visible) {
      animatedCount.value = withTiming(total, {
        duration: 700,
        easing: Easing.out(Easing.cubic),
      })
      sectionOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) })
      sectionY.value = withSpring(0, { damping: 20, stiffness: 220 })
      btnOpacity.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) })
    } else {
      animatedCount.value = 0
      sectionOpacity.value = withTiming(0, { duration: 200 })
      sectionY.value = withTiming(32, { duration: 200 })
      btnOpacity.value = withTiming(0, { duration: 150 })
    }
  }, [visible, total])

  const sectionStyle = useAnimatedStyle(() => ({
    opacity: sectionOpacity.value,
    transform: [{ translateY: sectionY.value }],
  }))

  const btnStyle = useAnimatedStyle(() => ({
    opacity: btnOpacity.value,
  }))

  return (
    <SafeAreaView style={styles.root}>
      <View className="flex-1 px-6" style={{ paddingTop: 40 }}>

        {/* Header */}
        <View style={{ marginBottom: 52 }}>
          <Text style={styles.heading}>What's in{'\n'}your wardrobe?</Text>
          <Text style={styles.subheading}>Count roughly — you can update later.</Text>
        </View>

        {/* Steppers — two rows so all four categories fit comfortably */}
        <View style={{ marginBottom: 56, gap: 28 }}>
          <View className="flex-row">
            <Stepper label="TOPS" value={tops} onChange={setTops} />
            <View style={styles.divider} />
            <Stepper label="BOTTOMS" value={bottoms} onChange={setBottoms} />
          </View>
          <View className="flex-row">
            <Stepper label="SHOES" value={shoes} onChange={setShoes} />
            <View style={styles.divider} />
            <Stepper label="DRESSES" value={dresses} onChange={setDresses} />
          </View>
        </View>

        {/* Animated counter */}
        <Animated.View style={sectionStyle} pointerEvents={visible ? 'auto' : 'none'}>
          <Text style={styles.bigNumber}>{displayCount.toLocaleString()}</Text>
          <Text style={styles.outfitsCopy}>
            You already own {displayCount.toLocaleString()} outfits.
          </Text>
        </Animated.View>

        <View style={{ flex: 1 }} />

        {/* Continue button */}
        <Animated.View
          style={[{ paddingBottom: 8 }, btnStyle]}
          pointerEvents={visible ? 'auto' : 'none'}
        >
          <Pressable
            onPress={() => router.push('/onboarding/add-first-item')}
            style={({ pressed }) => [styles.continueBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.continueBtnLabel}>Continue</Text>
          </Pressable>
        </Animated.View>

      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  heading: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    marginBottom: 10,
  },
  subheading: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 20,
  },
  stepLabel: {
    color: '#404040',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  stepValue: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '700',
    width: 52,
    textAlign: 'center',
    lineHeight: 44,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: '#1a1a1a',
    marginVertical: 6,
  },
  bigNumber: {
    color: ACCENT,
    fontSize: 88,
    fontWeight: '800',
    lineHeight: 96,
    letterSpacing: -4,
  },
  outfitsCopy: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '400',
    marginTop: 8,
    lineHeight: 24,
  },
  continueBtn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnLabel: {
    color: '#0a0a0a',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
