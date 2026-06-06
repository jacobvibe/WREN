import { useState } from 'react'
import { Alert, Platform, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import * as AppleAuthentication from 'expo-apple-authentication'
import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin'
import { supabase } from '../../src/lib/supabase'
import { View, Text, Pressable } from '../../src/tw'

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
})

const ACCENT = '#c8f04d'

function isGoogleConfigError(e: any): boolean {
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

// ── Web sign-in (magic link) ──────────────────────────────────────────────────
// @react-native-google-signin doesn't run on web. We use Supabase email OTP
// instead — works with any Supabase project, no extra OAuth config needed.

function WebSignIn() {
  const [email, setEmail]   = useState('')
  const [state, setState]   = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function sendMagicLink() {
    if (!email.trim()) return
    setState('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    if (error && __DEV__) console.error('OTP error:', error.status, error.message, error)
    setState(error ? 'error' : 'sent')
  }

  if (state === 'sent') {
    return (
      <View style={ws.wrap}>
        <Text style={ws.check}>✓</Text>
        <Text style={ws.heading}>Check your email</Text>
        <Text style={ws.sub}>
          We sent a magic link to{'\n'}
          <Text style={{ color: ACCENT }}>{email}</Text>
          {'\n'}Click it to sign in.
        </Text>
      </View>
    )
  }

  return (
    <View style={ws.wrap}>
      <Text style={ws.heading}>Wren</Text>
      <Text style={ws.sub}>Sign in to continue</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="your@email.com"
        placeholderTextColor="#444"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        style={ws.input}
        selectionColor={ACCENT}
        returnKeyType="send"
        onSubmitEditing={sendMagicLink}
        editable={state !== 'sending'}
      />

      {state === 'error' && (
        <Text style={ws.error}>Something went wrong — check your email and try again.</Text>
      )}

      <Pressable
        onPress={sendMagicLink}
        disabled={state === 'sending' || !email.trim()}
        style={({ pressed }) => [
          ws.btn,
          { opacity: state === 'sending' || !email.trim() ? 0.5 : pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={ws.btnLabel}>
          {state === 'sending' ? 'Sending…' : 'Send magic link'}
        </Text>
      </Pressable>

      {__DEV__ && (
        <Pressable
          onPress={() =>
            supabase.auth.signInWithPassword({
              email: 'dev@wren.local',
              password: 'devpassword123',
            })
          }
          style={({ pressed }) => [ws.devBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={ws.devBtnLabel}>⚡ Skip sign in (dev)</Text>
        </Pressable>
      )}
    </View>
  )
}

const ws = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  check: { color: ACCENT, fontSize: 56, lineHeight: 64 },
  heading: { color: '#ffffff', fontSize: 36, fontWeight: '700' },
  sub: { color: '#888888', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  input: {
    width: '100%',
    maxWidth: 360,
    height: 52,
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 16,
    marginTop: 8,
  },
  error: { color: '#ff6b6b', fontSize: 13, textAlign: 'center' },
  btn: {
    width: '100%',
    maxWidth: 360,
    height: 52,
    backgroundColor: ACCENT,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: { color: '#0a0a0a', fontSize: 16, fontWeight: '700' },
  devBtn: {
    width: '100%',
    maxWidth: 360,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  devBtnLabel: { color: '#555', fontSize: 13 },
})

// ── Native sign-in (Apple + Google SDK) ──────────────────────────────────────

export default function SignIn() {
  const router = useRouter()

  if (Platform.OS === 'web') return <WebSignIn />

  async function signInWithApple() {
    try {
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
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        if (__DEV__) console.error('Apple sign-in error:', e)
        Alert.alert('Sign in failed', 'Could not sign in with Apple. Please try again.')
      }
    }
  }

  async function signInWithGoogle() {
    try {
      await GoogleSignin.hasPlayServices()
      const response = await GoogleSignin.signIn()

      if (!isSuccessResponse(response) || !response.data.idToken) return

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      })
      if (error) throw error
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
    <View className="flex-1 bg-sf-bg items-center justify-center px-8 gap-6">
      <View className="items-center gap-2 mb-8">
        <Text className="text-4xl font-bold text-sf-text">Wren</Text>
        <Text className="text-base text-sf-text-2">Sign in to continue</Text>
      </View>

      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={{ width: '100%', height: 50 }}
          onPress={signInWithApple}
        />
      )}

      <Pressable
        className="w-full h-[50px] bg-white border border-gray-200 rounded-xl items-center justify-center"
        onPress={signInWithGoogle}
      >
        <Text className="text-base font-medium text-gray-800">Continue with Google</Text>
      </Pressable>

      <Pressable className="mt-2 py-2" onPress={() => router.push('/onboarding')}>
        <Text className="text-sm text-sf-text-2">New to WREN? Set up your wardrobe →</Text>
      </Pressable>
    </View>
  )
}
