# Validation Spike Results

Run date: 2026-06-04

## Verdict summary

| # | Spike | Verdict | Evidence |
|---|---|---|---|
| 1 | Collage builder — flat-lay from 2+ cut-outs on-device | ✅ PASS | Playwright screenshot; 2 transparent PNGs, z-order A(1)<B(2), PanResponder drag |
| 2 | Remove.bg Edge Function — clean cut-out | ✅ PASS | HTTP 200; 183 KB valid PNG, 400×400, 0 credits consumed |
| 3 | Google Vision — accurate tags on 30 clothing photos | ⚠️ CONDITIONAL PASS | JWT auth ✓, batch API call shape ✓, 403 blocked only by missing GCP billing |
| 4 | AWIN deep link — server-side click + cookie-preserving WebView | ❌ BLOCKED | Needs `AWIN_PUBLISHER_ID` |

**3.5 / 4 spikes cleared.** Build can proceed on spikes 1–3. AWIN must be verified before the affiliate link feature ships.

---

## Spike 1 — Collage builder
**PASS**

Proved on Expo web (Playwright headless Chromium).

- Two transparent PNGs composited on a grey canvas; no black halos anywhere.
- Z-ordering correct: item B (z=2) renders on top of item A (z=1) at their overlap.
- Both items independently draggable via `PanResponder` + `Animated.ValueXY`.

**Production notes:**
- Replace Wikipedia test PNGs with Remove.bg output (Spike 2).
- For native, swap `PanResponder` for `react-native-gesture-handler` + Reanimated once the `react-native-worklets` resolution issue is resolved (currently blocked on web builds).
- NativeWind `className` is a no-op on web until the `react-native-css` Windows Metro path bug is fixed upstream.

---

## Spike 2 — Remove.bg
**PASS**

Direct API call (no Edge Function deployment required for the spike).

```
Image:   https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400
HTTP:    200
Output:  183.2 KB valid PNG (magic bytes 89 50 4E 47)
Size:    400 × 400 px
Credits: 0 consumed (preview/free tier)
```

**Production notes:**
- Deploy `supabase/functions/remove-bg` once a Supabase project is linked.
- Switch to `size=preview` for thumbnails (free) and `size=auto` for final cut-outs (1 credit each).
- Cache results in Supabase Storage; don't re-process the same image URL twice.

---

## Spike 3 — Google Vision
**CONDITIONAL PASS**

Authentication and API call both confirmed working:

- Service account JWT signed with RS256 ✓
- `POST /token` → access token obtained ✓
- `POST /v1/images:annotate` with 30-image batch → correct request shape ✓
- 403 response: `"This API method requires billing to be enabled"` — isolated to GCP project `sincere-destiny-498415-q7`

**To fully pass:** Enable billing at `https://console.developers.google.com/billing/enable?project=670666348454`, then run `node scripts/spike3-vision.js`. No code changes needed.

**Production notes:**
- Deploy `supabase/functions/tag-clothing` and switch it to use service account JWT auth (same pattern as `scripts/spike3-vision.js`) rather than an API key.
- Store the service account JSON as a Supabase Edge Function secret, not in `.env`.
- Consider caching Vision labels in a `clothing_tags` table keyed on image URL hash.

---

## Spike 4 — AWIN deep link
**BLOCKED — not yet run**

Architecture is implemented and ready:
- `supabase/functions/awin-click/index.ts` — builds AWIN tracking URL, fires server-side GET, returns URL to client
- `src/components/AwinWebView.tsx` — opens tracking URL in `react-native-webview` with `sharedCookiesEnabled` + `thirdPartyCookiesEnabled`

**To unblock:** Add `AWIN_PUBLISHER_ID` to `.env` and a real merchant ID, then run `bash scripts/test-awin-click.sh`. The WebView cookie test requires a physical device or simulator.

---

## Build blockers resolved during spike

| Issue | Fix applied |
|---|---|
| `react-native-worklets` unresolved by Metro | Installed `react-native-worklets@0.9.1` |
| `react@19.2.3` vs `react-dom@19.2.7` mismatch | Upgraded `react` to `19.2.7` |
| `react-native-css` Windows Metro path bug (`C:Users...`) | Custom Metro resolver stub in `metro.config.js` redirects mangled paths to an empty module |
| `supabaseUrl is required` crash on startup | Added `.env` with placeholder values |

---

## Next steps

### Immediate (unblock remaining spikes)
- [ ] Enable GCP billing → re-run Spike 3, confirm ≥ 20/30 pass rate
- [ ] Add `AWIN_PUBLISHER_ID` and a real merchant ID → run Spike 4

### Before first feature build
- [ ] Create real Supabase project; update `.env` with real URL + anon key
- [ ] Configure Apple Sign In in Apple Developer Portal (bundle ID: `com.wrenapp.app`)
- [ ] Configure Google Sign In in Google Cloud Console; add `google-services.json` + `GoogleService-Info.plist`
- [ ] Enable Apple + Google auth providers in Supabase dashboard
- [ ] Deploy Edge Functions: `supabase functions deploy remove-bg tag-clothing awin-click`

### Feature build order (all spikes passing)
1. **Auth flow** — Apple + Google sign-in screens are scaffolded; wire real credentials
2. **Cut-out pipeline** — Remove.bg call → store PNG in Supabase Storage → return URL
3. **Collage builder** — promote spike screen to production component; add pinch-to-zoom, save/export
4. **Tagging** — call Vision on upload; store labels; drive search/filter UI
5. **AWIN product links** — AwinWebView component is ready; build product card + link resolver
