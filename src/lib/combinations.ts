// Canonical outfit-combinations formula for WREN.
//
//   combinations = (tops × bottoms × max(shoes, 1)) + dresses
//
// - tops × bottoms × shoes: every top/bottom/shoe triple is a distinct outfit.
// - max(shoes, 1): a user with no shoes still gets credit for top×bottom pairs.
// - dresses: standalone outfits, added (not multiplied).
//
// This MUST be the single source of truth — imported by onboarding, the Closet
// header, and the CombinationsCounter component. Never inline the formula.

export type WardrobeCounts = {
  tops: number
  bottoms: number
  shoes: number
  dresses: number
}

// For the live wardrobe counter (adds visible payoff when the first shoe is
// added — with shoes:0 the top×bottom pairs contribute nothing, so adding a
// shoe is what lights the number up).
export function combinationsLive({ tops, bottoms, shoes, dresses }: WardrobeCounts): number {
  if (tops === 0 || bottoms === 0) return dresses
  return tops * bottoms * Math.max(shoes, 0) + dresses
}

// For the onboarding stepper (assumes the user always owns at least one pair of
// shoes, so top×bottom pairs always count).
export function combinationsOnboarding({ tops, bottoms, shoes, dresses }: WardrobeCounts): number {
  return tops * bottoms * Math.max(shoes, 1) + dresses
}

// Default export points at the onboarding variant for backward compatibility.
export function combinations(counts: WardrobeCounts): number {
  return combinationsOnboarding(counts)
}

/**
 * Returns a one-line hint nudging the user toward the category that, with one
 * more item, unlocks the most additional combinations — or null if no single
 * addition helps (e.g. an empty wardrobe). Used under the Closet header.
 *
 * Uses the live formula so the hint's deltas stay consistent with the displayed
 * (live) counter.
 */
export function gapHint(counts: WardrobeCounts): string | null {
  const base = combinationsLive(counts)
  const candidates: { key: keyof WardrobeCounts; label: string }[] = [
    { key: 'tops', label: 'top' },
    { key: 'bottoms', label: 'bottom' },
    { key: 'shoes', label: 'pair of shoes' },
  ]

  let best: { label: string; delta: number } | null = null
  for (const { key, label } of candidates) {
    const delta = combinationsLive({ ...counts, [key]: counts[key] + 1 }) - base
    if (delta > 0 && (!best || delta > best.delta)) best = { label, delta }
  }

  if (!best) return null
  return `Add a ${best.label} to unlock ${best.delta.toLocaleString()} more combination${best.delta === 1 ? '' : 's'}.`
}
