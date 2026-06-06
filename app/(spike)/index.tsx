import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Link } from 'expo-router'

const SPIKES = [
  { href: '/(spike)/collage', label: 'Spike 1 — Collage builder (on-device)', runnable: true },
  { href: null, label: 'Spike 2 — Remove.bg Edge Function', runnable: false, blocker: 'Needs REMOVE_BG_API_KEY' },
  { href: null, label: 'Spike 3 — Google Vision tagging (30 photos)', runnable: false, blocker: 'Needs GOOGLE_VISION_API_KEY' },
  { href: null, label: 'Spike 4 — AWIN deep link + WebView', runnable: false, blocker: 'Needs AWIN_PUBLISHER_ID + AWIN_API_KEY' },
]

export default function SpikeIndex() {
  return (
    <View style={s.root}>
      <Text style={s.title}>Validation Spikes</Text>
      {SPIKES.map((spike) => (
        <View key={spike.label} style={s.card}>
          {spike.runnable ? (
            <Link href={spike.href as any} style={s.link}>{spike.label}</Link>
          ) : (
            <Text style={s.cardTitle}>{spike.label}</Text>
          )}
          {spike.blocker && <Text style={s.blocker}>BLOCKED — {spike.blocker}</Text>}
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff', padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  card: { padding: 14, backgroundColor: '#f5f5f5', borderRadius: 10, gap: 4 },
  link: { fontSize: 15, fontWeight: '600', color: '#007AFF' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#000' },
  blocker: { fontSize: 12, color: '#FF3B30' },
})
