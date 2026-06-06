import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { View, Text } from '../../src/tw'
import { supabase } from '../../src/lib/supabase'
import { useSession } from '../../src/lib/session'
import { TabBar } from '../../src/components/TabBar'

const ACCENT = '#c8f04d'

export default function SettingsScreen() {
  const router = useRouter()
  const { session } = useSession()
  const [deleting, setDeleting] = useState(false)

  const displayName =
    session?.user.user_metadata?.full_name ??
    session?.user.email ??
    'Your account'

  async function performDelete() {
    setDeleting(true)
    const { data, error } = await supabase.functions.invoke('delete-account')
    if (error || !data?.ok) {
      setDeleting(false)
      Alert.alert(
        'Could not delete account',
        error?.message ?? data?.error ?? 'Something went wrong. Please try again.',
      )
      return
    }
    // Account is gone — sign out locally and return to the sign-in screen.
    await supabase.auth.signOut()
    router.replace('/(auth)/sign-in')
  }

  function confirmDelete() {
    Alert.alert('Delete account?', 'Are you sure you want to delete your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'This cannot be undone',
            'This will permanently delete your wardrobe, all outfits, and your account.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete everything', style: 'destructive', onPress: performDelete },
            ],
          ),
      },
    ])
  }

  function signOut() {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: () => supabase.auth.signOut() },
    ])
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={{ flex: 1 }}>
        <View style={s.header}>
          <Text style={s.pageTitle}>Settings</Text>
        </View>
        <View style={s.divider} />

        <View style={s.body}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <Text style={s.accountName}>{displayName}</Text>

          <View style={{ flex: 1 }} />

          <Pressable
            onPress={signOut}
            disabled={deleting}
            style={({ pressed }) => [s.signOutBtn, { opacity: deleting ? 0.5 : pressed ? 0.7 : 1 }]}
          >
            <Text style={s.signOutLabel}>Sign out</Text>
          </Pressable>

          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            style={({ pressed }) => [s.deleteBtn, { opacity: deleting ? 0.6 : pressed ? 0.85 : 1 }]}
          >
            {deleting
              ? <ActivityIndicator color="#ff6b6b" />
              : <Text style={s.deleteLabel}>Delete account</Text>}
          </Pressable>
          <Text style={s.deleteHint}>
            Permanently deletes your wardrobe, outfits, and account. This cannot be undone.
          </Text>
        </View>
      </View>
      <TabBar active="settings" />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  pageTitle: { color: '#ffffff', fontSize: 30, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#1a1a1a' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  sectionLabel: { color: '#404040', fontSize: 10, fontWeight: '600', letterSpacing: 2.5, marginBottom: 10 },
  accountName: { color: '#ffffff', fontSize: 18, fontWeight: '600' },

  signOutBtn: {
    height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  signOutLabel: { color: '#cccccc', fontSize: 16, fontWeight: '600' },

  deleteBtn: {
    height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: '#3a1a1a',
    backgroundColor: '#1a0d0d', alignItems: 'center', justifyContent: 'center',
  },
  deleteLabel: { color: '#ff6b6b', fontSize: 16, fontWeight: '700' },
  deleteHint: { color: '#444444', fontSize: 12, lineHeight: 16, marginTop: 10, textAlign: 'center' },
})
