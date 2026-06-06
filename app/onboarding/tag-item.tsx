import { useState, useEffect, useCallback } from 'react'
import { usePostHog } from 'posthog-react-native'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { View, Text } from '../../src/tw'
import { supabase } from '../../src/lib/supabase'
import { useSession } from '../../src/lib/session'
import { onboardingStore } from '../../src/lib/onboarding-store'
import { uploadItemImage } from '../../src/lib/item-images'
import { markStale } from '../../src/lib/refresh'

const ACCENT = '#c8f04d'
const CATEGORIES = ['Top', 'Bottom', 'Dress', 'Outerwear', 'Shoes', 'Bag', 'Accessory'] as const
type Category = (typeof CATEGORIES)[number]

type VisionState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; tags: string[] }

// ── Sub-components ────────────────────────────────────────────────────────────

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, selected && s.chipSelected]}
    >
      <Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text>
    </Pressable>
  )
}

function CategoryBtn({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.catBtn, selected && s.catBtnSelected]}
    >
      <Text style={[s.catBtnText, selected && s.catBtnTextSelected]}>{label}</Text>
    </Pressable>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TagItemScreen() {
  const router = useRouter()
  const { session } = useSession()
  const posthog = usePostHog()
  const cutoutUri = onboardingStore.cutoutUri

  const [vision, setVision] = useState<VisionState>({ kind: 'loading' })
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [category, setCategory] = useState<Category | null>(null)
  // Pre-fill the name when the item came from a pasted product link.
  const [itemName, setItemName] = useState(onboardingStore.prefillName || '')
  const [priceInput, setPriceInput] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTags = useCallback(async () => {
    setVision({ kind: 'loading' })

    if (!cutoutUri) {
      setVision({ kind: 'error', message: 'No image found. Go back and add a photo.' })
      return
    }

    const imageBase64 = cutoutUri.replace(/^data:image\/[^;]+;base64,/, '')

    const { data, error } = await supabase.functions.invoke('vision-tag', {
      body: { imageBase64 },
    })

    if (error || !data) {
      setVision({ kind: 'error', message: error?.message ?? 'Vision tagging failed.' })
      return
    }

    const tags: string[] = data.tags ?? []
    const suggestedCategory: Category | null = CATEGORIES.includes(data.suggestedCategory)
      ? data.suggestedCategory
      : null

    setAvailableTags(tags)
    setSelectedTags(new Set(tags))
    if (suggestedCategory) setCategory(suggestedCategory)
    setVision({ kind: 'loaded', tags })
  }, [cutoutUri])

  useEffect(() => {
    let active = true
    fetchTags().catch(() => {
      if (active) setVision({ kind: 'error', message: 'Something went wrong.' })
    })
    return () => { active = false }
  }, [fetchTags])

  function toggleTag(tag: string) {
    setSelectedTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  async function saveItem() {
    if (!category) return
    if (!session) {
      Alert.alert('Something went wrong', 'No active session. Please restart onboarding.')
      return
    }
    setSaving(true)

    // During onboarding the user is signed in anonymously; stamp the session
    // token so claim-onboarding-items can reassign this item on real sign-in.
    const isOnboarding = session.user.is_anonymous === true

    const itemId = Crypto.randomUUID()

    // Upload the cut-out to private Storage for permanent users (keeps the DB row
    // tiny). Onboarding items stay as a data URI — they belong to the throwaway
    // anonymous user and are reassigned on sign-in, so a Storage object under the
    // anon folder would become unreadable after the claim. The first item is
    // small and gets re-uploaded behaviourally as the wardrobe grows in-app.
    let imageUrl = cutoutUri
    if (!isOnboarding) {
      const path = await uploadItemImage(session.user.id, itemId, cutoutUri)
      if (path) imageUrl = path
    }

    // Optional price — never insert NaN.
    const parsedPrice = priceInput.trim() ? parseFloat(priceInput) : NaN
    const price = isNaN(parsedPrice) ? null : parsedPrice

    const { error } = await supabase.from('items').insert({
      id: itemId,
      user_id: session.user.id,
      image_url: imageUrl,
      category,
      tags: Array.from(selectedTags),
      name: itemName.trim() || null,
      price,
      session_token: isOnboarding ? onboardingStore.sessionToken : null,
    })

    setSaving(false)

    if (error) {
      Alert.alert('Save failed', error.message)
      return
    }

    posthog.capture('item_added', {
      category,
      tags_count: selectedTags.size,
      used_vision: vision.kind !== 'error',
    })
    markStale('closet')
    onboardingStore.cutoutUri = ''
    onboardingStore.prefillName = ''
    if (isOnboarding) {
      onboardingStore.anonUserId = session.user.id
      router.push('/onboarding/success')
    } else {
      router.replace('/(tabs)/')
    }
  }

  // Save enabled: category set + (≥1 tag if Vision returned any, or no tags available)
  const canSave = !!category && !saving &&
    (selectedTags.size > 0 || availableTags.length === 0 || vision.kind === 'error')

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header row with thumbnail */}
          <View className="flex-row items-start" style={{ gap: 16, marginBottom: 32 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.heading}>Tag this item</Text>
              <Text style={s.sub}>Tap chips to deselect unwanted tags.</Text>
            </View>
            {cutoutUri ? (
              <View style={s.thumbnail}>
                <Image source={{ uri: cutoutUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
              </View>
            ) : null}
          </View>

          {/* ── Tags section ── */}
          <Text style={s.sectionLabel}>TAGS</Text>

          {vision.kind === 'loading' && (
            <View style={s.loadingRow}>
              <ActivityIndicator color={ACCENT} />
              <Text style={s.loadingText}>Identifying clothing…</Text>
            </View>
          )}

          {vision.kind === 'error' && (
            <View style={{ gap: 8, marginBottom: 4 }}>
              <Text style={s.errorText}>{vision.message}</Text>
              <Pressable onPress={fetchTags} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Text style={s.retryText}>Retry ↺</Text>
              </Pressable>
            </View>
          )}

          {vision.kind === 'loaded' && availableTags.length === 0 && (
            <Text style={s.emptyText}>No clothing labels detected — select a category below to continue.</Text>
          )}

          {vision.kind === 'loaded' && availableTags.length > 0 && (
            <View style={s.chipRow}>
              {availableTags.map(tag => (
                <Chip
                  key={tag}
                  label={tag}
                  selected={selectedTags.has(tag)}
                  onPress={() => toggleTag(tag)}
                />
              ))}
            </View>
          )}

          <View style={s.divider} />

          {/* ── Category section ── */}
          <Text style={s.sectionLabel}>CATEGORY</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -24 }}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
          >
            {CATEGORIES.map(cat => (
              <CategoryBtn
                key={cat}
                label={cat}
                selected={category === cat}
                onPress={() => setCategory(cat)}
              />
            ))}
          </ScrollView>

          <View style={s.divider} />

          {/* ── Name section ── */}
          <Text style={s.sectionLabel}>NAME (optional)</Text>
          <TextInput
            value={itemName}
            onChangeText={setItemName}
            placeholder="e.g. White linen shirt"
            placeholderTextColor="#3a3a3a"
            style={s.nameInput}
            returnKeyType="done"
            maxLength={80}
          />

          {/* ── Price section ── */}
          <Text style={[s.sectionLabel, { marginTop: 24 }]}>PRICE PAID (optional)</Text>
          <TextInput
            placeholder="e.g. 45"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
            value={priceInput}
            onChangeText={setPriceInput}
            style={s.nameInput}
            returnKeyType="done"
          />
          <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>£ — used to calculate cost per wear</Text>

          {/* Bottom spacer so content clears the fixed button */}
          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Fixed save button */}
        <View style={s.saveArea}>
          <Pressable
            onPress={saveItem}
            disabled={!canSave}
            style={({ pressed }) => [
              s.saveBtn,
              { opacity: !canSave ? 0.35 : pressed ? 0.85 : 1 },
            ]}
          >
            {saving
              ? <ActivityIndicator color="#0a0a0a" />
              : <Text style={s.saveBtnLabel}>Save item</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
  },

  // Header
  heading: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
    marginBottom: 6,
  },
  sub: {
    color: '#555555',
    fontSize: 14,
    lineHeight: 20,
  },
  thumbnail: {
    width: 64,
    height: 86,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f0ede8',
    flexShrink: 0,
  },

  // Sections
  sectionLabel: {
    color: '#404040',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.5,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginVertical: 24,
  },

  // Tags loading / error / empty
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  loadingText: {
    color: '#555555',
    fontSize: 14,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    lineHeight: 18,
  },
  retryText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    color: '#555555',
    fontSize: 13,
    lineHeight: 18,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    backgroundColor: '#111111',
  },
  chipSelected: {
    borderColor: ACCENT,
    backgroundColor: `${ACCENT}18`,
  },
  chipText: {
    color: '#555555',
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: ACCENT,
  },

  // Category pills
  catBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    backgroundColor: '#111111',
  },
  catBtnSelected: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  catBtnText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
  },
  catBtnTextSelected: {
    color: '#0a0a0a',
    fontWeight: '700',
  },

  // Name input
  nameInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1e1e1e',
    backgroundColor: '#111111',
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 15,
  },

  // Save button
  saveArea: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  saveBtn: {
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
