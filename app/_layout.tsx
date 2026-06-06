import '../src/global.css'
import * as Sentry from '@sentry/react-native'
import { Slot, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { PostHogProvider, usePostHog } from 'posthog-react-native'
import { SessionProvider, useSession } from '../src/lib/session'
import { ErrorBoundary } from '../src/components/ErrorBoundary'

Sentry.init({
  dsn: 'https://eb25ce55ba3b958434afa9d182fc4d97@o4511515618705408.ingest.de.sentry.io/4511515622375504',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
})

function RouteGuard() {
  const { session, loading } = useSession()
  const segments = useSegments()
  const router = useRouter()
  const posthog = usePostHog()

  useEffect(() => {
    if (session && session.user.is_anonymous !== true) {
      posthog.identify(session.user.id)
    }
  }, [session])

  useEffect(() => {
    if (loading) return

    const group = segments[0]
    const inAuthGroup = group === '(auth)'
    const inSpikeGroup = group === '(spike)'
    const inOnboardingGroup = group === 'onboarding'

    // Spike screens are always accessible (dev reference).
    if (inSpikeGroup) return

    const isAnonymous = session?.user?.is_anonymous === true

    if (session && !isAnonymous) {
      // Permanent account: only bounce them off the sign-in screen. We must NOT
      // redirect out of the onboarding group — a freshly signed-in user runs
      // onboarding/build-first-outfit, which navigates to /(tabs)/ itself.
      if (inAuthGroup) router.replace('/(tabs)/')
      return
    }

    if (isAnonymous) {
      // Mid-onboarding anonymous user — keep them in the funnel.
      if (!inOnboardingGroup) router.replace('/onboarding')
      return
    }

    // No session: returning/sign-out users land on sign-in; the sign-in screen
    // links to /onboarding for new users.
    if (!inAuthGroup && !inOnboardingGroup) {
      router.replace('/(auth)/sign-in')
    }
  }, [session, loading, segments])

  if (loading) return null

  return <Slot />
}

export default function RootLayout() {
  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_KEY!}
      options={{ host: process.env.EXPO_PUBLIC_POSTHOG_HOST }}
    >
      <ErrorBoundary>
        <SessionProvider>
          <RouteGuard />
        </SessionProvider>
      </ErrorBoundary>
    </PostHogProvider>
  )
}
