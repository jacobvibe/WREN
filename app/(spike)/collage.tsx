/**
 * Spike 1: Flat-lay collage builder — standalone, no react-native-css / reanimated
 *
 * PASS criteria:
 *   ✓ 2+ transparent PNG images render without black halos
 *   ✓ Z-ordering: item B overlaps item A where they intersect
 *   ✓ Items are independently draggable (PanResponder)
 *   ✓ Canvas background shows through transparent regions
 */
import { useRef } from 'react'
import {
  View,
  Text,
  Animated,
  PanResponder,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native'
import { Image } from 'expo-image'

const CANVAS_W = 380
const CANVAS_H = 500

// Two stable transparent PNGs from Wikipedia Commons (stand-ins for Remove.bg cut-outs)
const ITEMS = [
  {
    id: 'a',
    uri: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
    label: 'Cut-out A (z=1)',
    initX: 20,
    initY: 40,
    size: 190,
    zIndex: 1,
    tint: undefined,
  },
  {
    id: 'b',
    uri: 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png',
    label: 'Cut-out B (z=2, on top)',
    initX: 140,
    initY: 170,
    size: 190,
    zIndex: 2,
    tint: undefined,
  },
]

function DraggableItem({
  uri,
  label,
  initX,
  initY,
  size,
  zIndex,
}: (typeof ITEMS)[number]) {
  const pan = useRef(new Animated.ValueXY({ x: initX, y: initY })).current
  const offset = useRef({ x: initX, y: initY })

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset(offset.current)
        pan.setValue({ x: 0, y: 0 })
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, { dx, dy }) => {
        offset.current = {
          x: offset.current.x + dx,
          y: offset.current.y + dy,
        }
        pan.flattenOffset()
      },
    })
  ).current

  return (
    <Animated.View
      style={[
        styles.item,
        { width: size, height: size, zIndex },
        { transform: pan.getTranslateTransform() },
      ]}
      {...responder.panHandlers}
    >
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
      <View style={styles.label}>
        <Text style={styles.labelText}>{label}</Text>
      </View>
    </Animated.View>
  )
}

export default function CollageSpikeScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Spike 1 — Flat-lay Collage Builder</Text>
      <Text style={styles.sub}>
        Drag items freely. Transparent regions must show the grey canvas — no black halos.
        B must overlap A where they intersect.
      </Text>

      {/* Canvas */}
      <View style={styles.canvas}>
        {ITEMS.map((item) => (
          <DraggableItem key={item.id} {...item} />
        ))}
      </View>

      {/* Pass criteria checklist */}
      <View style={styles.criteria}>
        <Text style={styles.criteriaTitle}>PASS criteria</Text>
        {[
          'Cut-out A renders (no black halo around edges)',
          'Cut-out B renders on top of A (correct z-order)',
          'Both items drag independently',
          'Canvas grey shows through transparent image regions',
        ].map((c) => (
          <Text key={c} style={styles.criteriaItem}>
            ☐ {c}
          </Text>
        ))}
        <Text style={[styles.criteriaItem, { marginTop: 8, fontStyle: 'italic' }]}>
          Note: production cut-outs come from Remove.bg (Spike 2).{'\n'}
          These are Wikipedia transparent PNGs for architecture validation only.
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  heading: { fontSize: 17, fontWeight: '700', color: '#000' },
  sub: { fontSize: 13, color: '#555', lineHeight: 18 },
  canvas: {
    width: CANVAS_W,
    height: CANVAS_H,
    alignSelf: 'center',
    backgroundColor: '#d0d0d0',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbb',
    overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
    position: 'relative',
  },
  item: {
    position: 'absolute',
  },
  label: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: { color: '#fff', fontSize: 10 },
  criteria: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  criteriaTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4 },
  criteriaItem: { fontSize: 12, color: '#333', lineHeight: 18 },
})
