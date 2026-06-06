import { useCallback, useRef, useState } from 'react'
import { usePostHog } from 'posthog-react-native'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { View, Text } from '../../src/tw'
import { supabase } from '../../src/lib/supabase'
import { useSession } from '../../src/lib/session'
import { TabBar } from '../../src/components/TabBar'
import { RemoteImage } from '../../src/components/RemoteImage'
import { requestAndStorePushToken } from '../../src/lib/push'
import { consumeStale, markStale, STALE_MS } from '../../src/lib/refresh'

const ACCENT = '#c8f04d'
const H_PAD = 24
const GRID_COL_GAP = 12
const SCREEN_W = Dimensions.get('window').width

const OCCASIONS = ['Casual', 'Work', 'Evening', 'Sport', 'Travel'] as const
type OccasionTag = typeof OCCASIONS[number]

type WardrobeItem = {
  id: string
  image_url: string
  category: string
}

type OutfitThumbnail = {
  id: string
  image_url: string
}

type OutfitRow = {
  id: string
  name: string
  occasion: string | null
  thumbnails: OutfitThumbnail[]
}

type CreateStep = 'select' | 'details'

// ── Helpers ───────────────────────────────────────────────────────────────────

type RawOutfitRow = {
  id: string
  name: string
  occasion: string | null
  outfit_items: { items: { id: string; image_url: string } | null }[]
}

function parseOutfits(raw: unknown[]): OutfitRow[] {
  return raw.map(r => {
    const row = r as RawOutfitRow
    return {
      id: row.id,
      name: row.name,
      occasion: row.occasion,
      thumbnails: row.outfit_items
        .map(oi => oi.items)
        .filter((x): x is OutfitThumbnail => x !== null),
    }
  })
}

async function fetchOutfits(): Promise<OutfitRow[]> {
  const { data } = await supabase
    .from('outfits')
    .select('id, name, occasion, created_at, outfit_items ( items ( id, image_url ) )')
    .order('created_at', { ascending: false })
  return parseOutfits(data ?? [])
}

// ── Outfit card ───────────────────────────────────────────────────────────────

function OutfitCard({
  outfit,
  onPress,
}: {
  outfit: OutfitRow
  onPress: () => void
}) {
  const thumbs = outfit.thumbnails.slice(0, 4)

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [card.wrap, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={card.thumbRow}>
        {thumbs.length > 0 ? (
          thumbs.map(t => (
            <View key={t.id} style={card.thumbWrap}>
              <RemoteImage
                path={t.image_url}
                style={card.thumb}
                contentFit="cover"
              />
            </View>
          ))
        ) : (
          <View style={card.thumbPlaceholder} />
        )}
      </View>
      <View style={card.body}>
        <Text style={card.name}>{outfit.name}</Text>
        {outfit.occasion ? (
          <View style={card.chip}>
            <Text style={card.chipText}>{outfit.occasion}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const card = StyleSheet.create({
  wrap: {
    backgroundColor: '#111111',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  thumbWrap: {
    width: 80,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1e1e1e',
  },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },
  name: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  chip: {
    backgroundColor: `${ACCENT}22`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
})

// ── Selectable item (create step 1) ───────────────────────────────────────────

function SelectableItem({
  item,
  selected,
  onToggle,
}: {
  item: WardrobeItem
  selected: boolean
  onToggle: () => void
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[sel.card, selected && sel.cardSelected]}
    >
      <View style={sel.imageWrap}>
        <RemoteImage
          path={item.image_url}
          style={sel.image}
          contentFit="contain"
        />
      </View>
      {selected && (
        <View style={sel.badge}>
          <Text style={sel.badgeText}>✓</Text>
        </View>
      )}
    </Pressable>
  )
}

const sel = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#111111',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: ACCENT,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#f0ede8',
  },
  image: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#0a0a0a',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
})

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OutfitsScreen() {
  const router = useRouter()
  const { session } = useSession()
  const posthog = usePostHog()

  const [outfits, setOutfits]   = useState<OutfitRow[]>([])
  const [ready, setReady]       = useState(false)
  const [occasionFilter, setOccasionFilter] = useState<'All' | OccasionTag>('All')

  // Create-flow state
  const [showCreate, setShowCreate] = useState(false)
  const [step, setStep]             = useState<CreateStep>('select')
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([])
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [outfitName, setOutfitName]       = useState('')
  const [occasion, setOccasion]           = useState<OccasionTag | null>(null)
  const [saving, setSaving]               = useState(false)

  const lastFetch = useRef(0)

  useFocusEffect(
    useCallback(() => {
      let active = true
      async function load() {
        const rows = await fetchOutfits()
        if (active) {
          setOutfits(rows)
          setReady(true)
          lastFetch.current = Date.now()
        }
      }
      if (consumeStale('outfits') || Date.now() - lastFetch.current > STALE_MS) {
        load()
      }
      return () => { active = false }
    }, [])
  )

  async function openCreate() {
    const { data } = await supabase
      .from('items')
      .select('id, image_url, category')
      .order('created_at', { ascending: false })
    setWardrobeItems(data ?? [])
    setSelectedIds(new Set())
    setOutfitName('')
    setOccasion(null)
    setStep('select')
    setShowCreate(true)
  }

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function saveOutfit() {
    if (!session || !outfitName.trim() || selectedIds.size === 0) return
    setSaving(true)

    const userId = session.user.id

    // Check count before insert to detect first outfit
    const { count: existingCount } = await supabase
      .from('outfits')
      .select('*', { count: 'exact', head: true })

    const { data: newOutfit, error } = await supabase
      .from('outfits')
      .insert({ user_id: userId, name: outfitName.trim(), occasion: occasion ?? null })
      .select('id')
      .single()

    if (error || !newOutfit) {
      setSaving(false)
      Alert.alert('Could not save outfit', error?.message ?? 'Please try again.')
      return
    }

    // Insert the join rows. If this fails, roll back the now-orphaned outfit so
    // the user is never left with an empty, itemless outfit.
    const { error: itemsError } = await supabase.from('outfit_items').insert(
      Array.from(selectedIds).map(itemId => ({
        outfit_id: newOutfit.id,
        item_id: itemId,
      }))
    )

    if (itemsError) {
      await supabase.from('outfits').delete().eq('id', newOutfit.id)
      setSaving(false)
      Alert.alert('Could not save outfit', 'Something went wrong saving the items. Please try again.')
      return
    }

    posthog.capture('outfit_saved', {
      item_count: selectedIds.size,
      occasion: occasion ?? null,
      nth_outfit: (existingCount ?? 0) + 1,
    })

    // North Star: fire-and-forget; unique constraint prevents duplicates
    if (existingCount === 0) {
      supabase.from('milestones').insert({
        user_id: userId,
        milestone: 'first_outfit_saved',
      }).then(({ error: mErr }) => {
        if (mErr && __DEV__) console.warn('milestone insert failed:', mErr.message)
      })
      // Request push token immediately after first outfit milestone
      requestAndStorePushToken(userId)
    }

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

    setSaving(false)
    setShowCreate(false)
    setOutfits(await fetchOutfits())
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={{ flex: 1 }}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.pageTitle}>Outfits</Text>
        </View>
        <View style={s.divider} />

        {/* Occasion filter ────────────────────────────────────── */}
        {outfits.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterRow}
            style={s.filterScroll}
          >
            {(['All', ...OCCASIONS] as const).map(f => {
              const active = occasionFilter === f
              return (
                <Pressable
                  key={f}
                  onPress={() => setOccasionFilter(f)}
                  style={[s.filterPill, active && s.filterPillActive]}
                >
                  <Text style={[s.filterPillLabel, active && s.filterPillLabelActive]}>{f}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        )}

        {/* List */}
        <FlatList
          data={occasionFilter === 'All' ? outfits : outfits.filter(o => o.occasion === occasionFilter)}
          keyExtractor={o => o.id}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: outfit }) => (
            <OutfitCard
              outfit={outfit}
              onPress={() => router.push(`/(tabs)/outfits/${outfit.id}`)}
            />
          )}
          ListEmptyComponent={
            ready ? (
              <View style={s.empty}>
                <Text style={s.emptyHead}>No outfits yet.</Text>
                <Text style={s.emptySub}>Tap + to build your first look.</Text>
              </View>
            ) : (
              <View style={s.empty}>
                <ActivityIndicator color={ACCENT} />
              </View>
            )
          }
        />

        {/* FAB */}
        <Pressable
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel="Create outfit"
          style={({ pressed }) => [s.fab, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={s.fabIcon}>+</Text>
        </Pressable>

      </View>

      <TabBar active="outfits" />

      {/* ── Create outfit modal ────────────────────────────────── */}
      <Modal
        visible={showCreate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreate(false)}
      >
        <SafeAreaView style={m.root}>

          {step === 'select' ? (
            <>
              <View style={m.topBar}>
                <Pressable
                  onPress={() => setShowCreate(false)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <Text style={m.cancel}>Cancel</Text>
                </Pressable>
                <Text style={m.title}>Select items</Text>
                <Pressable
                  onPress={() => setStep('details')}
                  disabled={selectedIds.size === 0}
                  hitSlop={8}
                >
                  <Text style={[m.next, selectedIds.size === 0 && m.nextDisabled]}>
                    Next
                  </Text>
                </Pressable>
              </View>

              {selectedIds.size > 0 && (
                <View style={m.selCount}>
                  <Text style={m.selCountText}>
                    {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
                  </Text>
                </View>
              )}

              <FlatList
                data={wardrobeItems}
                keyExtractor={i => i.id}
                numColumns={2}
                columnWrapperStyle={m.row}
                contentContainerStyle={m.gridContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <SelectableItem
                    item={item}
                    selected={selectedIds.has(item.id)}
                    onToggle={() => toggleItem(item.id)}
                  />
                )}
                ListEmptyComponent={
                  <View style={m.emptyGrid}>
                    <Text style={m.emptyGridText}>
                      Add items to your wardrobe first.
                    </Text>
                  </View>
                }
              />
            </>
          ) : (
            <>
              <View style={m.topBar}>
                <Pressable
                  onPress={() => setStep('select')}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <Text style={m.cancel}>← Back</Text>
                </Pressable>
                <Text style={m.title}>Name &amp; occasion</Text>
                <View style={{ width: 60 }} />
              </View>

              <ScrollView
                contentContainerStyle={m.detailContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={m.fieldLabel}>NAME</Text>
                <TextInput
                  value={outfitName}
                  onChangeText={setOutfitName}
                  placeholder="e.g. Sunday brunch look"
                  placeholderTextColor="#3a3a3a"
                  style={m.nameInput}
                  selectionColor={ACCENT}
                  autoFocus
                  returnKeyType="done"
                  maxLength={60}
                />

                <Text style={[m.fieldLabel, { marginTop: 28 }]}>OCCASION</Text>
                <View style={m.chipRow}>
                  {OCCASIONS.map(tag => {
                    const active = occasion === tag
                    return (
                      <Pressable
                        key={tag}
                        onPress={() => setOccasion(active ? null : tag)}
                        style={({ pressed }) => [
                          m.chip,
                          active && m.chipActive,
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Text style={[m.chipLabel, active && m.chipLabelActive]}>
                          {tag}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>

                <Pressable
                  onPress={saveOutfit}
                  disabled={saving || !outfitName.trim()}
                  style={({ pressed }) => [
                    m.saveBtn,
                    {
                      opacity:
                        saving || !outfitName.trim() ? 0.5 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={m.saveBtnLabel}>
                    {saving ? 'Saving…' : 'Save outfit'}
                  </Text>
                </Pressable>
              </ScrollView>
            </>
          )}

        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

// ── StyleSheets ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },

  header: {
    paddingHorizontal: H_PAD,
    paddingTop: 20,
    paddingBottom: 16,
  },
  pageTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
  },

  filterScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: H_PAD,
    paddingVertical: 12,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    backgroundColor: '#111111',
  },
  filterPillActive: { borderColor: ACCENT, backgroundColor: ACCENT },
  filterPillLabel: { color: '#888888', fontSize: 13, fontWeight: '600' },
  filterPillLabelActive: { color: '#0a0a0a' },

  listContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 120,
  },

  empty: {
    paddingTop: 80,
    alignItems: 'center',
    gap: 8,
  },
  emptyHead: {
    color: '#555555',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySub: {
    color: '#333333',
    fontSize: 14,
  },

  fab: {
    position: 'absolute',
    bottom: 32,
    right: H_PAD,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    color: '#0a0a0a',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
})

const m = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  title: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  cancel: {
    color: '#555555',
    fontSize: 15,
    fontWeight: '500',
    width: 60,
  },
  next: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: '700',
    width: 60,
    textAlign: 'right',
  },
  nextDisabled: {
    color: '#2e2e2e',
  },

  selCount: {
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    backgroundColor: `${ACCENT}10`,
  },
  selCountText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '600',
  },

  row: { gap: GRID_COL_GAP },
  gridContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: 32,
    gap: GRID_COL_GAP,
  },
  emptyGrid: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyGridText: {
    color: '#444444',
    fontSize: 14,
  },

  detailContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 28,
    paddingBottom: 48,
  },
  fieldLabel: {
    color: '#666666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  nameInput: {
    height: 52,
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '500',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    backgroundColor: '#111111',
  },
  chipActive: {
    borderColor: ACCENT,
    backgroundColor: `${ACCENT}18`,
  },
  chipLabel: {
    color: '#555555',
    fontSize: 14,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: ACCENT,
  },

  saveBtn: {
    marginTop: 36,
    height: 56,
    backgroundColor: ACCENT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnLabel: {
    color: '#0a0a0a',
    fontSize: 17,
    fontWeight: '700',
  },
})
