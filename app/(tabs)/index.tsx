import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, FlatList, Modal, Pressable, ScrollView, Share, StyleSheet, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { View, Text } from '../../src/tw'
import { supabase } from '../../src/lib/supabase'
import { useSession } from '../../src/lib/session'
import { CombinationsCounter } from '../../src/components/CombinationsCounter'
import { ShareCard } from '../../src/components/ShareCard'
import { TabBar, TAB_BAR_HEIGHT } from '../../src/components/TabBar'
import { RemoteImage } from '../../src/components/RemoteImage'
import { combinationsLive, gapHint } from '../../src/lib/combinations'
import { consumeStale, STALE_MS } from '../../src/lib/refresh'

const ACCENT = '#c8f04d'
const H_PAD = 24
const COL_GAP = 12
const CARD_WIDTH = (Dimensions.get('window').width - H_PAD * 2 - COL_GAP) / 2

type Item = {
  id: string
  image_url: string
  category: string
  name: string | null
}

const FILTERS = ['All', 'Top', 'Bottom', 'Dress', 'Outerwear', 'Shoes', 'Bag', 'Accessory'] as const
type Filter = (typeof FILTERS)[number]

function ItemCard({ item }: { item: Item }) {
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push(`/(tabs)/item/${item.id}`)}
      style={({ pressed }) => [s.card, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={s.imageWrap}>
        <RemoteImage
          path={item.image_url}
          style={s.image}
          contentFit="contain"
        />
      </View>
      <View style={s.cardLabel}>
        <Text style={s.cardCategory}>{item.category.toUpperCase()}</Text>
      </View>
    </Pressable>
  )
}

const CAP_TITLE   = 'Wardrobe full'
const CAP_MESSAGE = 'Free accounts can store up to 150 items. Remove some items or upgrade to Pro for unlimited storage.'

export default function WardrobeScreen() {
  const router = useRouter()
  const { session } = useSession()
  const [items, setItems] = useState<Item[]>([])
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [showShare, setShowShare] = useState(false)
  const [shareWorn, setShareWorn] = useState(0)
  const lastFetch = useRef(0)

  useFocusEffect(
    useCallback(() => {
      let active = true
      async function load() {
        const { data } = await supabase
          .from('items')
          .select('id, image_url, category, name')
          .order('created_at', { ascending: false })
        if (active) {
          setItems(data ?? [])
          setReady(true)
          lastFetch.current = Date.now()
        }
      }
      // Refetch only when a mutation flagged us dirty or the data is stale.
      if (consumeStale('closet') || Date.now() - lastFetch.current > STALE_MS) {
        load()
      }
      return () => { active = false }
    }, [])
  )

  async function handleAddItem() {
    const { count } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
    if ((count ?? 0) >= 150) {
      Alert.alert(CAP_TITLE, CAP_MESSAGE, [{ text: 'OK' }])
      return
    }
    router.push('/onboarding/add-first-item')
  }

  // Counts reflect the WHOLE wardrobe (not the filtered view).
  const tops    = items.filter(i => i.category === 'Top').length
  const bottoms = items.filter(i => i.category === 'Bottom').length
  const shoes   = items.filter(i => i.category === 'Shoes').length
  const dresses = items.filter(i => i.category === 'Dress').length
  const hint    = gapHint({ tops, bottoms, shoes, dresses })
  const comboCount = combinationsLive({ tops, bottoms, shoes, dresses })

  // Reuse the in-state items for the combo count; only the worn count needs a
  // (cheap, head-only) query, fetched lazily when the share sheet opens.
  async function openShare() {
    const { count } = await supabase
      .from('wears')
      .select('*', { count: 'exact', head: true })
    setShareWorn(count ?? 0)
    setShowShare(true)
  }

  function shareCombinations() {
    Share.share({
      message: `I own ${comboCount} outfit combinations and I've only worn a fraction of them. \nDiscover yours: wren-waitlist.vercel.app`,
    })
  }

  const q = search.trim().toLowerCase()
  const filteredItems = useMemo(
    () =>
      items.filter(i => {
        const catOk = filter === 'All' || i.category === filter
        const searchOk =
          q === '' ||
          (i.name?.toLowerCase().includes(q) ?? false) ||
          i.category.toLowerCase().includes(q)
        return catOk && searchOk
      }),
    [items, filter, q],
  )

  const displayName =
    session?.user.user_metadata?.full_name ??
    session?.user.email?.split('@')[0] ??
    null

  return (
    <SafeAreaView style={s.root}>
      <View style={{ flex: 1 }}>

        {/* Sticky header ─────────────────────────────────────── */}
        <View style={s.header}>
          <CombinationsCounter compact tops={tops} bottoms={bottoms} shoes={shoes} dresses={dresses} gapHint={hint} />
          <Pressable
            onPress={openShare}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Share wardrobe"
            style={({ pressed }) => [s.shareBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={s.shareIcon}>↗</Text>
          </Pressable>
        </View>

        <View style={s.divider} />

        {/* Search + category filter ───────────────────────────── */}
        {items.length > 0 && (
          <View style={s.filterArea}>
            <View style={s.searchWrap}>
              <Text style={s.searchIcon}>⌕</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search your wardrobe"
                placeholderTextColor="#444444"
                style={s.searchInput}
                selectionColor={ACCENT}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={10} style={s.clearBtn}>
                  <Text style={s.clearIcon}>×</Text>
                </Pressable>
              )}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -H_PAD }}
              contentContainerStyle={s.pillRow}
            >
              {FILTERS.map(f => {
                const active = filter === f
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(f)}
                    style={[s.pill, active && s.pillActive]}
                  >
                    <Text style={[s.pillLabel, active && s.pillLabelActive]}>{f}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* Item grid ──────────────────────────────────────────── */}
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={s.row}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <ItemCard item={item} />}
          ListHeaderComponent={
            displayName ? (
              <Text style={s.greeting}>Hi, {displayName}</Text>
            ) : null
          }
          ListEmptyComponent={
            !ready ? null : items.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyHead}>Your wardrobe is empty.</Text>
                <Text style={s.emptySub}>Tap + to add your first item.</Text>
              </View>
            ) : (
              <View style={s.empty}>
                <Text style={s.emptyHead}>No matches.</Text>
                <Text style={s.emptySub}>Try a different search or filter.</Text>
              </View>
            )
          }
        />

        {/* FAB ────────────────────────────────────────────────── */}
        <Pressable
          onPress={handleAddItem}
          accessibilityRole="button"
          accessibilityLabel="Add item"
          style={({ pressed }) => [s.fab, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={s.fabIcon}>+</Text>
        </Pressable>

      </View>
      <TabBar active="wardrobe" />

      {/* Shareable combinations card ───────────────────────── */}
      <Modal
        visible={showShare}
        animationType="slide"
        transparent
        onRequestClose={() => setShowShare(false)}
      >
        <View style={s.shareOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowShare(false)} />
          <View style={s.shareSheet}>
            <ShareCard comboCount={comboCount} wornCount={shareWorn} />
            <Pressable
              onPress={shareCombinations}
              style={({ pressed }) => [s.shareCta, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={s.shareCtaLabel}>Share →</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 20,
    paddingBottom: 16,
  },
  signOut: {
    color: '#333333',
    fontSize: 13,
  },
  shareBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareIcon: {
    color: ACCENT,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
  },

  // Share sheet
  shareOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  shareSheet: {
    alignItems: 'center',
    gap: 20,
  },
  shareCta: {
    height: 52,
    paddingHorizontal: 48,
    backgroundColor: ACCENT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCtaLabel: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '700',
  },

  // Search + filter
  filterArea: {
    paddingHorizontal: H_PAD,
    paddingTop: 14,
    gap: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1e1e1e',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchIcon: { color: '#555555', fontSize: 18 },
  searchInput: { flex: 1, color: '#ffffff', fontSize: 15, padding: 0 },
  clearBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  clearIcon: { color: '#777777', fontSize: 20, lineHeight: 22 },
  pillRow: { flexDirection: 'row', gap: 8, paddingHorizontal: H_PAD },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    backgroundColor: '#111111',
  },
  pillActive: { borderColor: ACCENT, backgroundColor: ACCENT },
  pillLabel: { color: '#888888', fontSize: 13, fontWeight: '600' },
  pillLabelActive: { color: '#0a0a0a' },

  // Grid
  listContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    // Clear the FAB + TabBar so the last row is never hidden behind them.
    paddingBottom: TAB_BAR_HEIGHT + 80,
    gap: COL_GAP,
  },
  row: {
    gap: COL_GAP,
  },

  // Card
  card: {
    flex: 1,
    backgroundColor: '#111111',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#f0ede8',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  cardLabel: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cardCategory: {
    color: '#555555',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
  },

  // Greeting (list header)
  greeting: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },

  // Empty state
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

  // FAB
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
