# WREN — Audit, Repair & Hardening Report

_Single-session audit performed against the 10-phase mandate. All fixes applied in-tree._

## Summary

Before this pass, WREN was a feature-rich but unshippable build: two AI Edge Functions
were callable with only the anon key (drainable paid credits), the `items` table had an
anonymous-insert policy that bypassed the item cap, item cut-outs were stored as multi-MB
data URIs in Postgres, the affiliate/Discover flow opened Safari and never set AWIN cookies
(so revenue attribution was broken), the combinations formula was wrong and duplicated in
three places, and several spec-required, App-Store-blocking features were missing (in-app
account deletion, the forced "build your first outfit" gate, search/filter, item/outfit
editing, URL-paste entry). Onboarding was also **non-functional**: it runs pre-auth, yet
the AI functions already required a JWT, and the only entry route sent new users to sign-in,
not onboarding.

After this pass the app is internally consistent and submission-ready pending the external
actions listed below: every AI/affiliate/delete Edge Function authenticates the caller, the
cap-bypass hole is closed, cut-outs live in a **private** Storage bucket served via signed
URLs, the canonical combinations formula lives in one shared utility, Discover routes through
the cookie-preserving AWIN WebView with the legally-required disclosure on every card, and the
missing features are built. `npx tsc --noEmit` passes with **zero errors**.

### Central architectural decision — anonymous auth for onboarding

The audit's own security requirements (auth on `remove-bg`/`vision-tag`, drop `anon_insert`)
are **incompatible** with a no-JWT pre-auth onboarding flow. The only coherent resolution is
**Supabase anonymous sign-in**: onboarding now signs the user in anonymously
(`ensureAnonSession`), so the AI functions and RLS see a real (anonymous) user, while the bare
anon *key* — the actual abuse vector — still cannot call them. Onboarding items are created
under the anonymous user and **reassigned to the permanent account on sign-in** by
`claim-onboarding-items`, matched on the anonymous user id **and** a random per-session
`session_token` (this also fixes the race the audit flagged). This supersedes the
`onboarding-placeholder` literal, which only existed to support the insecure model and would
re-open the cap-bypass hole if kept. **Requires enabling Anonymous sign-ins in the Supabase
dashboard** (see Cannot-fix).

---

## 1. Critical fixes — security, data integrity, revenue

### Security (Phase 1)
- **`.env` not gitignored** → added `.env` (+ `!.env.example`) to `.gitignore` with a security
  warning header. **Correction to the audit premise:** the repo has **0 commits** and `.env`
  was never tracked, so there is **no git-history exposure**. Key rotation is only necessary if
  `.env` was shared by another channel. Files: `.gitignore`, `.env.example`.
- **`remove-bg` had no auth** → added JWT verification (`anonClient.auth.getUser()`, 401 on
  failure) before any processing. `supabase/functions/remove-bg/index.ts`.
- **`awin-click` had no auth** → same JWT guard added. `supabase/functions/awin-click/index.ts`.
- **`anon_insert_onboarding` RLS hole** → new migration drops it; TODO comment removed from the
  original migration. Closing this also makes the cap-bypass unreachable (RLS `users_insert_own`
  makes `auth.uid() = 'onboarding-placeholder'` impossible). `…20260606000001_drop_anon_insert_policy.sql`,
  `…20260604000001_create_items.sql`.
- **`claim-onboarding-items` race** → rewritten to reassign only rows matching
  `user_id = <anon id> AND session_token = <token>`. Added `session_token` column + client
  plumbing (`onboarding-store.ts`, `tag-item.tsx`, `success.tsx`).
- **Secret scan** → no hardcoded production secrets in source; only env-var references and a
  `__DEV__`-gated dev-login password (`sign-in.tsx:92`).

### Data integrity (Phase 2)
- **Combinations formula wrong & duplicated** → single source of truth
  `src/lib/combinations.ts` (`(tops × bottoms × max(shoes,1)) + dresses`), imported by onboarding,
  the Closet header and `CombinationsCounter`. Added a **shoes** stepper to onboarding and a
  shoes count to the Closet.
- **Cut-outs stored as data URIs** → permanent-user items now upload to the private `items`
  Storage bucket (`uploadItemImage`) and store the object **path**; rendered via signed URLs
  (`RemoteImage` + `getDisplayUri`). Graceful fallback to the data URI on upload failure.
  Onboarding's single first item intentionally stays a data URI (its anon-folder Storage object
  would be unreadable after the claim reassigns ownership).
- **Bucket privacy** → `…20260606000003_create_items_storage_bucket.sql` creates a **private**
  bucket with owner-only `storage.objects` policies (`(storage.foldername(name))[1] = auth.uid()`).
- **Outfit save had no rollback** → `outfits.tsx saveOutfit` now deletes the orphan outfit and
  alerts if the `outfit_items` insert fails.
- **Item delete left silent dangling outfits** → `item/[id].tsx` warns "appears in N outfit(s)…",
  lets the user cancel, and deletes any outfit left empty afterwards.
- **`wears` had no delete policy** → `…20260606000004_wears_delete_policy.sql`.
- **`affiliate_clicks` schema vs usage** → added `merchant_id`
  (`…20260606000006_affiliate_clicks_merchant_id.sql`); the corrected flow inserts
  `user_id, product_id, retailer, category, merchant_id` — all present.
- **`profiles.updated_at` never updated** → push-token upsert now sets `updated_at`
  (`src/lib/push.ts`).
- **Full RLS audit** → all tables verified. `affiliate_clicks` is insert-only (no select),
  `waitlist_signups` is anon-insert/service-read only — both correct. Only gap was `wears` delete
  (fixed).

### Revenue (Phase 3)
- **Discover bypassed AWIN** → `handleShop` now opens `AwinWebView` (cookie-preserving) which
  calls `awin-click`; Safari `Linking.openURL` and the premature client insert removed. The
  `affiliate_clicks` row is written **server-side** in `awin-click` after the tracked click.
- **`AwinWebView` mount bug** → `useState(() => openLink())` → `useEffect(() => openLink(), [openLink])`.
- **Mock products shipped to prod** → gated behind `USE_MOCK_PRODUCTS = __DEV__`; production shows
  a "Coming soon" empty state; `// TODO: REMOVE BEFORE PRODUCTION` added; every product carries a
  placeholder `merchantId: '0'`.
- **Affiliate disclosure** → exact required text rendered on **every** product card.

---

## 2. Feature additions (Phases 4 & 5)

- **Forced first-outfit gate** — `app/onboarding/build-first-outfit.tsx` (new): selectable grid,
  "Save this look →" enabled at 2+ items, fires `first_outfit_saved` + push opt-in, 1.5s
  celebration, then `/(tabs)/`. No back gesture. `success.tsx` routes here after sign-in.
- **Mandatory add-item step** — onboarding screens have `gestureEnabled:false` and no back/skip
  affordance.
- **Honest success copy** — "One item in." / "Sign in to save your wardrobe — takes 10 seconds."
- **Google sign-in error handling** — config-error → "use Apple Sign In" alert in both
  `success.tsx` and `(auth)/sign-in.tsx`; cancellations ignored; logs `__DEV__`-gated.
- **Settings + account deletion** — `app/(tabs)/settings.tsx` (new): two-step delete confirm →
  `delete-account` Edge Function (new) erases Storage files, all DB rows in dependency order, then
  `auth.admin.deleteUser`. Sign-out moved here from the Closet header; Settings tab registered in
  `TabBar`.
- **Closet search + category pills** — client-side, composing; clear (×) button.
- **Outfit occasion filter pills** — All/Casual/Work/Evening/Sport/Travel.
- **Item editing** — name + category sheet in `item/[id].tsx`.
- **Outfit editing** — pre-populated select+name+occasion modal in `outfits/[id].tsx`; save updates
  the row and replaces `outfit_items`; confirms before overwrite.
- **URL-paste entry** — "Paste a link" in `add-first-item.tsx` → `fetch-product` Edge Function
  (new): OpenGraph scrape + Remove.bg background removal; pre-fills item name.
- **Gap hint** — `gapHint()` shows "Add a {category} to unlock N more combinations" under the
  compact counter.

---

## 3. Quality fixes (Phases 6–8)

- **Push (6):** nudge-tracking columns + cron rescheduled to dedupe and gate day-7 on day-3
  (`…20260606000005`); `send-push` parses the Expo receipt and nulls the token on
  `DeviceNotRegistered`, and stamps `nudge_dayN_sent_at` on success.
- **Performance (7):** focus-refetch staleness (30s) + cross-screen invalidation (`src/lib/refresh.ts`)
  wired into Closet/Outfits and all mutation sites; FAB clearance uses `TAB_BAR_HEIGHT + 80`;
  `ErrorBoundary` wraps the root `<Slot/>`. Wear-count logic confirmed correct (no change needed).
- **TypeScript (8):** `npx tsc --noEmit` → **0 errors**.
- **RouteGuard (8.3):** authenticated users go straight to `/(tabs)/` (no `(app)` double-redirect);
  the stale `app/(app)/` group was deleted (no references remained); anonymous users are kept in the
  onboarding funnel and freshly signed-in users are not bounced out of `build-first-outfit`.
- **Metro stub (8.5):** documented as load-bearing (Windows `react-native-css` resolver fix).
- **console (8.6):** all client `console.*` are `__DEV__`-gated.

---

## 4. Cannot-fix — requires action outside this codebase

| # | Action | Where |
|---|--------|-------|
| 1 | **Enable "Anonymous sign-ins"** | Supabase → Authentication → Providers → Anonymous. **Required** or onboarding cannot create an anon session. |
| 2 | Set real Google OAuth web client id `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Cloud Console → Credentials. Currently a placeholder (Google Sign In fails on device; Apple works). |
| 3 | Set `iosUrlScheme` reversed client id + provide `google-services.json` | `app.json` plugin config currently has `REPLACE_WITH_REVERSED_CLIENT_ID`. |
| 4 | Set Edge Function secrets | `supabase secrets set REMOVE_BG_API_KEY=… GOOGLE_VISION_CREDENTIALS=… AWIN_PUBLISHER_ID=…` |
| 5 | (If `.env` was ever shared off-repo) rotate Remove.bg key + GCP service-account key | remove.bg dashboard / GCP IAM. _No git-history exposure was found in this repo (0 commits)._ |
| 6 | Set real AWIN merchant IDs (replace `merchantId: '0'`) once publisher account approved | `app/(tabs)/discover.tsx` + live feed. |
| 7 | Set cron DB settings | `alter database postgres set app.settings.supabase_url=…` / `…service_role_key=…` |
| 8 | Add EAS project id for push tokens | `app.json → expo.extra.eas.projectId` (needed by `getExpoPushTokenAsync`). |
| 9 | Enable GCP billing for Vision | project `sincere-destiny-498415-q7` (per SPIKE_RESULTS). |
| 10 | Review dependency version mismatches before release | `npx expo install --check` — `react-native-gesture-handler@3.0.0` (major), `reanimated@4.4.1`, `react-native-worklets@0.9.1`, `react@19.2.7` were intentionally upgraded (see project memory); validate on a real build. |
| 11 | expo-doctor "Metro config" check failure | **False positive** — the vestigial `tailwindcss@3` devDependency's legacy `load-config` looks for a `tailwind.config.js`, but the project uses **Tailwind v4 CSS config** (`@theme` in `global.css`). Do **not** add a JS config. Optionally remove `tailwindcss@3` from devDependencies after verifying the bundler. |

---

## 5. Migrations to run (in Supabase SQL Editor, in this order)

1. `20260606000001_drop_anon_insert_policy.sql` — removes the anonymous-insert hole on `items`.
2. `20260606000002_add_session_token_to_items.sql` — adds `items.session_token` for race-safe claim.
3. `20260606000003_create_items_storage_bucket.sql` — private `items` bucket + owner-only Storage RLS.
4. `20260606000004_wears_delete_policy.sql` — lets users delete their own wear logs.
5. `20260606000005_profiles_nudge_tracking.sql` — nudge sent-at columns; reschedules day-3/day-7 cron.
6. `20260606000006_affiliate_clicks_merchant_id.sql` — adds `affiliate_clicks.merchant_id`.

**Edge Functions to deploy:** `remove-bg` (auth added), `awin-click` (auth + click insert),
`claim-onboarding-items` (rewritten), `send-push` (receipt + nudge handling), **`delete-account`**
(new), **`fetch-product`** (new). `vision-tag` unchanged.

---

## 6. Verification checklist (manual, on a real device)

- [ ] Fresh install → lands on sign-in → "Set up your wardrobe" → onboarding steppers (incl. shoes).
- [ ] Add item via **camera**, **library**, and **paste a link** (OG image + name prefill).
- [ ] Vision tagging + Remove.bg succeed for an anonymous user (anon sign-in enabled).
- [ ] Apple sign-in → onboarding items appear in the Closet (claim worked) → **build-first-outfit**
      cannot be skipped/back-swiped → save → celebration → tabs.
- [ ] Misconfigured Google sign-in shows the "use Apple Sign In" alert (no crash).
- [ ] New in-app item uploads to private Storage and renders via signed URL; image not in the DB row.
- [ ] Closet search + category pills compose; Outfits occasion filter works; item edit; outfit edit.
- [ ] Discover (dev) opens the AWIN WebView; disclosure visible on every card; production build shows
      "Coming soon".
- [ ] Push pre-prompt appears once after the first outfit; deny path is silent.
- [ ] **Delete account** removes wardrobe, outfits, Storage files, and the auth record; cannot sign
      back into old data.
- [ ] Force a render error → ErrorBoundary screen + Reload recovers.

---

## 7. Notes / known limitations
- A delete-UI for individual `wears` entries is not built (the audit only required the RLS policy,
  now in place).
- The legacy `supabase/functions/tag-clothing` function is **superseded by `vision-tag`** (which the
  client actually invokes) and is unused — left in place; safe to remove.
- Accessibility labels were added to the primary FABs; a fuller pass over icon-only buttons
  (back arrows, ×, ✎) is recommended.
