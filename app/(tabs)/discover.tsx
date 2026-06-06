import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { usePostHog } from 'posthog-react-native'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useFocusEffect, useRouter } from 'expo-router'
import { View, Text } from '../../src/tw'
import { supabase } from '../../src/lib/supabase'
import { TabBar } from '../../src/components/TabBar'
import { AwinWebView } from '../../src/components/AwinWebView'

const ACCENT = '#c8f04d'

// ── Types ─────────────────────────────────────────────────────────────────────

type AffiliateProduct = {
  id: string
  brand: string
  name: string
  price: string
  imageUrl: string
  url: string
  retailer: string
  category: string
  /** AWIN merchant id used to build the tracked link. */
  merchantId: string
}

const ALL_CATEGORIES = [
  'Top', 'Bottom', 'Dress', 'Outerwear', 'Shoes', 'Bag', 'Accessory',
] as const
type Category = (typeof ALL_CATEGORIES)[number]

// Single affiliate disclosure for the whole tab (ASA UK / AWIN requirement).
// Rendered as a fixed muted bar at the TOP of the scroll, above every product
// row, so it is seen before any product can be tapped — never per card.
const AFFILIATE_DISCLOSURE = 'We earn a small commission on purchases — it keeps WREN free.'

// Placeholder AWIN merchant id until our publisher account is approved.
// TODO: replace with the real AWIN merchant ID per product once live.
const MERCHANT_ID_PLACEHOLDER = '0'

// Only show the mock catalogue in development. In production the Discover tab
// shows a "coming soon" state until the live AWIN feed is wired up.
const USE_MOCK_PRODUCTS = __DEV__

// ── Mock catalogue ────────────────────────────────────────────────────────────
// TODO: REMOVE BEFORE PRODUCTION — replace with live AWIN feed.
// These are placeholder products with picsum.photos images; Apple reviewers flag
// fake listings, so they are gated behind USE_MOCK_PRODUCTS (__DEV__) above.

const MOCK_CATALOGUE: Record<Category, Omit<AffiliateProduct, 'merchantId'>[]> = {
  Top: [
    { id: 'top-1', brand: 'ASOS', name: 'Oversized Boxy Fit T-Shirt', price: '£12.00', imageUrl: 'https://picsum.photos/seed/top1/400/500', url: 'https://www.asos.com', retailer: 'ASOS', category: 'Top' },
    { id: 'top-2', brand: 'M&S', name: 'Pure Cotton Fitted Shirt', price: '£35.00', imageUrl: 'https://picsum.photos/seed/top2/400/500', url: 'https://www.marksandspencer.com', retailer: 'M&S', category: 'Top' },
    { id: 'top-3', brand: 'PLT', name: 'Ribbed Cropped Tank', price: '£8.00', imageUrl: 'https://picsum.photos/seed/top3/400/500', url: 'https://www.prettylittlething.com', retailer: 'PLT', category: 'Top' },
    { id: 'top-4', brand: 'Boohoo', name: 'Striped Linen Blend Blouse', price: '£18.00', imageUrl: 'https://picsum.photos/seed/top4/400/500', url: 'https://www.boohoo.com', retailer: 'Boohoo', category: 'Top' },
  ],
  Bottom: [
    { id: 'bot-1', brand: 'PLT', name: 'High-Waist Straight Leg Jeans', price: '£28.00', imageUrl: 'https://picsum.photos/seed/bot1/400/500', url: 'https://www.prettylittlething.com', retailer: 'PLT', category: 'Bottom' },
    { id: 'bot-2', brand: 'Boohoo', name: 'Wide Leg Tailored Trousers', price: '£22.00', imageUrl: 'https://picsum.photos/seed/bot2/400/500', url: 'https://www.boohoo.com', retailer: 'Boohoo', category: 'Bottom' },
    { id: 'bot-3', brand: 'M&S', name: 'Wool Blend Midi Skirt', price: '£45.00', imageUrl: 'https://picsum.photos/seed/bot3/400/500', url: 'https://www.marksandspencer.com', retailer: 'M&S', category: 'Bottom' },
    { id: 'bot-4', brand: 'ASOS', name: 'Relaxed Cargo Trousers', price: '£30.00', imageUrl: 'https://picsum.photos/seed/bot4/400/500', url: 'https://www.asos.com', retailer: 'ASOS', category: 'Bottom' },
  ],
  Dress: [
    { id: 'dress-1', brand: 'ASOS', name: 'Satin Slip Midi Dress', price: '£45.00', imageUrl: 'https://picsum.photos/seed/dress1/400/500', url: 'https://www.asos.com', retailer: 'ASOS', category: 'Dress' },
    { id: 'dress-2', brand: 'M&S', name: 'Wrap Waist Jersey Dress', price: '£39.50', imageUrl: 'https://picsum.photos/seed/dress2/400/500', url: 'https://www.marksandspencer.com', retailer: 'M&S', category: 'Dress' },
    { id: 'dress-3', brand: 'Boohoo', name: 'Cut-Out Detail Mini Dress', price: '£24.00', imageUrl: 'https://picsum.photos/seed/dress3/400/500', url: 'https://www.boohoo.com', retailer: 'Boohoo', category: 'Dress' },
    { id: 'dress-4', brand: 'PLT', name: 'Ruched Bodycon Midi Dress', price: '£20.00', imageUrl: 'https://picsum.photos/seed/dress4/400/500', url: 'https://www.prettylittlething.com', retailer: 'PLT', category: 'Dress' },
  ],
  Outerwear: [
    { id: 'outer-1', brand: 'ASOS', name: 'Oversized Trench Coat', price: '£85.00', imageUrl: 'https://picsum.photos/seed/outer1/400/500', url: 'https://www.asos.com', retailer: 'ASOS', category: 'Outerwear' },
    { id: 'outer-2', brand: 'PLT', name: 'Belted Longline Coat', price: '£55.00', imageUrl: 'https://picsum.photos/seed/outer2/400/500', url: 'https://www.prettylittlething.com', retailer: 'PLT', category: 'Outerwear' },
    { id: 'outer-3', brand: 'M&S', name: 'Double-Breasted Blazer', price: '£69.00', imageUrl: 'https://picsum.photos/seed/outer3/400/500', url: 'https://www.marksandspencer.com', retailer: 'M&S', category: 'Outerwear' },
    { id: 'outer-4', brand: 'Boohoo', name: 'Faux Leather Biker Jacket', price: '£36.00', imageUrl: 'https://picsum.photos/seed/outer4/400/500', url: 'https://www.boohoo.com', retailer: 'Boohoo', category: 'Outerwear' },
  ],
  Shoes: [
    { id: 'shoe-1', brand: 'M&S', name: 'Block Heel Ankle Boots', price: '£59.00', imageUrl: 'https://picsum.photos/seed/shoe1/400/500', url: 'https://www.marksandspencer.com', retailer: 'M&S', category: 'Shoes' },
    { id: 'shoe-2', brand: 'ASOS', name: 'Clean Sole Leather Trainers', price: '£40.00', imageUrl: 'https://picsum.photos/seed/shoe2/400/500', url: 'https://www.asos.com', retailer: 'ASOS', category: 'Shoes' },
    { id: 'shoe-3', brand: 'PLT', name: 'Platform Lace-Up Boots', price: '£35.00', imageUrl: 'https://picsum.photos/seed/shoe3/400/500', url: 'https://www.prettylittlething.com', retailer: 'PLT', category: 'Shoes' },
    { id: 'shoe-4', brand: 'Boohoo', name: 'Barely-There Heeled Sandals', price: '£20.00', imageUrl: 'https://picsum.photos/seed/shoe4/400/500', url: 'https://www.boohoo.com', retailer: 'Boohoo', category: 'Shoes' },
  ],
  Bag: [
    { id: 'bag-1', brand: 'M&S', name: 'Leather Structured Tote', price: '£79.00', imageUrl: 'https://picsum.photos/seed/bag1/400/500', url: 'https://www.marksandspencer.com', retailer: 'M&S', category: 'Bag' },
    { id: 'bag-2', brand: 'ASOS', name: 'Mini Quilted Crossbody', price: '£22.00', imageUrl: 'https://picsum.photos/seed/bag2/400/500', url: 'https://www.asos.com', retailer: 'ASOS', category: 'Bag' },
    { id: 'bag-3', brand: 'PLT', name: 'Croc-Effect Chain Bag', price: '£15.00', imageUrl: 'https://picsum.photos/seed/bag3/400/500', url: 'https://www.prettylittlething.com', retailer: 'PLT', category: 'Bag' },
    { id: 'bag-4', brand: 'Boohoo', name: 'Woven Straw Bucket Bag', price: '£18.00', imageUrl: 'https://picsum.photos/seed/bag4/400/500', url: 'https://www.boohoo.com', retailer: 'Boohoo', category: 'Bag' },
  ],
  Accessory: [
    { id: 'acc-1', brand: 'M&S', name: 'Silk Twill Square Scarf', price: '£25.00', imageUrl: 'https://picsum.photos/seed/acc1/400/500', url: 'https://www.marksandspencer.com', retailer: 'M&S', category: 'Accessory' },
    { id: 'acc-2', brand: 'PLT', name: 'Chunky Curb Chain Necklace', price: '£8.00', imageUrl: 'https://picsum.photos/seed/acc2/400/500', url: 'https://www.prettylittlething.com', retailer: 'PLT', category: 'Accessory' },
    { id: 'acc-3', brand: 'ASOS', name: 'Wide Brim Fedora Hat', price: '£20.00', imageUrl: 'https://picsum.photos/seed/acc3/400/500', url: 'https://www.asos.com', retailer: 'ASOS', category: 'Accessory' },
    { id: 'acc-4', brand: 'Boohoo', name: 'Pearl Hoop Earring Set', price: '£6.00', imageUrl: 'https://picsum.photos/seed/acc4/400/500', url: 'https://www.boohoo.com', retailer: 'Boohoo', category: 'Accessory' },
  ],
}

// Inject the placeholder merchantId onto every product (real AWIN ids arrive
// with the live feed). Keeps the catalogue literals readable above.
const MOCK: Record<Category, AffiliateProduct[]> = Object.fromEntries(
  (Object.keys(MOCK_CATALOGUE) as Category[]).map(cat => [
    cat,
    MOCK_CATALOGUE[cat].map(p => ({ ...p, merchantId: MERCHANT_ID_PLACEHOLDER })),
  ]),
) as Record<Category, AffiliateProduct[]>

// ── Wardrobe-logic config ──────────────────────────────────────────────────────

// Category groups for the "You're short on" gap logic. Bags fold into
// Accessories so we surface a single accessories gap, never two. `product` is
// the catalogue key we draw recommendations from for that group.
const CATEGORY_GROUPS: { label: string; members: Category[]; product: Category }[] = [
  { label: 'Tops',        members: ['Top'],              product: 'Top' },
  { label: 'Bottoms',     members: ['Bottom'],           product: 'Bottom' },
  { label: 'Dresses',     members: ['Dress'],            product: 'Dress' },
  { label: 'Outerwear',   members: ['Outerwear'],        product: 'Outerwear' },
  { label: 'Shoes',       members: ['Shoes'],            product: 'Shoes' },
  { label: 'Accessories', members: ['Bag', 'Accessory'], product: 'Accessory' },
]

// Maps a saved outfit's occasion to the product categories that suit it.
// Keys match the OCCASIONS vocabulary used on the Outfits screen.
const OCCASION_CATEGORIES: Record<string, Category[]> = {
  Work:    ['Outerwear', 'Bottom', 'Top'],  // blazer, trousers, shirt
  Evening: ['Dress', 'Shoes'],              // going-out dress, heels
  Casual:  ['Bottom', 'Shoes', 'Top'],      // jeans, trainers, knitwear
  Travel:  ['Outerwear', 'Bag', 'Top'],     // layers, a bag, easy tops
  Sport:   ['Top', 'Shoes', 'Bottom'],      // active tops, trainers, leggings
}

/**
 * Pulls products across the given categories, interleaving them so a single row
 * shows variety rather than four of one category then four of the next.
 */
function productsFrom(categories: Category[], limit = 8): AffiliateProduct[] {
  const out: AffiliateProduct[] = []
  let i = 0
  let added = true
  while (out.length < limit && added) {
    added = false
    for (const c of categories) {
      const p = MOCK[c]?.[i]
      if (p) {
        out.push(p)
        added = true
        if (out.length >= limit) return out
      }
    }
    i++
  }
  return out
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  rationale,
  width,
  sectionType,
  onShop,
}: {
  product: AffiliateProduct
  rationale: string
  width: number
  sectionType: string
  onShop: (p: AffiliateProduct, sectionType: string) => void
}) {
  const imgHeight = Math.round((width * 4) / 3) // portrait 3:4
  return (
    <Pressable
      onPress={() => onShop(product, sectionType)}
      style={({ pressed }) => [pc.card, { width, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[pc.imageWrap, { width, height: imgHeight }]}>
        <Image source={{ uri: product.imageUrl }} style={pc.image} contentFit="cover" />
      </View>
      <View style={pc.info}>
        <Text style={pc.rationale} numberOfLines={2}>{rationale}</Text>
        <Text style={pc.brand} numberOfLines={1}>{product.brand}</Text>
        <Text style={pc.price}>{product.price}</Text>
      </View>
    </Pressable>
  )
}

const pc = StyleSheet.create({
  card: {
    backgroundColor: '#111111',
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  imageWrap: {},
  image: { width: '100%', height: '100%' },
  info: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 3,
  },
  brand: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  price: {
    color: '#8a8a8a',
    fontSize: 12,
  },
  rationale: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
})

function ProductRow({
  section,
  cardW,
  onShop,
  scrollRef,
}: {
  section: Section
  cardW: number
  onShop: (p: AffiliateProduct, sectionType: string) => void
  /** Attached only to the first visible row so the peek animation can drive it. */
  scrollRef?: RefObject<ScrollView | null>
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{section.title}</Text>
      <Text style={s.sectionSubtitle}>{section.subtitle}</Text>
      <View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.cardRow}
        >
          {section.products.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              rationale={section.rationale}
              width={cardW}
              sectionType={section.type}
              onShop={onShop}
            />
          ))}
        </ScrollView>
        {/* Right-edge fade hinting the row scrolls horizontally. expo-linear-gradient
            is not installed, so this is a non-interactive translucent overlay fallback. */}
        <View pointerEvents="none" style={s.rowFade} />
      </View>
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

type Section = {
  key: string
  /** Drives dynamic render priority: worn → gap → occasion. */
  type: 'gap' | 'occasion' | 'worn'
  title: string
  subtitle: string
  products: AffiliateProduct[]
  /** One-line wardrobe rationale shown on every card in this section. */
  rationale: string
}

type DiscoverData = {
  /** True when the user owns < 5 items — we suppress all product rows. */
  thinData: boolean
  sections: Section[]
}

export default function DiscoverScreen() {
  const router = useRouter()
  const posthog = usePostHog()
  const { width } = useWindowDimensions()
  // Show 2.5 cards per row so the half-visible third card signals scroll.
  const cardW = Math.round((width - 24 - 24) / 2.5)

  const [data, setData] = useState<DiscoverData | null>(null)
  const [loading, setLoading] = useState(true)
  const [shopProduct, setShopProduct] = useState<AffiliateProduct | null>(null)
  const firstRowRef = useRef<ScrollView>(null)

  // First-visit affordance: nudge the first row sideways once so the user learns
  // the product rows scroll horizontally, then remember we've shown it.
  useEffect(() => {
    if (!data || data.thinData || data.sections.length === 0) return
    let cancelled = false
    let springBack: ReturnType<typeof setTimeout> | undefined
    ;(async () => {
      try {
        const shown = await AsyncStorage.getItem('discover_peek_shown')
        if (shown || cancelled) return
        setTimeout(() => {
          if (cancelled) return
          firstRowRef.current?.scrollTo({ x: 80, animated: true })
          springBack = setTimeout(() => {
            firstRowRef.current?.scrollTo({ x: 0, animated: true })
          }, 500)
        }, 300)
        await AsyncStorage.setItem('discover_peek_shown', 'true')
      } catch {
        // best-effort affordance; ignore storage errors
      }
    })()
    return () => {
      cancelled = true
      if (springBack) clearTimeout(springBack)
    }
  }, [data])

  useFocusEffect(
    useCallback(() => {
      let active = true
      async function load() {
        const [{ data: itemRows }, { data: outfitRows }, { data: wearRows }] =
          await Promise.all([
            supabase.from('items').select('category'),
            supabase.from('outfits').select('occasion'),
            supabase.from('wears').select('worn_at, items!inner(category)'),
          ])

        if (!active) return

        const items = itemRows ?? []

        // Thin-data gate: with < 5 items there isn't enough signal to personalise.
        if (items.length < 5) {
          setData({ thinData: true, sections: [] })
          setLoading(false)
          return
        }

        // Item counts per (singular) category.
        const catCounts = Object.fromEntries(
          ALL_CATEGORIES.map(c => [c, 0]),
        ) as Record<Category, number>
        items.forEach(row => {
          const c = row.category as Category
          if (c in catCounts) catCounts[c]++
        })

        // Roll up into category groups.
        const groups = CATEGORY_GROUPS.map(g => ({
          ...g,
          count: g.members.reduce((n, m) => n + catCounts[m], 0),
        }))

        // Each section type is collected into its own bucket so we can render
        // them in a dynamic priority order (worn → gap → occasion) regardless of
        // the order they were computed in.
        const gapSections: Section[] = []
        const occasionSections: Section[] = []
        const wornSections: Section[] = []

        // ── Section 1: You're short on: [category] ───────────────────────────
        // Surface the group with fewest items, plus a second if it's also low
        // (within one item of the minimum). Cap at two rows.
        const ascending = [...groups].sort((a, b) => a.count - b.count)
        const mostOwned = [...groups].sort((a, b) => b.count - a.count)[0]
        const minCount = ascending[0].count
        const gapGroups = ascending
          .filter((g, i) => i === 0 || g.count <= minCount + 1)
          .slice(0, 2)
        gapGroups.forEach(g => {
          gapSections.push({
            key: `gap-${g.label}`,
            type: 'gap',
            title: `You're short on: ${g.label}`,
            subtitle: `You have ${g.count} ${g.label.toLowerCase()}, ${mostOwned.count} ${mostOwned.label.toLowerCase()}`,
            products: MOCK[g.product],
            rationale: `You own ${g.count} ${g.label.toLowerCase()}`,
          })
        })

        // ── Section 2: For your [occasion] looks ─────────────────────────────
        // Top-2 occasions across saved outfits. Hidden entirely if none yet.
        const occCounts: Record<string, number> = {}
        ;(outfitRows ?? []).forEach(row => {
          const occ = (row as { occasion: string | null }).occasion
          if (occ) occCounts[occ] = (occCounts[occ] ?? 0) + 1
        })
        const topOccasions = Object.entries(occCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
        topOccasions.forEach(([occ, n]) => {
          const products = productsFrom(OCCASION_CATEGORIES[occ] ?? [], 8)
          if (products.length === 0) return
          const label = occ.toLowerCase()
          occasionSections.push({
            key: `occasion-${occ}`,
            type: 'occasion',
            title: `For your ${label} looks`,
            subtitle: `Based on ${n} ${label} outfit${n === 1 ? '' : 's'} saved.`,
            products,
            rationale: `Great for your ${label} outfits`,
          })
        })

        // ── Section 3: You keep reaching for ─────────────────────────────────
        // Most-worn category this month that the user owns ≤ 2 of. Appears as
        // soon as the user has logged at least one wear event (highest purchase
        // intent, so it is given top render priority below).
        const wears = wearRows ?? []
        if (wears.length >= 1) {
          const now = new Date()
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
          const monthCounts = Object.fromEntries(
            ALL_CATEGORIES.map(c => [c, 0]),
          ) as Record<Category, number>
          wears.forEach(r => {
            const row = r as unknown as { worn_at: string; items: { category: string } | null }
            if (!row.items) return
            const c = row.items.category as Category
            if (!(c in monthCounts)) return
            if (new Date(row.worn_at).getTime() >= monthStart) monthCounts[c]++
          })
          const reaching = (Object.entries(monthCounts) as [Category, number][])
            .filter(([c, n]) => n > 0 && catCounts[c] <= 2)
            .sort((a, b) => b[1] - a[1])[0]
          if (reaching) {
            const [cat, n] = reaching
            const owned = catCounts[cat]
            const unit = cat === 'Shoes' ? 'pair' : 'piece'
            const unitLabel = owned === 1 ? unit : `${unit}s`
            wornSections.push({
              key: `reaching-${cat}`,
              type: 'worn',
              title: 'You keep reaching for',
              subtitle: `Worn ${n}× this month. You own ${owned} ${unitLabel}.`,
              products: MOCK[cat],
              rationale: `You only own ${owned} ${unitLabel}`,
            })
          }
        }

        // Dynamic priority: highest purchase intent first.
        //   1. "You keep reaching for"  (worn)
        //   2. "You're short on"        (gap)
        //   3. "For your {occasion}"    (occasion)
        const sections: Section[] = [...wornSections, ...gapSections, ...occasionSections]

        setData({ thinData: false, sections })
        setLoading(false)
      }
      load()
      return () => { active = false }
    }, [])
  )

  // Open the AWIN tracking flow in a cookie-preserving WebView. The awin-click
  // Edge Function builds the tracked link AND records the affiliate_clicks row
  // (attribution is broken if we open Safari directly, so we never do).
  function handleShop(product: AffiliateProduct, sectionType: string) {
    posthog.capture('discover_card_tapped', {
      section: sectionType,
      category: product.category,
      retailer: product.retailer,
    })
    setShopProduct(product)
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={{ flex: 1 }}>
        {!USE_MOCK_PRODUCTS ? (
          <ScrollView style={{ flex: 1, backgroundColor: '#0a0a0a' }} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 12 }}>
              Your personalised picks are on the way.
            </Text>
            <Text style={{ color: '#888', fontSize: 15, lineHeight: 22, marginBottom: 32 }}>
              The more you wear and save, the more targeted your recommendations. Keep building your wardrobe.
            </Text>
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/')}
              style={{
                backgroundColor: '#c8f04d',
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 24,
                alignSelf: 'flex-start',
              }}
            >
              <Text style={{ color: '#0a0a0a', fontWeight: '700', fontSize: 15 }}>
                Add items to your wardrobe →
              </Text>
            </TouchableOpacity>
            <Text style={{ color: '#444', fontSize: 12, marginTop: 48, lineHeight: 18 }}>
              We earn a small commission on purchases — it keeps WREN free.
            </Text>
          </ScrollView>
        ) : loading || !data ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
          >
            <View style={s.pageHeader}>
              <Text style={s.pageTitle}>Discover</Text>
            </View>

            {data.thinData ? (
              <View style={s.emptySection}>
                <Text style={s.emptyText}>
                  Add more items to your wardrobe to unlock personalised picks.
                </Text>
              </View>
            ) : (
              <>
                {/* Fixed affiliate disclosure — first element, seen before any
                    product can be tapped (AWIN publisher requirement). */}
                <View style={s.disclosureBar}>
                  <Text style={s.disclosureBarText}>{AFFILIATE_DISCLOSURE}</Text>
                </View>
                {data.sections.map((section, i) => (
                  <ProductRow
                    key={section.key}
                    section={section}
                    cardW={cardW}
                    onShop={handleShop}
                    scrollRef={i === 0 ? firstRowRef : undefined}
                  />
                ))}
              </>
            )}
          </ScrollView>
        )}
      </View>
      <TabBar active="discover" />

      {/* AWIN cookie-preserving shop WebView */}
      <Modal
        visible={!!shopProduct}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShopProduct(null)}
      >
        <SafeAreaView style={s.root}>
          {shopProduct && (
            <AwinWebView
              merchantId={shopProduct.merchantId}
              productUrl={shopProduct.url}
              productId={shopProduct.id}
              retailer={shopProduct.retailer}
              category={shopProduct.category}
              onClose={() => setShopProduct(null)}
            />
          )}
        </SafeAreaView>
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
  },
  scroll: { paddingBottom: 24 },
  pageHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 4,
  },
  pageTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
  },

  // Named horizontal-row section
  section: { marginTop: 28 },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 24,
  },
  sectionSubtitle: {
    color: '#5a5a5a',
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 24,
    marginTop: 3,
    marginBottom: 12,
  },
  cardRow: {
    paddingHorizontal: 24,
    paddingBottom: 4,
  },

  // Affiliate disclosure — fixed muted bar at the top of the scroll.
  disclosureBar: {
    backgroundColor: '#111111',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  disclosureBarText: {
    color: '#444444',
    fontSize: 12,
    lineHeight: 16,
  },

  // Right-edge fade on each horizontal row (LinearGradient fallback).
  rowFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
    backgroundColor: 'rgba(10,10,10,0.45)',
  },

  // Thin-data state (< 5 items)
  emptySection: {
    marginHorizontal: 24,
    marginTop: 24,
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyText: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 20,
  },
})
