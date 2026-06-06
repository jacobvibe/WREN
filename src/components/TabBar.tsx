import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '../tw'

const ACCENT = '#c8f04d'
export const TAB_BAR_HEIGHT = 60

export type ActiveTab = 'wardrobe' | 'discover' | 'outfits' | 'settings'

const ICONS: Record<ActiveTab, { active: string; inactive: string }> = {
  wardrobe: { active: '⊞', inactive: '⊟' },
  discover: { active: '⊛', inactive: '⊙' },
  outfits:  { active: '◧', inactive: '◻' },
  settings: { active: '⚙', inactive: '⚙' },
}

const LABELS: Record<ActiveTab, string> = {
  wardrobe: 'Wardrobe',
  discover: 'Discover',
  outfits:  'Outfits',
  settings: 'Settings',
}

export function TabBar({ active }: { active: ActiveTab }) {
  const router = useRouter()

  function go(tab: ActiveTab) {
    if (tab === active) return
    if (tab === 'wardrobe') router.replace('/(tabs)/')
    else if (tab === 'discover') router.replace('/(tabs)/discover')
    else if (tab === 'outfits') router.replace('/(tabs)/outfits')
    else router.replace('/(tabs)/settings')
  }

  return (
    <View style={s.bar}>
      {(['wardrobe', 'discover', 'outfits', 'settings'] as ActiveTab[]).map(tab => {
        const isActive = tab === active
        return (
          <Pressable
            key={tab}
            onPress={() => go(tab)}
            style={({ pressed }) => [s.tab, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[s.icon, isActive && s.iconActive]}>
              {isActive ? ICONS[tab].active : ICONS[tab].inactive}
            </Text>
            <Text style={[s.label, isActive && s.labelActive]}>
              {LABELS[tab]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: TAB_BAR_HEIGHT,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 4,
  },
  icon: {
    color: '#444444',
    fontSize: 22,
    lineHeight: 26,
  },
  iconActive: {
    color: ACCENT,
  },
  label: {
    color: '#444444',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  labelActive: {
    color: ACCENT,
  },
})
