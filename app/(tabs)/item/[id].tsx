import { useEffect, useState } from 'react'
import { usePostHog } from 'posthog-react-native'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { View, Text } from '../../../src/tw'
import { supabase } from '../../../src/lib/supabase'
import { useSession } from '../../../src/lib/session'
import { RemoteImage } from '../../../src/components/RemoteImage'
import { removeItemImage } from '../../../src/lib/item-images'
import { markStale } from '../../../src/lib/refresh'

const ACCENT = '#c8f04d'
const CATEGORIES = ['Top', 'Bottom', 'Dress', 'Outerwear', 'Shoes', 'Bag', 'Accessory'] as const

type ItemDetail = {
  id: string
  image_url: string
  category: string
  name: string | null
  tags: string[]
  price: number | null
}

type WearState = 'idle' | 'saving' | 'done'

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { session } = useSession()

  const posthog = usePostHog()
  const [item, setItem]           = useState<ItemDetail | null>(null)
  const [wearCount, setWearCount] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [wearState, setWearState] = useState<WearState>('idle')
  const [deleting, setDeleting]   = useState(false)
  // One-time cost-per-wear nudge shown after a wear when no price is set yet.
  const [showCpwPrompt, setShowCpwPrompt] = useState(false)
  // Android price sheet
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [priceInput, setPriceInput]         = useState('')
  // Edit (name + category) sheet
  const [showEdit, setShowEdit]       = useState(false)
  const [editName, setEditName]       = useState('')
  const [editCategory, setEditCategory] = useState<string>('Top')
  const [savingEdit, setSavingEdit]   = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: itemData }, { count }] = await Promise.all([
        supabase
          .from('items')
          .select('id, image_url, category, name, tags, price')
          .eq('id', id)
          .single(),
        supabase
          .from('wears')
          .select('*', { count: 'exact', head: true })
          .eq('item_id', id),
      ])
      setItem(itemData)
      setWearCount(count ?? 0)
      setLoading(false)
    }
    if (id) load()
  }, [id])

  // ── Wear ──────────────────────────────────────────────────────────────────

  async function logWear() {
    if (!session || !item) return
    setWearState('saving')
    const { error } = await supabase.from('wears').insert({
      item_id: item.id,
      user_id: session.user.id,
    })
    if (error) {
      Alert.alert('Could not log wear', error.message)
      setWearState('idle')
      return
    }
    setWearCount(c => c + 1)
    setWearState('done')
    setTimeout(() => setWearState('idle'), 2500)
    posthog.capture('wear_logged', {
      category: item.category,
    })

    // CPW activation: the first time a user logs a wear on an item with no price,
    // nudge them to add what they paid. Shown once ever, then auto-dismissed.
    if (item.price === null) {
      try {
        const shown = await AsyncStorage.getItem('cpw_prompt_shown')
        if (!shown) {
          setShowCpwPrompt(true)
          await AsyncStorage.setItem('cpw_prompt_shown', 'true')
          setTimeout(() => setShowCpwPrompt(false), 4000)
        }
      } catch {
        // best-effort nudge; ignore storage errors
      }
    }
  }

  // ── Price ─────────────────────────────────────────────────────────────────

  function openPricePrompt() {
    if (!item) return
    const defaultValue = item.price != null ? item.price.toFixed(2) : ''

    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Item price',
        'How much did you pay? (£)',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: (value?: string) => {
              if (!value) return
              const parsed = parseFloat(value.replace(/[^0-9.]/g, ''))
              if (!isNaN(parsed) && parsed >= 0) updatePrice(parsed)
            },
          },
        ],
        'plain-text',
        defaultValue,
        'decimal-pad'
      )
    } else {
      setPriceInput(defaultValue)
      setShowPriceModal(true)
    }
  }

  async function updatePrice(value: number) {
    if (!item) return
    const { error } = await supabase
      .from('items')
      .update({ price: value })
      .eq('id', item.id)
    if (error) {
      Alert.alert('Update failed', error.message)
      return
    }
    setItem(prev => (prev ? { ...prev, price: value } : prev))
  }

  function commitAndroidPrice() {
    const parsed = parseFloat(priceInput.replace(/[^0-9.]/g, ''))
    if (!isNaN(parsed) && parsed >= 0) updatePrice(parsed)
    setShowPriceModal(false)
  }

  // ── Edit (name + category) ──────────────────────────────────────────────────

  function openEdit() {
    if (!item) return
    setEditName(item.name ?? '')
    setEditCategory(item.category)
    setShowEdit(true)
  }

  async function saveEdit() {
    if (!item) return
    setSavingEdit(true)
    const name = editName.trim() || null
    const { error } = await supabase
      .from('items')
      .update({ name, category: editCategory })
      .eq('id', item.id)
    setSavingEdit(false)
    if (error) {
      Alert.alert('Update failed', error.message)
      return
    }
    setItem(prev => (prev ? { ...prev, name, category: editCategory } : prev))
    markStale('closet')
    setShowEdit(false)
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!item) return

    // Find outfits that include this item so we can warn the user and clean up
    // any outfit left empty afterwards.
    const { data: oi } = await supabase
      .from('outfit_items')
      .select('outfit_id')
      .eq('item_id', item.id)
    const outfitIds = Array.from(new Set((oi ?? []).map(r => r.outfit_id as string)))
    const n = outfitIds.length

    const message =
      n > 0
        ? `This item appears in ${n} outfit${n === 1 ? '' : 's'}. Removing it will update ${n === 1 ? 'that outfit' : 'those outfits'}. Continue?`
        : 'This will permanently delete the item from your wardrobe.'

    Alert.alert('Remove item', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteItem(outfitIds) },
    ])
  }

  async function deleteItem(affectedOutfitIds: string[]) {
    if (!item) return
    setDeleting(true)

    // Remove the Storage file (no-op for legacy data URIs).
    await removeItemImage(item.image_url)

    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) {
      Alert.alert('Delete failed', error.message)
      setDeleting(false)
      return
    }

    // outfit_items rows cascade away with the item. Any outfit now left with no
    // items is empty and unrecoverable — delete it too.
    for (const outfitId of affectedOutfitIds) {
      const { count } = await supabase
        .from('outfit_items')
        .select('*', { count: 'exact', head: true })
        .eq('outfit_id', outfitId)
      if ((count ?? 0) === 0) {
        await supabase.from('outfits').delete().eq('id', outfitId)
      }
    }

    // Closet counts change; outfits may have lost an item or been removed.
    markStale('closet')
    markStale('outfits')
    router.back()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.loadingWrap}>
          <ActivityIndicator color={ACCENT} />
        </View>
      </SafeAreaView>
    )
  }

  if (!item) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.loadingWrap}>
          <Text style={s.errorText}>Item not found.</Text>
          <Pressable onPress={() => router.back()} style={s.backLink}>
            <Text style={s.backLinkLabel}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const cpw = item.price != null && wearCount > 0
    ? (item.price / wearCount).toFixed(2)
    : null

  const wearLabel =
    wearState === 'saving' ? '…' :
    wearState === 'done'   ? 'Worn ✓' :
                             'Wear today'

  return (
    <SafeAreaView style={s.root}>
      <View style={{ flex: 1 }}>

        {/* Top bar ───────────────────────────────────────── */}
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Text style={s.backArrow}>←</Text>
          </Pressable>
          <Text style={s.topCategory}>{item.category.toUpperCase()}</Text>
          <Pressable
            onPress={openEdit}
            hitSlop={8}
            style={({ pressed }) => [s.editTopBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Text style={s.editTopLabel}>Edit</Text>
          </Pressable>
        </View>

        {/* Image ─────────────────────────────────────────── */}
        <View style={s.imageWrap}>
          <RemoteImage
            path={item.image_url}
            style={s.image}
            contentFit="contain"
          />
        </View>

        {/* Bottom panel ──────────────────────────────────── */}
        <View style={s.panel}>

          {item.name ? (
            <Text style={s.itemName}>{item.name}</Text>
          ) : null}

          {/* Cost-per-wear ─────────────────────────────── */}
          <View style={s.cpwRow}>
            <View style={{ flex: 1 }}>
              {cpw !== null ? (
                <>
                  <Text style={s.cpwValue}>£{cpw} per wear</Text>
                  <Text style={s.cpwMeta}>
                    £{item.price!.toFixed(2)} paid · {wearCount} {wearCount === 1 ? 'wear' : 'wears'}
                  </Text>
                </>
              ) : (
                <Text style={s.cpwPrompt}>Log a price to track cost-per-wear</Text>
              )}
            </View>
            <Pressable
              onPress={openPricePrompt}
              hitSlop={8}
              style={({ pressed }) => [s.editBtn, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={s.editIcon}>✎</Text>
            </Pressable>
          </View>

          {/* CPW nudge banner ──────────────────────────── */}
          {showCpwPrompt && (
            <TouchableOpacity
              onPress={() => { setShowCpwPrompt(false); openPricePrompt() }}
              style={{
                backgroundColor: '#1a1a1a',
                borderColor: '#c8f04d',
                borderWidth: 1,
                borderRadius: 10,
                padding: 14,
                marginHorizontal: 20,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#c8f04d', fontWeight: '600', fontSize: 13 }}>
                Add what you paid to track cost per wear →
              </Text>
            </TouchableOpacity>
          )}

          {/* Wear button ───────────────────────────────── */}
          <Pressable
            onPress={logWear}
            disabled={wearState !== 'idle' || deleting}
            style={({ pressed }) => [
              s.wearBtn,
              { opacity: wearState !== 'idle' || deleting ? 0.6 : pressed ? 0.85 : 1 },
              wearState === 'done' && s.wearBtnDone,
            ]}
          >
            <Text style={[s.wearBtnLabel, wearState === 'done' && s.wearBtnLabelDone]}>
              {wearLabel}
            </Text>
          </Pressable>

          {/* Delete ────────────────────────────────────── */}
          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            style={({ pressed }) => [s.deleteBtn, { opacity: deleting || pressed ? 0.4 : 1 }]}
          >
            <Text style={s.deleteBtnLabel}>
              {deleting ? 'Removing…' : 'Remove item'}
            </Text>
          </Pressable>

        </View>
      </View>

      {/* Android price bottom sheet ─────────────────────── */}
      <Modal
        visible={showPriceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPriceModal(false)}
      >
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPriceModal(false)} />
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Item price</Text>
            <Text style={s.modalSub}>How much did you pay? (£)</Text>
            <TextInput
              value={priceInput}
              onChangeText={setPriceInput}
              keyboardType="decimal-pad"
              style={s.modalInput}
              autoFocus
              placeholder="0.00"
              placeholderTextColor="#333333"
              selectionColor={ACCENT}
              returnKeyType="done"
              onSubmitEditing={commitAndroidPrice}
            />
            <View style={s.modalActions}>
              <Pressable
                onPress={() => setShowPriceModal(false)}
                style={({ pressed }) => [s.modalCancelBtn, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Text style={s.modalCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={commitAndroidPrice}
                style={({ pressed }) => [s.modalSaveBtn, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={s.modalSaveLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit name + category sheet ─────────────────────── */}
      <Modal
        visible={showEdit}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEdit(false)}
      >
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowEdit(false)} />
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Edit item</Text>

            <Text style={s.editFieldLabel}>NAME</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="e.g. White linen shirt"
              placeholderTextColor="#333333"
              style={s.modalInput}
              selectionColor={ACCENT}
              maxLength={80}
              returnKeyType="done"
            />

            <Text style={[s.editFieldLabel, { marginTop: 16 }]}>CATEGORY</Text>
            <View style={s.editChipRow}>
              {CATEGORIES.map(cat => {
                const active = editCategory === cat
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setEditCategory(cat)}
                    style={[s.editChip, active && s.editChipActive]}
                  >
                    <Text style={[s.editChipLabel, active && s.editChipLabelActive]}>{cat}</Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={s.modalActions}>
              <Pressable
                onPress={() => setShowEdit(false)}
                style={({ pressed }) => [s.modalCancelBtn, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Text style={s.modalCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                disabled={savingEdit}
                style={({ pressed }) => [s.modalSaveBtn, { opacity: savingEdit ? 0.6 : pressed ? 0.85 : 1 }]}
              >
                {savingEdit
                  ? <ActivityIndicator color="#0a0a0a" />
                  : <Text style={s.modalSaveLabel}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },

  loadingWrap: {
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { color: '#ffffff', fontSize: 22, lineHeight: 26 },
  topCategory: {
    color: '#555555',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
  },
  editTopBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  editTopLabel: { color: ACCENT, fontSize: 15, fontWeight: '600' },
  editFieldLabel: { color: '#666666', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 8, marginTop: 8 },
  editChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    borderWidth: 1.5, borderColor: '#2a2a2a', backgroundColor: '#1e1e1e',
  },
  editChipActive: { borderColor: ACCENT, backgroundColor: ACCENT },
  editChipLabel: { color: '#888888', fontSize: 13, fontWeight: '600' },
  editChipLabelActive: { color: '#0a0a0a' },

  // Image
  imageWrap: { flex: 1, backgroundColor: '#f0ede8' },
  image: { width: '100%', height: '100%' },

  // Panel
  panel: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  itemName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },

  // CPW row
  cpwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    gap: 8,
  },
  cpwValue: {
    color: ACCENT,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  cpwMeta: {
    color: '#444444',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  cpwPrompt: {
    color: '#3a3a3a',
    fontSize: 13,
    lineHeight: 18,
  },
  editBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIcon: {
    color: '#444444',
    fontSize: 18,
  },

  // Wear button
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

  // Delete button
  deleteBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnLabel: { color: '#555555', fontSize: 14 },

  // Android price bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
    gap: 12,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalSub: {
    color: '#555555',
    fontSize: 14,
  },
  modalInput: {
    height: 52,
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelLabel: { color: '#666666', fontSize: 16, fontWeight: '600' },
  modalSaveBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveLabel: { color: '#0a0a0a', fontSize: 16, fontWeight: '700' },
})
