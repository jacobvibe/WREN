import { Alert, Platform, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as AppleAuthentication from 'expo-apple-authentication'
import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin'
import { supabase } from '../../src/lib/supabase'
import { onboardingStore } from '../../src/lib/onboarding-store'
import { View, Text } from '../../src/tw'

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
})

const ACCENT = '#c8f04d'

function isGoogleConfigError(e: any): boolean {
  // DEVELOPER_ERROR / invalid client id / missing config surfaces as code 10 or
  // these strings depending on platform.
  const code = String(e?.code ?? '')
  const msg = String(e?.message ?? '').toLowerCase()
  return (
    code === '10' ||
    code === 'DEVELOPER_ERROR' ||
    msg.includes('developer_error') ||
    msg.includes('client id') ||
    msg.includes('clientid') ||
    msg.includes('audience')
  )
}

export default function OnboardingSuccessScreen() {
  const router = useRouter()

  // Reassign this onboarding session's items (created under the anonymous user)
  // to the now-permanent account, then move on to the forced outfit builder.
  async function claimAndNavigate() {
    const fromUserId = onboardingStore.anonUserId
    const sessionToken = onboardingStore.sessionToken
    if (fromUserId && sessionToken) {
      const { error } = await supabase.functions.invoke('claim-onboarding-items', {
        body: { fromUserId, sessionToken },
      })
      if (error && __DEV__) console.error('claim-onboarding-items error:', error)
    }
    onboardingStore.reset()
    router.replace('/onboarding/build-first-outfit')
  }

  async function signInWithApple() {
    try {
      // Capture the anonymous user id BEFORE sign-in swaps the session.
      const { data: { user: anonUser } } = await supabase.auth.getUser()
      if (anonUser?.id) onboardingStore.anonUserId = anonUser.id

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })

      if (!credential.identityToken) return

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      })
      if (error) throw error

      if (credential.fullName?.givenName || credential.fullName?.familyName) {
        const fullName = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ')
        await supabase.auth.updateUser({ data: { full_name: fullName } })
      }

      await claimAndNavigate()
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        if (__DEV__) console.error('Apple sign-in error:', e)
        Alert.alert('Sign in failed', 'Could not sign in with Apple. Please try again.')
      }
    }
  }

  async function signInWithGoogle() {
    try {
      const { data: { user: anonUser } } = await supabase.auth.getUser()
      if (anonUser?.id) onboardingStore.anonUserId = anonUser.id

      await GoogleSignin.hasPlayServices()
      const response = await GoogleSignin.signIn()

      if (!isSuccessResponse(response) || !response.data.idToken) return

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      })
      if (error) throw error

      await claimAndNavigate()
    } catch (e: any) {
      if (e?.code === 'SIGN_IN_CANCELLED' || e?.code === '-5') return
      if (__DEV__) console.error('Google sign-in error:', e)
      Alert.alert(
        'Sign in failed',
        isGoogleConfigError(e)
          ? 'Google sign-in is not available right now. Please use Apple Sign In.'
          : 'Could not sign in with Google. Please try again.',
      )
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <View className="flex-1 items-center justify-center px-6" style={{ gap: 16 }}>
        <Text style={s.emoji}>✓</Text>
        <Text style={s.heading}>One item in.</Text>
        <Text style={s.sub}>Sign in to save your wardrobe — takes 10 seconds.</Text>
      </View>

      <View style={s.bottom}>
        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={14}
            style={{ width: '100%', height: 56, marginBottom: 12 }}
            onPress={signInWithApple}
          />
        )}

        <Pressable
          onPress={signInWithGoogle}
          style={({ pressed }) => [s.googleBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={s.googleLabel}>Continue with Google</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  emoji: { color: ACCENT, fontSize: 56, lineHeight: 64 },
  heading: { color: '#ffffff', fontSize: 30, fontWeight: '700', textAlign: 'center' },
  sub: { color: '#555555', fontSize: 16, textAlign: 'center', lineHeight: 22 },
  bottom: { paddingHorizontal: 24, paddingBottom: 20 },
  googleBtn: {
    height: 56,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleLabel: { color: '#0a0a0a', fontSize: 17, fontWeight: '700' },
})
