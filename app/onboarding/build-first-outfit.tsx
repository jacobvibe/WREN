import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { View, Text } from '../../src/tw'
import { supabase } from '../../src/lib/supabase'
import { useSession } from '../../src/lib/session'
import { RemoteImage } from '../../src/components/RemoteImage'
import { requestAndStorePushToken } from '../../src/lib/push'
import { markStale } from '../../src/lib/refresh'

const ACCENT = '#c8f04d'
const H_PAD = 24
const COL_GAP = 12
const CARD_W = (Dimensions.get('window').width - H_PAD * 2 - COL_GAP) / 2

type WardrobeItem = { id: string; image_url: string; category: string }

// Mandatory final onboarding step: the user cannot leave until they save one
// outfit (drives the North Star — 10 saved outfits in 7 days). There is no back
// affordance (gestureEnabled:false in _layout, no header).

export default function BuildFirstOutfitScreen() {
  const router = useRouter()
  const { session } = useSession()

  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [name, setName] = useState('My First Look')
  const [saving, setSaving] = useState(false)
  const [celebrating, setCelebrating] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabase
        .from('items')
        .select('id, image_url, category')
        .order('created_at', { ascending: false })
      if (active) {
        setItems(data ?? [])
        setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function saveLook() {
    if (!session || selectedIds.size < 1 || !name.trim()) return
    setSaving(true)
    const userId = session.user.id

    const { data: newOutfit, error } = await supabase
      .from('outfits')
      .insert({ user_id: userId, name: name.trim(), occasion: null })
      .select('id')
      .single()

    if (error || !newOutfit) {
      setSaving(false)
      Alert.alert('Could not save', error?.message ?? 'Please try again.')
      return
    }

    const { error: itemsError } = await supabase.from('outfit_items').insert(
      Array.from(selectedIds).map(itemId => ({ outfit_id: newOutfit.id, item_id: itemId })),
    )
    if (itemsError) {
      await supabase.from('outfits').delete().eq('id', newOutfit.id)
      setSaving(false)
      Alert.alert('Could not save', 'Something went wrong saving your items. Please try again.')
      return
    }

    // First-outfit milestone + push opt-in (fire-and-forget; unique constraint dedupes).
    supabase.from('milestones').insert({ user_id: userId, milestone: 'first_outfit_saved' })
      .then(({ error: mErr }) => { if (mErr && __DEV__) console.warn('milestone insert failed:', mErr.message) })
    requestAndStorePushToken(userId)

    // North Star: 10th outfit within 7 days. Milestone tracking must never block
    // the save flow, so the whole block is wrapped in a swallow-all try/catch.
    try {
      const { count: totalOutfits } = await supabase
        .from('outfits')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)

      if (totalOutfits !== null && totalOutfits >= 10) {
        // Check if already recorded
        const { data: existing } = await supabase
          .from('milestones')
          .select('id')
          .eq('user_id', userId)
          .eq('milestone', 'tenth_outfit_saved')
          .maybeSingle()

        if (!existing) {
          // Check 7-day window from profile created_at
          const { data: profile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('user_id', userId)
            .maybeSingle()

          const withinSevenDays = profile?.created_at
            ? (Date.now() - new Date(profile.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000
            : false

          supabase
            .from('milestones')
            .insert({
              user_id: userId,
              milestone: withinSevenDays ? 'tenth_outfit_saved_within_7_days' : 'tenth_outfit_saved',
            })
            .then(() => {})
        }
      }
    } catch {
      // swallow — milestone tracking is best-effort
    }

    markStale('outfits')
    setSaving(false)
    setCelebrating(true)
    setTimeout(() => router.replace('/(tabs)/'), 1500)
  }

  if (celebrating) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.celebrate}>
          <Text style={s.celebrateText}>Your first look is saved ✓</Text>
        </View>
      </SafeAreaView>
    )
  }

  const canSave = selectedIds.size >= 1 && !!name.trim() && !saving

  return (
    <SafeAreaView style={s.root}>
      <View style={{ flex: 1 }}>
        <View style={s.header}>
          <Text style={s.heading}>Build your first look.</Text>
          <Text style={s.sub}>Pick one or more pieces. Trust us.</Text>
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={i => i.id}
            numColumns={2}
            columnWrapperStyle={s.row}
            contentContainerStyle={s.gridContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={s.nameBlock}>
                <Text style={s.fieldLabel}>NAME</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="My First Look"
                  placeholderTextColor="#3a3a3a"
                  style={s.nameInput}
                  selectionColor={ACCENT}
                  maxLength={60}
                  returnKeyType="done"
                />
              </View>
            }
            renderItem={({ item }) => {
              const selected = selectedIds.has(item.id)
              return (
                <Pressable onPress={() => toggle(item.id)} style={[sel.card, selected && sel.cardSelected]}>
                  <View style={sel.imageWrap}>
                    <RemoteImage path={item.image_url} style={sel.image} contentFit="contain" />
                  </View>
                  {selected && (
                    <View style={sel.badge}><Text style={sel.badgeText}>✓</Text></View>
                  )}
                </Pressable>
              )
            }}
            ListEmptyComponent={
              <View style={s.emptyGrid}>
                <Text style={s.emptyText}>No items yet — add a few first.</Text>
              </View>
            }
          />
        )}

        <View style={s.saveArea}>
          {selectedIds.size > 0 && (
            <Text style={s.selCount}>{selectedIds.size} selected</Text>
          )}
          <Pressable
            onPress={saveLook}
            disabled={!canSave}
            style={({ pressed }) => [s.saveBtn, { opacity: !canSave ? 0.35 : pressed ? 0.85 : 1 }]}
          >
            {saving
              ? <ActivityIndicator color="#0a0a0a" />
              : <Text style={s.saveLabel}>Save this look →</Text>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: H_PAD, paddingTop: 24, paddingBottom: 12 },
  heading: { color: '#ffffff', fontSize: 28, fontWeight: '700', lineHeight: 34, marginBottom: 6 },
  sub: { color: '#555555', fontSize: 15, lineHeight: 20 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  nameBlock: { marginBottom: 16 },
  fieldLabel: { color: '#666666', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10 },
  nameInput: {
    height: 52, backgroundColor: '#161616', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#2a2a2a', paddingHorizontal: 16, color: '#ffffff', fontSize: 17, fontWeight: '500',
  },

  row: { gap: COL_GAP },
  gridContent: { paddingHorizontal: H_PAD, paddingTop: 12, paddingBottom: 24, gap: COL_GAP },
  emptyGrid: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: '#444444', fontSize: 14 },

  saveArea: {
    paddingHorizontal: H_PAD, paddingTop: 12, paddingBottom: 16,
    backgroundColor: '#0a0a0a', borderTopWidth: 1, borderTopColor: '#1a1a1a', gap: 8,
  },
  selCount: { color: ACCENT, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  saveBtn: { height: 56, backgroundColor: ACCENT, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { color: '#0a0a0a', fontSize: 17, fontWeight: '700' },

  celebrate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  celebrateText: { color: ACCENT, fontSize: 24, fontWeight: '700', textAlign: 'center' },
})

const sel = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: '#111111', borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent', maxWidth: CARD_W,
  },
  cardSelected: { borderColor: ACCENT },
  imageWrap: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#f0ede8' },
  image: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#0a0a0a', fontSize: 13, fontWeight: '800', lineHeight: 16 },
})
