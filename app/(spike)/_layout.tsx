import { Stack } from 'expo-router'

export default function SpikeLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Validation Spikes' }} />
      <Stack.Screen name="collage" options={{ title: 'Spike 1 — Collage' }} />
    </Stack>
  )
}
