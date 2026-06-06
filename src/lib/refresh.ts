// Tiny cross-screen invalidation flags so focus-based refetches stay fresh after
// mutations without refetching on EVERY tab switch (see useFocusEffect staleness
// checks in the Closet / Outfits screens).
//
// A screen refetches when EITHER its data is older than the staleness window OR a
// mutation elsewhere has flagged it dirty. `consumeStale` reads-and-clears.

type Key = 'closet' | 'outfits'

const dirty: Record<Key, boolean> = { closet: false, outfits: false }

/** Flag data as needing a refetch. Omit `key` to flag everything. */
export function markStale(key?: Key) {
  if (key) dirty[key] = true
  else { dirty.closet = true; dirty.outfits = true }
}

/** Returns whether `key` was dirty, clearing the flag. */
export function consumeStale(key: Key): boolean {
  const was = dirty[key]
  dirty[key] = false
  return was
}

export const STALE_MS = 30_000
