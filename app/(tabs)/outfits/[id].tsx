import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { View, Text } from '../../../src/tw'
import { supabase } from '../../../src/lib/supabase'
import { useSession } from '../../../src/lib/session'
import { RemoteImage } from '../../../src/components/RemoteImage'
import { markStale } from '../../../src/lib/refresh'

const ACCENT = '#c8f04d'
const H_PAD = 20
const COLLAGE_ITEM_SIZE = 140
const OCCASIONS = ['Casual', 'Work', 'Evening', 'Sport', 'Travel'] as const
type OccasionTag = (typeof OCCASIONS)[number]

type WardrobeItem = { id: string; image_url: string }

type OutfitDetail = {
  id: string
  name: string
  occasion: string | null
}

type OutfitItemRow = {
  id: string
  item_id: string
  image_url: string
}

type WearState = 'idle' | 'saving' | 'done'

async function fetchOutfitDetail(id: string): Promise<{ outfit: OutfitDetail | null; items: OutfitItemRow[] }> {
  const [{ data: outfitData }, { data: itemData }] = await Promise.all([
    supabase.from('outfits').select('id, name, occasion').eq('id', id).single(),
    supabase.from('outfit_items').select('id, item_id, items ( id, image_url )').eq('outfit_id', id),
  ])

  const resolved: OutfitItemRow[] = (itemData ?? []).map((row: unknown) => {
    const r = row as { id: string; item_id: string; items: { id: string; image_url: string } | null }
    return { id: r.id, item_id: r.item_id, image_url: r.items?.image_url ?? '' }
  })

  return {
    outfit: outfitData as OutfitDetail | null,
    items: resolved.filter(r => r.image_url !== ''),
  }
}

export default function OutfitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { session } = useSession()

  const [outfit, setOutfit]     = useState<OutfitDetail | null>(null)
  const [items, setItems]       = useState<OutfitItemRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [wearState, setWearState] = useState<WearState>('idle')
  const [deleting, setDeleting]   = useState(false)

  // Edit flow
  const [showEdit, setShowEdit]       = useState(false)
  const [wardrobe, setWardrobe]       = useState<WardrobeItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editName, setEditName]       = useState('')
  const [editOccasion, setEditOccasion] = useState<OccasionTag | null>(null)
  const [savingEdit, setSavingEdit]   = useState(false)

  async function reload() {
    if (!id) return
    const { outfit: o, items: rows } = await fetchOutfitDetail(id)
    setOutfit(o)
    setItems(rows)
    setLoading(false)
  }

  useEffect(() => {
    if (id) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function wearOutfit() {
    if (!session || items.length === 0) return
    setWearState('saving')
    const { error } = await supabase.from('wears').insert(
      items.map(item => ({
        item_id: item.item_id,
        user_id: session.user.id,
      }))
    )
    if (error) {
      Alert.alert('Could not log wear', error.message)
      setWearState('idle')
      return
    }
    setWearState('done')
    setTimeout(() => setWearState('idle'), 2500)
  }

  function confirmDelete() {
    Alert.alert(
      'Delete outfit',
      'This will permanently delete this outfit and remove all its items.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteOutfit },
      ]
    )
  }

  async function deleteOutfit() {
    if (!outfit) return
    setDeleting(true)
    // outfit_items cascade-deleted via FK on outfits
    const { error } = await supabase.from('outfits').delete().eq('id', outfit.id)
    if (error) {
      Alert.alert('Delete failed', error.message)
      setDeleting(false)
      return
    }
    markStale('outfits')
    router.back()
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  async function openEdit() {
    if (!outfit) return
    const { data } = await supabase
      .from('items')
      .select('id, image_url')
      .order('created_at', { ascending: false })
    setWardrobe(data ?? [])
    setSelectedIds(new Set(items.map(i => i.item_id)))
    setEditName(outfit.name)
    setEditOccasion((outfit.occasion as OccasionTag | null) ?? null)
    setShowEdit(true)
  }

  function toggleSelected(itemId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(itemId) ? next.delete(itemId) : next.add(itemId)
      return next
    })
  }

  function confirmSaveEdit() {
    if (!editName.trim() || selectedIds.size === 0) return
    Alert.alert('Update outfit?', 'This will overwrite the current outfit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: saveEdit },
    ])
  }

  async function saveEdit() {
    if (!outfit) return
    setSavingEdit(true)

    const { error: updErr } = await supabase
      .from('outfits')
      .update({ name: editName.trim(), occasion: editOccasion ?? null })
      .eq('id', outfit.id)
    if (updErr) {
      setSavingEdit(false)
      Alert.alert('Update failed', updErr.message)
      return
    }

    // Replace the join rows: delete all, then re-insert the new selection.
    const { error: delErr } = await supabase.from('outfit_items').delete().eq('outfit_id', outfit.id)
    if (delErr) {
      setSavingEdit(false)
      Alert.alert('Update failed', delErr.message)
      return
    }
    const { error: insErr } = await supabase.from('outfit_items').insert(
      Array.from(selectedIds).map(itemId => ({ outfit_id: outfit.id, item_id: itemId })),
    )
    if (insErr) {
      setSavingEdit(false)
      Alert.alert('Update failed', insErr.message)
      return
    }

    setSavingEdit(false)
    setShowEdit(false)
    markStale('outfits')
    setLoading(true)
    await reload()
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}>
          <ActivityIndicator color={ACCENT} />
        </View>
      </SafeAreaView>
    )
  }

  if (!outfit) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}>
          <Text style={s.errorText}>Outfit not found.</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backLink, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Text style={s.backLinkLabel}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const wearLabel =
    wearState === 'saving' ? '…' :
    wearState === 'done'   ? 'Worn ✓' :
                             'Wear this outfit'

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Text style={s.backArrow}>←</Text>
        </Pressable>
        <View style={s.titleWrap}>
          <Text style={s.outfitName} numberOfLines={1}>{outfit.name}</Text>
          {outfit.occasion ? (
            <View style={s.occasionChip}>
              <Text style={s.occasionChipText}>{outfit.occasion}</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={openEdit}
          hitSlop={8}
          style={({ pressed }) => [s.editTopBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Text style={s.editTopLabel}>Edit</Text>
        </Pressable>
      </View>

      {/* Collage — wrapping grid of all items */}
      <ScrollView
        contentContainerStyle={s.collage}
        showsVerticalScrollIndicator={false}
      >
        {items.map(item => (
          <View key={item.id} style={s.collageItem}>
            <RemoteImage
              path={item.image_url}
              style={s.collageImage}
              contentFit="contain"
            />
          </View>
        ))}
        {items.length === 0 && (
          <Text style={s.emptyCollage}>No items in this outfit.</Text>
        )}
      </ScrollView>

      {/* Bottom panel */}
      <View style={s.panel}>
        <Pressable
          onPress={wearOutfit}
          disabled={wearState !== 'idle' || deleting || items.length === 0}
          style={({ pressed }) => [
            s.wearBtn,
            {
              opacity:
                wearState !== 'idle' || deleting || items.length === 0
                  ? 0.6
                  : pressed ? 0.85 : 1,
            },
            wearState === 'done' && s.wearBtnDone,
          ]}
        >
          <Text style={[s.wearBtnLabel, wearState === 'done' && s.wearBtnLabelDone]}>
            {wearLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          style={({ pressed }) => [
            s.deleteBtn,
            { opacity: deleting || pressed ? 0.4 : 1 },
          ]}
        >
          <Text style={s.deleteBtnLabel}>
            {deleting ? 'Deleting…' : 'Delete outfit'}
          </Text>
        </Pressable>
      </View>

      {/* Edit outfit modal ──────────────────────────────── */}
      <Modal
        visible={showEdit}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEdit(false)}
      >
        <SafeAreaView style={s.root}>
          <View style={s.editTopBar}>
            <Pressable onPress={() => setShowEdit(false)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Text style={s.editCancel}>Cancel</Text>
            </Pressable>
            <Text style={s.editTitle}>Edit outfit</Text>
            <Pressable
              onPress={confirmSaveEdit}
              disabled={!editName.trim() || selectedIds.size === 0 || savingEdit}
              hitSlop={8}
            >
              <Text style={[s.editSave, (!editName.trim() || selectedIds.size === 0) && s.editSaveDisabled]}>
                {savingEdit ? '…' : 'Save'}
              </Text>
            </Pressable>
          </View>

          <FlatList
            data={wardrobe}
            keyExtractor={i => i.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={s.editGrid}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={{ marginBottom: 16 }}>
                <Text style={s.editFieldLabel}>NAME</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Outfit name"
                  placeholderTextColor="#3a3a3a"
                  style={s.editNameInput}
                  selectionColor={ACCENT}
                  maxLength={60}
                />
                <Text style={[s.editFieldLabel, { marginTop: 18 }]}>OCCASION</Text>
                <View style={s.editChipRow}>
                  {OCCASIONS.map(tag => {
                    const active = editOccasion === tag
                    return (
                      <Pressable
                        key={tag}
                        onPress={() => setEditOccasion(active ? null : tag)}
                        style={[s.editChip, active && s.editChipActive]}
                      >
                        <Text style={[s.editChipLabel, active && s.editChipLabelActive]}>{tag}</Text>
                      </Pressable>
                    )
                  })}
                </View>
                <Text style={[s.editFieldLabel, { marginTop: 18 }]}>
                  ITEMS ({selectedIds.size})
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const selected = selectedIds.has(item.id)
              return (
                <Pressable onPress={() => toggleSelected(item.id)} style={[s.editItemCard, selected && s.editItemCardSelected]}>
                  <View style={s.editItemImageWrap}>
                    <RemoteImage path={item.image_url} style={s.collageImage} contentFit="contain" />
                  </View>
                  {selected && <View style={s.editBadge}><Text style={s.editBadgeText}>✓</Text></View>}
                </Pressable>
              )
            }}
          />
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: { color: '#555555', fontSize: 15 },
  backLink: { paddingVertical: 8 },
  backLinkLabel: { color: ACCENT, fontSize: 15, fontWeight: '600' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { color: '#ffffff', fontSize: 22, lineHeight: 26 },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  outfitName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  occasionChip: {
    backgroundColor: `${ACCENT}22`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  occasionChipText: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },

  // Collage
  collage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
  },
  collageItem: {
    width: COLLAGE_ITEM_SIZE,
    height: COLLAGE_ITEM_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f0ede8',
  },
  collageImage: { width: '100%', height: '100%' },
  emptyCollage: {
    color: '#444444',
    fontSize: 14,
    padding: 20,
  },

  // Bottom panel
  panel: {
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    backgroundColor: '#0a0a0a',
  },
  wearBtn: {
    height: 56,
    backgroundColor: ACCENT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wearBtnDone: { backgroundColor: '#1e2a0a' },
  wearBtnLabel: { color: '#0a0a0a', fontSize: 17, fontWeight: '700' },
  wearBtnLabelDone: { color: ACCENT },

  deleteBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnLabel: { color: '#555555', fontSize: 14 },

  // Edit button (top bar)
  editTopBtn: { width: 36, height: 36, alignItems: 'flex-end', justifyContent: 'center' },
  editTopLabel: { color: ACCENT, fontSize: 15, fontWeight: '600' },

  // Edit modal
  editTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  editCancel: { color: '#555555', fontSize: 15, fontWeight: '500', width: 60 },
  editTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  editSave: { color: ACCENT, fontSize: 15, fontWeight: '700', width: 60, textAlign: 'right' },
  editSaveDisabled: { color: '#2e2e2e' },
  editGrid: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 },
  editFieldLabel: { color: '#666666', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10 },
  editNameInput: {
    height: 52, backgroundColor: '#161616', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#2a2a2a', paddingHorizontal: 16, color: '#ffffff', fontSize: 17, fontWeight: '500',
  },
  editChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18,
    borderWidth: 1.5, borderColor: '#2a2a2a', backgroundColor: '#111111',
  },
  editChipActive: { borderColor: ACCENT, backgroundColor: `${ACCENT}18` },
  editChipLabel: { color: '#555555', fontSize: 13, fontWeight: '600' },
  editChipLabelActive: { color: ACCENT },
  editItemCard: {
    flex: 1, backgroundColor: '#111111', borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent', maxWidth: '48%',
  },
  editItemCardSelected: { borderColor: ACCENT },
  editItemImageWrap: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#f0ede8' },
  editBadge: {
    position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
  },
  editBadgeText: { color: '#0a0a0a', fontSize: 13, fontWeight: '800', lineHeight: 16 },
})
