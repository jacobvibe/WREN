# WREN — Application Record

A factual record of the WREN app exactly as it is built today, derived entirely from
reading the source. This document describes what exists; it does not evaluate or
recommend. Where the code is ambiguous, that is stated explicitly rather than guessed.

---

## 1. What the app is

WREN is a personal-wardrobe mobile app (Expo / React Native, iOS-first with Android
and a web fallback) for people who want to get more out of the clothes they already
own. A user photographs each clothing item (the background is automatically removed and
the item is auto-tagged), builds and saves outfits from those items, logs when they wear
things to track cost-per-wear, and is shown a running count of how many outfit
"combinations" their wardrobe can produce. A Discover tab surfaces affiliate shopping
recommendations aimed at the gaps in their wardrobe. The one-sentence promise, taken
from the onboarding screen, is: **"You already own N outfits"** — WREN shows you the
value already hanging in your closet and helps you wear and extend it.

---

## 2. Tech stack

Versions are exactly as pinned in `package.json`.

### Framework / runtime
- **expo** `~56.0.8` — app framework and build tooling.
- **expo-router** `~56.2.8` — file-based navigation (the app's real entry is
  `expo-router/entry`, set as `main` in package.json).
- **react** `^19.2.7`, **react-dom** `^19.2.7`, **react-native** `0.85.3`.
- **react-native-web** `^0.21.2` — web target.
- **expo-dev-client** `^56.0.18`, **expo-constants** `~56.0.16`,
  **expo-status-bar** `~56.0.4`, **expo-linking** `~56.0.13`.

### Backend / data
- **@supabase/supabase-js** `^2.107.0` — the single backend. Postgres (with RLS),
  Auth, Storage, and Edge Functions. Configured in `src/lib/supabase.ts`.

### Auth
- **@react-native-google-signin/google-signin** `^16.1.2` — native Google Sign-In
  (ID-token flow into Supabase).
- **expo-apple-authentication** `~56.0.4` — Apple Sign-In (ID-token flow).
- **expo-secure-store** `~56.0.4** — secure persistence of the Supabase session on
  native (AsyncStorage is used on web).
- **@react-native-async-storage/async-storage** `^2.2.0` — web session storage.
- **expo-crypto** `~56.0.4` — `randomUUID()` for item ids and onboarding session tokens.

### Storage / images
- **expo-image** `^56.0.9` — image rendering.
- **expo-image-picker** `~56.0.15` — camera / library capture for items.
- Supabase **Storage** (private `items` bucket) holds cut-out PNGs; the app fetches
  short-lived signed URLs.

### Notifications
- **expo-notifications** `~56.0.15` — push permission + Expo push token; delivery via
  Expo's push service from the `send-push` Edge Function.

### Affiliate / web
- **react-native-webview** `^13.16.1` — cookie-preserving WebView for the AWIN
  affiliate redirect flow.
- **expo-web-browser** `~56.0.5` — listed as an Expo plugin (config in app.json).

### Styling
- **nativewind** `^4.2.5`, **react-native-css** `^3.0.7`,
  **react-native-css-interop** `^0.2.5`, **tailwindcss** `^3.4.0`,
  **@tailwindcss/postcss** `^4.3.0`, **clsx** `^2.1.1`, **tailwind-merge** `^3.6.0`.
  Tailwind class names are supported through a custom wrapper in `src/tw/` (with a
  separate `index.web.tsx` shim). Most screens use `StyleSheet.create` with Tailwind
  used on the auth and a few onboarding screens.

### Animation / gestures
- **react-native-reanimated** `^4.4.1`, **react-native-worklets** `^0.9.1`,
  **react-native-gesture-handler** `^3.0.0` — used for the animated combinations
  counters.
- **react-native-safe-area-context** `~5.7.0`, **react-native-screens** `4.25.2`.

### Dev / tooling
- **typescript** `~6.0.3`, **@types/react** `~19.2.2`, **dotenv** `^17.4.2`,
  **playwright** `^1.60.0`, **@expo/ngrok** `^4.1.3`.
- `resolutions.lightningcss` pinned to `1.30.1`.

### Analytics
- No dedicated analytics SDK is wired into the app. The only first-party "analytics"
  is the `affiliate_clicks` table (write-only) and the `milestones` table.

### Edge Function third-party services (server-side only)
- **Remove.bg** (`REMOVE_BG_API_KEY`) — background removal.
- **Google Cloud Vision** (`GOOGLE_VISION_CREDENTIALS` service account / spike
  `GOOGLE_VISION_API_KEY`) — clothing label detection.
- **AWIN** (`AWIN_PUBLISHER_ID`) — affiliate link tracking.

---

## 3. Navigation structure

The app uses Expo Router file groups. There is **no native tab bar**: the `(tabs)`
group is a plain `Stack` (`app/(tabs)/_layout.tsx` → `<Stack screenOptions={{
headerShown: false }} />`). Movement between the four "tabs" is done by a **custom
`TabBar` component** (`src/components/TabBar.tsx`) rendered at the bottom of each
main screen, which calls `router.replace(...)`.

### Root (`app/_layout.tsx`)
Wraps the whole app in `ErrorBoundary` → `SessionProvider` → `RouteGuard` → `<Slot/>`.
`RouteGuard` redirects based on auth state (see §6).

### Route groups
- **`(auth)`** — `sign-in.tsx` (+ `_layout.tsx`, a `Stack`).
- **`onboarding`** — `index`, `add-first-item`, `tag-item`, `success`,
  `build-first-outfit` (+ `_layout.tsx`, a `Stack`; the four post-intro steps have
  `gestureEnabled: false`).
- **`(tabs)`** — the main app:
  - `index.tsx` → **Wardrobe** (the `/(tabs)/` route)
  - `discover.tsx` → **Discover**
  - `outfits.tsx` → **Outfits**
  - `settings.tsx` → **Settings**
  - `item/[id].tsx` → **Item detail** (pushed)
  - `outfits/[id].tsx` → **Outfit detail** (pushed)
- **`(spike)`** — developer reference screens (`index`, `collage`); always accessible,
  bypass the route guard. `_layout.tsx` is a `Stack` with headers shown.

### TabBar
Tabs: `wardrobe`, `discover`, `outfits`, `settings`, each with an active/inactive
glyph and label. Tapping a non-active tab `router.replace`s to that route; tapping the
active tab is a no-op. `TAB_BAR_HEIGHT = 60`.

### Modals / overlays (rendered with `<Modal>`)
- **Outfits** create flow (full-screen pageSheet, two steps: select items → name &
  occasion).
- **Discover** AWIN shopping WebView (full-screen pageSheet).
- **Item detail** Android price entry sheet (transparent bottom sheet) and the
  edit name/category sheet.
- **Outfit detail** edit modal (pageSheet) for renaming, re-tagging occasion, and
  changing the item set.

### Unused boilerplate
`App.tsx` and `index.ts` are the default Expo template files and are not the app entry
(`main` is `expo-router/entry`). They render "Open up App.tsx…" and are not reachable.

---

## 4. Screen-by-screen description

### 4.1 Root layout & route guard
**File:** `app/_layout.tsx`
- **Shows:** nothing of its own; renders the matched route via `<Slot/>`. Returns
  `null` while the session is loading.
- **Logic (`RouteGuard`):** reads `{ session, loading }` from `useSession()` and the
  current route group from `useSegments()`.
  - Spike group → always allowed, no redirect.
  - Permanent (non-anonymous) session → if currently in `(auth)`, replace to
    `/(tabs)/`; otherwise no redirect (notably does **not** force users out of
    onboarding, because a freshly signed-in user runs
    `onboarding/build-first-outfit`).
  - Anonymous session → if not in the `onboarding` group, replace to `/onboarding`
    (keeps mid-onboarding users in the funnel).
  - No session → if not in `(auth)` or `onboarding`, replace to `/(auth)/sign-in`.

### 4.2 Sign-in
**File:** `app/(auth)/sign-in.tsx`
- **What it shows:** On web, a magic-link form (`WebSignIn`): "Wren / Sign in to
  continue", an email field, "Send magic link" button, and (in `__DEV__`) a "⚡ Skip
  sign in (dev)" button. After sending: a "Check your email" confirmation. On native:
  "Wren / Sign in to continue", an Apple Sign-In button (iOS only), a "Continue with
  Google" button, and a "New to WREN? Set up your wardrobe →" link.
- **User actions:**
  - Web: enter email → `supabase.auth.signInWithOtp({ email, options:{
    shouldCreateUser: true } })`. Dev button → `signInWithPassword` with hardcoded
    `dev@wren.local` / `devpassword123`.
  - iOS: Apple button → `AppleAuthentication.signInAsync` (FULL_NAME, EMAIL scopes) →
    `supabase.auth.signInWithIdToken({ provider:'apple', token })`; if a name is
    returned, `updateUser({ data:{ full_name } })`.
  - Google button → `GoogleSignin.hasPlayServices()` → `GoogleSignin.signIn()` →
    `signInWithIdToken({ provider:'google', token })`. Config errors map to a "use
    Apple Sign In" message.
  - "Set up your wardrobe" link → `router.push('/onboarding')`.
- **Data read/written:** auth only (no table reads). `GoogleSignin.configure` uses
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
- **Business logic:** cancellation codes (`ERR_REQUEST_CANCELED`, `SIGN_IN_CANCELLED`,
  `-5`) are swallowed silently.

### 4.3 Onboarding — wardrobe count intro
**File:** `app/onboarding/index.tsx`
- **What it shows:** "What's in your wardrobe?" with four steppers (TOPS, BOTTOMS,
  SHOES, DRESSES, range 0–99). Once any combination is non-zero, an animated big number
  appears: "You already own {N} outfits." and a "Continue" button.
- **User actions:** +/- steppers adjust counts; "Continue" → `router.push('/onboarding/
  add-first-item')`.
- **Logic:** On mount, `onboardingStore.reset()` and `ensureAnonSession()` (signs the
  user in anonymously so the AI functions and item inserts work pre-OAuth). The number
  is `combinations({tops,bottoms,shoes,dresses})` (see §11), animated via Reanimated.
  No data is read or written to tables here; the counts are local only.

### 4.4 Onboarding — add first item
**File:** `app/onboarding/add-first-item.tsx`
- **What it shows:** Four UI states:
  - **idle:** "Add your first item" + buttons "Take Photo", "Choose from Library",
    "Paste a link".
  - **link mode:** "Paste a product link" with a URL input and "Fetch item".
  - **preview/processing:** the chosen photo with a "Removing background…" overlay
    when processing, plus "Use this photo" / "Retake".
  - **result:** the cut-out on a light background, "Background removed ✓", "Looks
    good" / "Try again".
- **User actions & writes:**
  - Camera/Library use `expo-image-picker` with `{ mediaTypes:'images', allowsEditing,
    aspect:[3,4], quality:0.8, base64:true }`.
  - "Use this photo" (`processImage`): if a session exists, counts the user's items
    (`items` count, head, `user_id` filter); if `>= 150`, shows the "Wardrobe full"
    alert. Otherwise invokes the **`remove-bg`** Edge Function with `{ imageBase64 }`;
    on success sets `step=result` with the returned `data.cutout` data URI.
  - "Paste a link" (`fetchFromLink`): validates `https?://`, invokes **`fetch-product`**
    with `{ url }`. On success stores `onboardingStore.cutoutUri = data.cutout` and
    `prefillName = data.title`, then `router.push('/onboarding/tag-item')`. An
    `item_cap_reached` error maps to the cap message.
  - "Looks good" stores `onboardingStore.cutoutUri = step.cutout` and pushes to
    `tag-item`.
- **Data read:** `items` count (cap check). **Edge Functions:** `remove-bg`,
  `fetch-product`. No direct DB writes here (the item row is written on the next
  screen).

### 4.5 Onboarding — tag item
**File:** `app/onboarding/tag-item.tsx`
- **What it shows:** "Tag this item" with a thumbnail of the cut-out, a TAGS section
  (chips), a CATEGORY pill row (`Top, Bottom, Dress, Outerwear, Shoes, Bag,
  Accessory`), an optional NAME field, and a fixed "Save item" button. Tag area shows
  loading ("Identifying clothing…"), error (+ Retry), or an empty-state message.
- **User actions:**
  - On mount, calls **`vision-tag`** with the base64 (data-URI prefix stripped). The
    returned `tags` are all pre-selected; the returned `suggestedCategory` (if in the
    category list) is pre-selected.
  - Tap chips to toggle tags; tap a category; edit name; "Retry" re-runs vision.
  - "Save item" (`saveItem`): requires a category and an active session.
- **Data written (`items` insert):** generates an `itemId` via `Crypto.randomUUID()`.
  If the user is **not** anonymous, uploads the cut-out to Storage
  (`uploadItemImage`) and uses the returned object path as `image_url`; if anonymous
  (onboarding), keeps the data URI as `image_url`. Inserts `{ id, user_id, image_url,
  category, tags, name|null, session_token: isOnboarding ? onboardingStore.sessionToken
  : null }`. Then `markStale('closet')`, clears the store. If onboarding, stores
  `onboardingStore.anonUserId = session.user.id` and pushes to `/onboarding/success`;
  otherwise (item added by a permanent user via this screen) `router.replace('/
  (tabs)/')`.
- **Business logic:** Save is enabled when a category is chosen and either ≥1 tag is
  selected, or no tags were available, or vision errored. The reason onboarding items
  stay as data URIs is documented in-code: the anonymous user's Storage object would be
  unreadable after the item is reassigned to the permanent account.

### 4.6 Onboarding — success / sign-in
**File:** `app/onboarding/success.tsx`
- **What it shows:** "✓ One item in." / "Sign in to save your wardrobe — takes 10
  seconds." with an Apple Sign-Up button (iOS) and "Continue with Google".
- **User actions:** Apple / Google sign-in. Before sign-in, captures the current
  anonymous user id into `onboardingStore.anonUserId`. After a successful
  `signInWithIdToken`, runs `claimAndNavigate()`.
- **`claimAndNavigate`:** if both `anonUserId` and `sessionToken` exist, invokes
  **`claim-onboarding-items`** with `{ fromUserId, sessionToken }`, then
  `onboardingStore.reset()` and `router.replace('/onboarding/build-first-outfit')`.
- **Data written:** Apple path may `updateUser({ data:{ full_name }})`. The claim
  function reassigns the onboarding items (see §5/§7).

### 4.7 Onboarding — build first outfit
**File:** `app/onboarding/build-first-outfit.tsx`
- **What it shows:** "Build your first look." / "Pick any two or more pieces. Trust
  us." a NAME field (default "My First Look"), a 2-column grid of the user's items with
  selection check badges, a selected-count line, and "Save this look →". On save, a
  celebratory "Your first look is saved ✓" then auto-navigates.
- **User actions:** toggle item selection; edit name; "Save this look".
- **Mandatory step:** no back gesture, no header (the funnel can't be skipped).
- **`saveLook`:** requires session, `selectedIds.size >= 2`, and a name. Inserts an
  `outfits` row `{ user_id, name, occasion:null }`, then inserts `outfit_items` join
  rows. If the join insert fails, the orphan outfit is deleted. Fire-and-forget:
  inserts a `milestones` row `{ milestone:'first_outfit_saved' }` and calls
  `requestAndStorePushToken(userId)`. Then `markStale('outfits')`, shows the
  celebration, and after 1.5 s `router.replace('/(tabs)/')`.
- **Data read:** `items` (id, image_url, category). **Writes:** `outfits`,
  `outfit_items`, `milestones`, `profiles` (via push token).

### 4.8 Wardrobe (home tab)
**File:** `app/(tabs)/index.tsx`
- **What it shows:** a sticky header with a **compact CombinationsCounter** (the live
  combination total + a gap hint), a divider, a search box + horizontal category filter
  pills (`All, Top, Bottom, Dress, Outerwear, Shoes, Bag, Accessory`, shown only when
  items exist), a 2-column grid of item cards (image + uppercase category label), a
  greeting ("Hi, {name}") as the list header, an empty state, a "+" FAB, and the TabBar.
- **User actions:**
  - Tap an item card → `router.push('/(tabs)/item/{id}')`.
  - Search text filters by name/category; filter pills filter by category.
  - "+" FAB (`handleAddItem`): counts `items` (head, exact). If `>= 150`, shows the
    "Wardrobe full" alert; else `router.push('/onboarding/add-first-item')` (item
    adding reuses the onboarding add/tag screens).
- **Data read:** `items` (`id, image_url, category, name`, ordered by `created_at`
  desc), refetched in `useFocusEffect` only when `consumeStale('closet')` is true or
  the cached data is older than `STALE_MS` (30 s). Category counts for the combinations
  header come from the full item list (`tops/bottoms/shoes/dresses`); `gapHint` is
  computed from them.
- **Display name:** `user_metadata.full_name` → email local-part → null.

### 4.9 Item detail
**File:** `app/(tabs)/item/[id].tsx`
- **What it shows:** a top bar (back, uppercase category, "Edit"), a large item image,
  and a bottom panel with: the item name (if set), a cost-per-wear row, a "Wear today"
  button, and a "Remove item" button. Two modals: Android price sheet and edit
  name/category sheet.
- **User actions & writes:**
  - **Wear** (`logWear`): inserts a `wears` row `{ item_id, user_id }`; increments the
    local wear count; button shows "Worn ✓" for 2.5 s.
  - **Price** (`openPricePrompt`): iOS uses `Alert.prompt`; Android opens the bottom
    sheet. `updatePrice` updates `items.price`.
  - **Edit** (`saveEdit`): updates `items.name` and `items.category`, then
    `markStale('closet')`.
  - **Remove** (`confirmDelete` → `deleteItem`): first reads `outfit_items` for this
    item to warn how many outfits are affected. Deletes the Storage file
    (`removeItemImage`), deletes the `items` row (join rows cascade). For each affected
    outfit, re-counts its `outfit_items`; if zero remain, deletes that now-empty
    outfit. Then `markStale('closet')` + `markStale('outfits')` and `router.back()`.
- **Data read:** `items` (single, by id: `id, image_url, category, name, tags, price`)
  and `wears` count (by `item_id`).
- **Business logic:** cost-per-wear shown only when `price != null && wearCount > 0`,
  computed `(price / wearCount).toFixed(2)`.

### 4.10 Outfits tab
**File:** `app/(tabs)/outfits.tsx`
- **What it shows:** "Outfits" header, an occasion filter row (`All, Casual, Work,
  Evening, Sport, Travel`, shown only when outfits exist), a list of outfit cards (up
  to 4 item thumbnails + name + occasion chip), an empty state, a "+" FAB, and the
  TabBar. A create modal (two steps).
- **User actions:**
  - Tap a card → `router.push('/(tabs)/outfits/{id}')`.
  - Occasion filter pills filter the list client-side.
  - "+" FAB (`openCreate`): loads all `items`, resets create state, opens the modal at
    step `select`.
  - Step 1 "select": toggle items, "Next" (disabled until ≥1 selected) → step
    `details`.
  - Step 2 "details": name input (max 60), occasion chips (toggle), "Save outfit".
- **`saveOutfit`:** requires a session, a trimmed name, and ≥1 selected item. Reads the
  existing `outfits` count to detect the first outfit. Inserts the `outfits` row, then
  the `outfit_items` join rows (rolling back the outfit if the join fails). If this was
  the first outfit (`existingCount === 0`), fire-and-forget inserts the
  `first_outfit_saved` milestone and calls `requestAndStorePushToken`. Reloads outfits.
- **Data read:** `outfits` with nested `outfit_items ( items ( id, image_url ) )`,
  ordered by `created_at` desc; refetched via the same stale/`consumeStale('outfits')`
  logic. **Writes:** `outfits`, `outfit_items`, `milestones`, `profiles`.

### 4.11 Outfit detail
**File:** `app/(tabs)/outfits/[id].tsx`
- **What it shows:** a top bar (back, outfit name + occasion chip, "Edit"), a wrapping
  collage of all item images, and a bottom panel with "Wear this outfit" and "Delete
  outfit". An edit modal (name, occasion, item multi-select).
- **User actions & writes:**
  - **Wear** (`wearOutfit`): inserts one `wears` row per item in the outfit (`item_id,
    user_id`); shows "Worn ✓" for 2.5 s.
  - **Delete** (`deleteOutfit`): deletes the `outfits` row (`outfit_items` cascade),
    `markStale('outfits')`, `router.back()`.
  - **Edit** (`openEdit` → `saveEdit`): loads all `items`; pre-selects the current
    items; on save (after a confirm alert) updates `outfits.name`/`occasion`, deletes
    all existing `outfit_items` for the outfit, and re-inserts the new selection; then
    `markStale('outfits')` and reloads.
- **Data read:** `outfits` (single: `id, name, occasion`) and `outfit_items` joined to
  `items ( id, image_url )` for this outfit. Edit modal also reads all `items`.

### 4.12 Discover tab
**File:** `app/(tabs)/discover.tsx` — see §8 for the full section logic.
- **What it shows:** "Discover" header and up to three horizontal product rows (gap,
  occasion, "you keep reaching for"), or a thin-data prompt (< 5 items), or a "Coming
  soon" panel in production (when mock products are disabled). A single affiliate
  disclosure at the very bottom. Tapping a product opens the AWIN WebView modal.
- **User actions:** tap a product card → `setShopProduct(product)` opens the
  `AwinWebView` modal (which calls the `awin-click` function and loads the tracking URL).
- **Data read:** in `useFocusEffect`, three parallel queries: `items(category)`,
  `outfits(occasion)`, `wears(worn_at, items!inner(category))`.

### 4.13 Settings
**File:** `app/(tabs)/settings.tsx`
- **What it shows:** "Settings" header, an ACCOUNT section showing the display name
  (`full_name` → email → "Your account"), a "Sign out" button, a "Delete account"
  button, and a delete hint line. TabBar at the bottom.
- **User actions:**
  - **Sign out** (`signOut`): confirm alert → `supabase.auth.signOut()`.
  - **Delete account** (`confirmDelete` → `performDelete`): two stacked confirm alerts,
    then invokes the **`delete-account`** Edge Function; on `data.ok` signs out locally
    and `router.replace('/(auth)/sign-in')`. On failure shows an error alert.

### 4.14 Spike screens (developer reference)
**Files:** `app/(spike)/index.tsx`, `app/(spike)/collage.tsx`,
`app/(spike)/_layout.tsx`.
- `index` lists four validation spikes; only Spike 1 (collage) is runnable, the rest
  are marked blocked on missing API keys.
- `collage` is a standalone drag-and-drop flat-lay prototype using `PanResponder` and
  two Wikipedia transparent PNGs, with an on-screen PASS-criteria checklist. It does not
  touch Supabase. These screens bypass the auth guard.

### 4.15 Error / loading states
- **Global render crash:** `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) shows
  "Something went wrong." with a "Reload" button that resets the boundary state.
- **Session loading:** root layout renders `null` until the session resolves.
- Per-screen loading is an `ActivityIndicator` (accent color); item/outfit detail show
  "Item not found." / "Outfit not found." with a "Go back" link when the row is missing.

---

## 5. Data model

This is the schema as defined by the migration files in `supabase/migrations/`
(applied in filename order). All tables have RLS enabled. `user_id` columns are `text`
and compared against `auth.uid()::text`.

### `waitlist_signups` (`20260604000000`)
Columns: `id uuid pk default gen_random_uuid()`, `email text not null`,
`tops_count int not null default 0`, `bottoms_count int not null default 0`,
`dress_count int not null default 0`, `combinations_count int not null default 0`,
`created_at timestamptz not null default now()`. Constraints: `email_format` CHECK
(regex), `unique_email` UNIQUE(email). RLS: policy `anon_insert` allows `anon` INSERT
(`with check (true)`). No SELECT policy (admin/service-role reads only). (Used by the
separate landing-page/waitlist site, not by the app screens.)

### `items` (`20260604000001`, plus later migrations)
Columns: `id uuid pk default gen_random_uuid()`, `user_id text not null`,
`image_url text not null`, `category text not null`, `tags text[] not null default
'{}'`, `name text`, `created_at timestamptz not null default now()`, **`price numeric`**
(added `20260604000003`, GBP, nullable), **`session_token text`** (added
`20260606000002`, per-onboarding-session UUID, NULL for in-app items).
RLS policies:
- `users_select_own` / `users_insert_own` / `users_update_own` / `users_delete_own`
  for `authenticated`, all keyed on `auth.uid()::text = user_id`.
- `anon_insert_onboarding` (INSERT for `anon`, `with check (true)`) was created here but
  is **dropped** in `20260606000001`.
Trigger: `check_item_cap` BEFORE INSERT runs `enforce_item_cap()` (see §10).

### `wears` (`20260604000002`, `20260606000004`)
Columns: `id uuid pk`, `item_id uuid not null references items(id) on delete cascade`,
`user_id text not null`, `worn_at timestamptz not null default now()`.
RLS: `users_select_own` (SELECT), `users_insert_own` (INSERT), and `users_delete_own`
(DELETE, added in `20260606000004`), all keyed on `auth.uid()::text = user_id`.

### `affiliate_clicks` (`20260604000004`, `20260606000006`)
Columns: `id uuid pk`, `user_id text not null`, `product_id text not null`,
`retailer text not null`, `category text not null`, `clicked_at timestamptz not null
default now()`, **`merchant_id text`** (added `20260606000006`, nullable).
RLS: only `users_insert_own` (INSERT). **No SELECT policy** — write-only/analytics.

### `outfits` (`20260604000005`)
Columns: `id uuid pk`, `user_id text not null`, `name text not null`, `occasion text`,
`created_at timestamptz not null default now()`.
RLS: `users_select_own` / `users_insert_own` / `users_update_own` / `users_delete_own`
keyed on `auth.uid()::text = user_id`.

### `outfit_items` (`20260604000005`)
Columns: `id uuid pk`, `outfit_id uuid not null references outfits(id) on delete
cascade`, `item_id uuid not null references items(id) on delete cascade`,
`created_at timestamptz not null default now()`.
RLS (no `user_id` column — ownership is via a join to `outfits`):
`users_select_own` / `users_insert_own` / `users_delete_own`, each using
`exists (select 1 from outfits where outfits.id = outfit_id and auth.uid()::text =
outfits.user_id)`.

### `milestones` (`20260604000005`)
Columns: `id uuid pk`, `user_id text not null`, `milestone text not null`,
`achieved_at timestamptz not null default now()`, `unique (user_id, milestone)`.
RLS: `users_select_own` (SELECT), `users_insert_own` (INSERT). The only milestone value
written by the app is `first_outfit_saved`.

### `profiles` (`20260605000001`, `20260606000005`)
Columns: `user_id text primary key`, `expo_push_token text`, `created_at timestamptz
not null default now()`, `updated_at timestamptz not null default now()`,
**`nudge_day3_sent_at timestamptz`** and **`nudge_day7_sent_at timestamptz`** (added
`20260606000005`).
RLS: `users_select_own` / `users_insert_own` / `users_update_own` keyed on
`auth.uid()::text = user_id`. `created_at` is treated as set-once (used by cron cohort
targeting).

### Storage bucket `items` (`20260606000003`)
Private bucket `items` (`public = false`). RLS on `storage.objects` scoped to
`bucket_id = 'items'` and `(storage.foldername(name))[1] = auth.uid()::text` for
SELECT / INSERT / UPDATE / DELETE — i.e. each user may only touch files under their own
`<userId>/` prefix. Objects are stored at `<userId>/<itemId>.png`. The app displays
them via short-lived signed URLs.

### Database function & trigger
- `enforce_item_cap()` (`20260605000003`): BEFORE INSERT trigger `check_item_cap` on
  `items`. Exempts `user_id = 'onboarding-placeholder'`; otherwise counts the user's
  items and raises `item_cap_reached` if `>= 150`.

### pg_cron jobs
- `20260605000002` creates `pg_cron`/`pg_net` extensions and schedules
  `wren-day-3-push-nudge` and `wren-day-7-push-nudge` (both `'0 18 * * *'`).
- `20260606000005` unschedules and re-creates both jobs with de-dup and sequencing
  guards (see §9). The re-created versions read `app.settings.supabase_url` and
  `app.settings.service_role_key` via `current_setting(...)`.

### Edge Functions
| Function | Trigger | What it does | Returns |
|---|---|---|---|
| `remove-bg` | Client invoke (authenticated) | Auth-guards, then POSTs the image (`imageBase64` or `imageUrl`) to Remove.bg (`size=auto`, `format=png`) and base64-encodes the PNG. | `{ cutout: data-URI, creditsUsed, widthPx, heightPx }` |
| `vision-tag` | Client invoke (authenticated) | Auth + 150-item cap guard (service-role count). Mints a Google OAuth token from `GOOGLE_VISION_CREDENTIALS` (RS256 JWT via Web Crypto), calls Vision `LABEL_DETECTION` (maxResults 20), filters to the CLOTHING set at score ≥ 0.5, infers a category from `CATEGORY_MAP`. | `{ tags: string[], suggestedCategory: string\|null, rawLabels }` |
| `tag-clothing` | Client invoke (no auth guard) | Spike 3 batch tagger: takes `imageUrls[]`, calls Vision with an API key (`GOOGLE_VISION_API_KEY`), returns per-image clothing labels and a pass-rate summary. (Not called by the app.) | `{ results, summary }` |
| `fetch-product` | Client invoke (authenticated) | Auth + 150-item cap guard. Fetches a product URL, parses OpenGraph `og:image`/`og:title`/`og:description`, resolves relative image URLs, runs the image through Remove.bg. | `{ cutout: data-URI, title, description }` |
| `awin-click` | Client invoke (authenticated) | Auth-guards. Builds the AWIN `cread.php` tracking URL from `merchantId` + `AWIN_PUBLISHER_ID` + `ued=productUrl`, fires a server-side GET (`redirect: manual`) to log the click, and (if `productId`/`retailer`/`category` present) inserts an `affiliate_clicks` row under the caller's JWT. | `{ trackingUrl, clickRecorded, awinStatus }` |
| `claim-onboarding-items` | Client invoke (authenticated, post-OAuth) | Verifies the new account's JWT; with the service role, updates `items` setting `user_id = new uid, session_token = null` WHERE `user_id = fromUserId AND session_token = sessionToken`. | `{ claimed: number }` |
| `delete-account` | Client invoke (authenticated) | Verifies caller, then with the service role: removes Storage files under `<userId>/`, deletes rows in order (`wears`, `outfit_items` for the user's outfits, `outfits`, `milestones`, `profiles`, `affiliate_clicks`, `items`), then `auth.admin.deleteUser`. Stops and reports on first failure. | `{ ok: true }` or `{ error }` |
| `send-push` | Service-role only (cron) | Requires `Authorization: Bearer <service_role_key>`. Looks up the user's `expo_push_token`, POSTs to Expo push (`exp.host/--/api/v2/push/send`), inspects the ticket (clears the token on `DeviceNotRegistered`), and for `nudge` `day3`/`day7` stamps `nudge_dayN_sent_at`. | `{ ok: true }` / `{ ok:false, error }` / error |

---

## 6. Authentication and user flow

**Client setup** (`src/lib/supabase.ts`): a Supabase client with
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Session storage is
SecureStore on native, AsyncStorage on web. `autoRefreshToken: true`,
`persistSession: true`, `detectSessionInUrl: false`.

**Session context** (`src/lib/session.tsx`): `SessionProvider` calls `getSession()` on
mount and subscribes to `onAuthStateChange`. `useSession()` exposes `{ session,
loading }`.

**Anonymous sign-in** (`src/lib/ensure-anon-session.ts`): `ensureAnonSession()` reuses
any existing session, otherwise calls `supabase.auth.signInAnonymously()`. It is invoked
at the top of onboarding so the pre-auth AI functions (which auth-guard on a real user)
and `items` inserts (RLS `users_insert_own`) work before the user picks an OAuth
provider. Requires "Anonymous sign-ins" enabled in the Supabase dashboard.

**First launch (new user):** No session → the route guard sends them to
`/(auth)/sign-in`, which links to `/onboarding`. Onboarding establishes an anonymous
session, lets them add and tag one real item (stored under the anon user with a
`session_token`), then `success` prompts Apple/Google sign-in. The anon user id is
captured **before** sign-in; after `signInWithIdToken` swaps the session to the
permanent account, `claim-onboarding-items` reassigns the item rows (matching both the
old anon `user_id` and the random `session_token`). The user is then forced through
`build-first-outfit` and lands on the Wardrobe tab.

**Returning user:** `getSession()` restores the persisted session. A permanent
(non-anonymous) session is only bounced off `(auth)`; otherwise it stays where it is.

**Anonymous mid-onboarding:** if an anonymous session exists but the user is not in the
`onboarding` group, they are redirected back to `/onboarding`.

**Google OAuth (native):** `@react-native-google-signin` returns an ID token →
`supabase.auth.signInWithIdToken({ provider:'google' })`. Configured with
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. The
`iosUrlScheme` is set in `app.json`.

**Apple OAuth:** `expo-apple-authentication` returns an identity token →
`signInWithIdToken({ provider:'apple' })`; if Apple provides a name on first sign-in it
is saved to `user_metadata.full_name`. iOS-only button.

**Web:** Google/Apple native SDKs don't run; `WebSignIn` uses Supabase email OTP
(magic link). A `__DEV__`-only "Skip sign in" uses a hardcoded password account.

**Sign out:** `supabase.auth.signOut()` (from Settings). **Account deletion:** the
`delete-account` Edge Function erases all data then the auth user; the client signs out
and returns to sign-in.

---

## 7. The affiliate flow

End to end (current behaviour):
1. **Catalogue.** Discover renders a hardcoded mock catalogue (`MOCK_CATALOGUE`) keyed
   by category, each product carrying `brand, name, price, imageUrl
   (picsum.photos), url, retailer, category`. A placeholder `merchantId = '0'`
   (`MERCHANT_ID_PLACEHOLDER`) is injected onto every product.
2. **Mock gate.** `USE_MOCK_PRODUCTS = __DEV__`. In development the real product rows
   render; in production (`__DEV__` false) Discover shows only a "Coming soon" panel and
   no products at all.
3. **Tap.** Tapping a `ProductCard` calls `handleShop(product)` → `setShopProduct(...)`,
   which opens a full-screen `<Modal>` containing `AwinWebView`.
4. **`AwinWebView`** (`src/components/AwinWebView.tsx`) invokes the **`awin-click`**
   Edge Function with `{ merchantId, productUrl, productId, retailer, category }`. While
   waiting it shows "Preparing affiliate link…".
5. **Edge Function (`awin-click`).** Auth-guards the caller, builds
   `https://www.awin1.com/cread.php?awinmid=<merchantId>&awinaffid=<AWIN_PUBLISHER_ID>&ued=<encoded productUrl>`,
   fires a server-side GET with `redirect: manual` (so AWIN logs the click), and — if
   `productId`/`retailer`/`category` are present — inserts an `affiliate_clicks` row
   (`user_id, product_id, retailer, category, merchant_id`) under the caller's JWT
   (best-effort; analytics insert failure does not fail the request). Returns
   `{ trackingUrl, clickRecorded, awinStatus }`.
6. **WebView opens** the returned `trackingUrl` with `sharedCookiesEnabled` and
   `thirdPartyCookiesEnabled`, following the awin1.com → merchant redirect inside the
   WebView so the AWIN cookie is set and persists for attribution. `onShouldStartLoad
   WithRequest` always returns true (stays in the WebView; never hands off to an
   external browser). A close "✕" button calls `onClose`.
7. **Click logged** in `affiliate_clicks` (write-only table; no user SELECT policy).

**What changes when AWIN is live:** Per in-code TODOs, the mock catalogue is to be
replaced with the live AWIN feed, and the real per-product AWIN merchant id replaces
`MERCHANT_ID_PLACEHOLDER = '0'`. Flipping `USE_MOCK_PRODUCTS` to true in production (or
wiring a live feed) is what turns off the "Coming soon" state. `AWIN_PUBLISHER_ID` must
be set as an Edge Function secret for `awin-click` to build a valid link (otherwise it
returns 500).

---

## 8. Discover tab logic

**File:** `app/(tabs)/discover.tsx`. On focus it runs three parallel queries:
`items(category)`, `outfits(occasion)`, and `wears(worn_at, items!inner(category))`.

**Thin-data gate:** if the user owns **< 5 items**, Discover sets `thinData: true` and
renders a single prompt card ("Add more items to your wardrobe to unlock personalised
picks.") with no product rows.

**Production gate:** when `USE_MOCK_PRODUCTS` is false (production), none of the below
runs — the tab shows the "Coming soon" panel.

Item counts are tallied per singular category and rolled into `CATEGORY_GROUPS`:
`Tops(Top)`, `Bottoms(Bottom)`, `Dresses(Dress)`, `Outerwear(Outerwear)`,
`Shoes(Shoes)`, `Accessories(Bag+Accessory)`. Then up to three sections are built:

**Section 1 — "You're short on: {group}".** Sorts groups ascending by count. Takes the
minimum group, plus a second group if its count is within one of the minimum
(`<= minCount + 1`), capped at two rows. Subtitle compares the gap group's count to the
most-owned group ("You have X tops, Y bottoms"). Products come from `MOCK[group.product]`.
Rationale on each card: "You own X {group}".

**Section 2 — "For your {occasion} looks".** Tallies occasions across saved outfits,
takes the top 2 by frequency. For each, `productsFrom(OCCASION_CATEGORIES[occasion], 8)`
interleaves products across the mapped categories. `OCCASION_CATEGORIES`: Work→
[Outerwear,Bottom,Top], Evening→[Dress,Shoes], Casual→[Bottom,Shoes,Top], Travel→
[Outerwear,Bag,Top], Sport→[Top,Shoes,Bottom]. Hidden entirely if no outfits have
occasions. Subtitle: "Based on N {occasion} outfit(s) saved."

**Section 3 — "You keep reaching for".** Only if there are **≥ 5 wear events** total.
Counts wears in the current calendar month per category, then picks the most-worn
category that the user owns **≤ 2** of. Subtitle: "Worn N× this month. You own X
piece(s)/pair(s)." (uses "pair" for Shoes). Products come from `MOCK[category]`.

**Empty/hidden conditions summary:** < 5 items → thin-data prompt only; no occasions →
Section 2 omitted; < 5 wears (or no qualifying low-owned category) → Section 3 omitted;
production build → whole catalogue hidden behind "Coming soon". The affiliate disclosure
line renders once at the bottom whenever any sections are shown.

---

## 9. Push notifications

**Permission request** (`src/lib/push.ts`, `requestAndStorePushToken`): triggered
immediately after the **first outfit is saved** — called from both
`onboarding/build-first-outfit.tsx` and `(tabs)/outfits.tsx` (when `existingCount === 0`).
Flow: web is a no-op; on native it reads current permission; if `undetermined` it shows
an in-app **pre-prompt** alert ("Outfit reminders … We'll only send 2–3 in your first
week.") and only calls the OS prompt if the user taps "Allow". If granted, it fetches
the Expo push token (using the EAS `projectId` from `app.json`) and **upserts**
`profiles` `{ user_id, expo_push_token, updated_at }` (`onConflict: user_id`). All
errors are swallowed (push is non-critical).

**Cron jobs** (`supabase/migrations`): two daily jobs at `0 18 * * *`. The current
(re-scheduled) definitions in `20260606000005`:
- **Day-3** (`wren-day-3-push-nudge`): for each `profiles` row where `created_at::date
  = today - 3`, `expo_push_token is not null`, `nudge_day3_sent_at is null`, and the
  user has **no outfits**, POSTs to `send-push` with `nudge:'day3'`, title "Your
  wardrobe is waiting 👗", body "You haven't saved an outfit yet — it takes 30 seconds."
- **Day-7** (`wren-day-7-push-nudge`): same shape at `today - 7`, additionally
  requiring `nudge_day3_sent_at is not null` and `nudge_day7_sent_at is null` (so day-7
  only follows users who received day-3), title "Still time to get organised", body
  "Open WREN and save your first outfit. Your clothes will thank you." Both read the
  Supabase URL and service-role key from `current_setting('app.settings.*', true)`.

(The earlier `20260605000002` versions targeted the same cohorts via
`vault.decrypted_secrets` and did not carry the `nudge` field or the `sent_at` guards;
`20260606000005` unschedules and replaces them.)

**Sending** (`send-push` Edge Function): authorized only with the service-role bearer
token. Looks up `expo_push_token`, POSTs `{ to, title, body, sound:'default' }` to
Expo's push API, inspects the returned ticket. On `DeviceNotRegistered` it nulls the
stored token. On success, for `day3`/`day7` it stamps `nudge_dayN_sent_at` so the cron
won't resend.

---

## 10. Free-tier limits (150-item cap)

The 150-item cap is enforced at four points:

1. **Wardrobe FAB guard** (`app/(tabs)/index.tsx`, `handleAddItem`): counts `items`
   (head, exact) and, if `>= 150`, shows the "Wardrobe full" alert instead of opening
   the add flow.
2. **Add-item client guard** (`app/onboarding/add-first-item.tsx`, `processImage`): if
   a session exists, counts the user's items (`eq('user_id', …)`, head); if `>= 150`,
   shows the alert and does not call `remove-bg`.
3. **Edge Function 403** — both `vision-tag` and `fetch-product` count the user's items
   with the **service role** and return `{ error: 'item_cap_reached' }` with **HTTP
   403** if `>= 150`, before doing any paid AI work.
4. **Postgres trigger** (`enforce_item_cap()` via `check_item_cap`): a BEFORE INSERT
   backstop on `items` that raises `item_cap_reached` when the user already has `>= 150`
   items. It exempts `user_id = 'onboarding-placeholder'` (a legacy value; the anon
   insert path that used it has since been dropped).

The cap message shown to users: "Free accounts can store up to 150 items. Remove some
items or upgrade to Pro for unlimited storage."

---

## 11. Key business logic

**Combinations formula** (`src/lib/combinations.ts`):
`combinations = tops × bottoms × max(shoes, 1) + dresses`. This is the single source of
truth, imported by onboarding, the Wardrobe header, and `CombinationsCounter`. The same
file's `gapHint(counts)` computes, among adding one top / one bottom / one pair of
shoes, which single addition unlocks the most new combinations, returning e.g. "Add a
bottom to unlock N more combinations." (or null if nothing helps).

**Cost-per-wear** (`app/(tabs)/item/[id].tsx`): shown only when `price != null &&
wearCount > 0`, computed as `(price / wearCount).toFixed(2)` and rendered "£X.XX per
wear" with a "£price paid · N wears" sub-line. `wearCount` is the count of `wears` rows
for the item; `price` is set manually by the user (iOS `Alert.prompt`, Android bottom
sheet).

**North Star milestone:** the app records a `first_outfit_saved` milestone (unique per
user) the first time an outfit is saved, and uses that moment to request push
permission. A comment in `build-first-outfit.tsx` describes the North Star target as
"10 saved outfits in 7 days", but **no code counts to ten or measures a 7-day window**;
the only milestone written/tracked is `first_outfit_saved`. The day-3/day-7 cron nudges
target users with **zero** outfits.

**Outfit-builder gate:** after onboarding sign-in, `build-first-outfit` is a mandatory
step (`gestureEnabled:false`, no header, no skip). Saving requires **≥ 2** selected
items and a name. The in-app Outfits create flow requires only **≥ 1** item and a name.

**Cross-screen refresh** (`src/lib/refresh.ts`): module-level dirty flags for
`'closet'` and `'outfits'`. Mutations call `markStale(key)`; the Wardrobe and Outfits
screens refetch on focus only when their key was flagged dirty (`consumeStale`) or the
cached data is older than `STALE_MS` (30 s).

**Image storage resolution** (`src/lib/item-images.ts`, `RemoteImage`): `image_url`
may be a Storage object path, a `data:` URI, or an http(s) URL. Storage paths are signed
into 1-hour signed URLs (cached, expiring 60 s early); data/http URLs render directly.
Uploads convert the cut-out data URI to bytes (a hand-rolled base64 decoder, since
`atob` is not guaranteed in Hermes) and put it at `<userId>/<itemId>.png`; on upload
failure the caller falls back to storing the data URI so saving never hard-fails.

**Onboarding store** (`src/lib/onboarding-store.ts`): a module-level object holding
`cutoutUri`, `prefillName`, a random `sessionToken` (UUID), and `anonUserId` across the
linear onboarding screens (avoids passing multi-MB data URIs through route params).
`reset()` regenerates the session token.

**Combinations counter animation** (`src/components/CombinationsCounter.tsx`): animates
the displayed number toward the target with Reanimated (`withTiming`, cubic ease); has a
`compact` horizontal variant (used as the Wardrobe header, with the gap hint as its
sub-line) and a full centered variant.

---

## 12. What is not yet live

**Built but gated:**
- **AWIN production feed.** Discover's catalogue is the hardcoded `MOCK_CATALOGUE`
  (picsum.photos images), shown only when `USE_MOCK_PRODUCTS === __DEV__`. Production
  renders a "Coming soon" panel. The AWIN tracking pipeline (`AwinWebView` + `awin-click`
  Edge Function + `affiliate_clicks` table + `merchant_id` column) is fully wired, but
  every product uses the placeholder `merchantId = '0'`, and `AWIN_PUBLISHER_ID` must be
  set server-side for links to build.
- **Premium / Pro tier.** There is no purchase, paywall, or entitlement code. "Pro" is
  referenced only in the 150-item cap copy ("upgrade to Pro for unlimited storage"). The
  cap is hard-coded at 150 in four places with no bypass for any tier.

**Placeholders / scaffolding:**
- `MERCHANT_ID_PLACEHOLDER = '0'` for all products (TODO: real per-product AWIN ids).
- `EXPO_PUBLIC_TURNSTILE_SITE_KEY` appears in `.env.example` (Cloudflare Turnstile) but
  no Turnstile usage exists in the app source — it relates to the separate waitlist
  site.
- `App.tsx` / `index.ts` are unused Expo-template boilerplate (the entry is
  `expo-router/entry`).
- `tag-clothing` Edge Function is the Spike-3 batch tagger (API-key based, no auth
  guard) and is not called by the app; the app uses `vision-tag` (service-account,
  auth + cap guarded).
- The `(spike)` route group (`index`, `collage`) is developer-only reference UI that
  bypasses the auth guard.
- `waitlist_signups` table and the `waitlist/` + `scripts/` directories belong to the
  pre-launch landing page, not the app screens.

**Known in-code TODOs / notes:**
- `discover.tsx`: "REMOVE BEFORE PRODUCTION — replace with live AWIN feed"; "replace
  with the real AWIN merchant ID per product once live."
- `.env.example`: TODOs to set the real Google OAuth client id and to **rotate** the
  Remove.bg key and Google Vision service-account key if ever committed.
- `ErrorBoundary.tsx`: "TODO: forward to a crash reporter (e.g. Sentry) once
  configured" and a note that `expo-updates` is not installed (so reload only resets the
  boundary, it cannot reload the bundle).
- `metro.config.js`: a load-bearing custom Metro resolver works around a
  `react-native-css` Windows path bug (redirects drive-letter module specifiers to an
  empty CSS stub); `src/tw/index.web.tsx` is a parallel web shim for the same reason.
- The `enforce_item_cap()` trigger still exempts `user_id = 'onboarding-placeholder'`,
  a value no current code path produces (the anonymous-insert policy that used it was
  dropped in `20260606000001`).

**Ambiguities noted honestly:**
- The "North Star — 10 outfits in 7 days" exists only as a comment; no code measures it
  (see §11).
- `nativewind` and `react-native-css` are both present; the app's `src/tw` wrapper is
  built on `react-native-css`, while `nativewind/metro` provides the CSS transform.
  Both Tailwind v3 and v4 PostCSS packages are installed. The exact division of labour
  between them at build time is not fully determinable from the app source alone.

---

*Generated from a full read of the source on the repository state present at
`C:\wren-app` (non-git working tree). Every section reflects code that was read; nothing
here is taken from spec or design documents.*
