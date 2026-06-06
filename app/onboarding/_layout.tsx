import { Stack } from 'expo-router'

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* Mandatory steps — no swipe-back so the funnel can't be short-circuited. */}
      <Stack.Screen name="add-first-item" options={{ gestureEnabled: false }} />
      <Stack.Screen name="tag-item" options={{ gestureEnabled: false }} />
      <Stack.Screen name="success" options={{ gestureEnabled: false }} />
      <Stack.Screen name="build-first-outfit" options={{ gestureEnabled: false }} />
    </Stack>
  )
}
