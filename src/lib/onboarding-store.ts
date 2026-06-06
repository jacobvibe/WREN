import * as Crypto from 'expo-crypto'

// Module-level store for the linear onboarding flow.
// Avoids URL-param limitations for large data (cutout data URIs can be several MB).
//
// `sessionToken` is a per-onboarding-session random UUID. It is stamped on every
// item inserted during onboarding and used by the claim-onboarding-items Edge
// Function to reassign exactly this session's items to the new account — never
// another user's. This closes the race where two simultaneous sign-ups could
// claim each other's pre-auth items.
//
// Reset between onboarding sessions by calling reset().
export const onboardingStore = {
  cutoutUri: '',
  // Pre-filled item name (e.g. og:title from a pasted product link).
  prefillName: '',
  sessionToken: Crypto.randomUUID(),
  // The anonymous-auth user id under which onboarding items are created, captured
  // before OAuth sign-in so the claim function knows which rows to reassign.
  anonUserId: '' as string,
  reset() {
    this.cutoutUri = ''
    this.prefillName = ''
    this.sessionToken = Crypto.randomUUID()
    this.anonUserId = ''
  },
}
