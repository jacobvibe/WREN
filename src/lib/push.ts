import { Alert, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from './supabase'

/**
 * iOS pre-permission prompt. Asking the OS prompt directly is risky: if the user
 * denies it they can never re-enable without going to Settings. So we explain
 * why first and only trigger the real OS prompt if they opt in.
 */
function askPrePrompt(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      'Outfit reminders',
      "WREN would like to send you occasional reminders to build outfits. We'll only send 2–3 in your first week.",
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Allow', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    )
  })
}

/**
 * Requests notification permission (with a pre-prompt) and stores the Expo push
 * token on the user's profile. Safe to call repeatedly — never throws, never
 * surfaces errors (push is non-critical). updated_at is refreshed so the cron
 * cohort logic reflects the latest token grant.
 */
export async function requestAndStorePushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing

    if (status === 'undetermined') {
      const wantsPush = await askPrePrompt()
      if (!wantsPush) return // don't ask the OS this session
      const { status: requested } = await Notifications.requestPermissionsAsync()
      status = requested
    }

    if (status !== 'granted') return // already denied, or denied just now — silent

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : {},
    )

    await supabase.from('profiles').upsert(
      { user_id: userId, expo_push_token: token, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  } catch {
    // Push is non-critical — never surface errors to the user.
  }
}
