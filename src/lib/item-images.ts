import { supabase } from './supabase'

// Item images live in the private `items` Storage bucket at `<userId>/<itemId>.png`.
// The DB column items.image_url stores ONE of:
//   - a Storage object path ("<uid>/<id>.png")  ← new items (preferred)
//   - a data: URI                                ← legacy / upload-failure fallback
//   - an http(s) URL                             ← never, but rendered as-is if seen
//
// We never make the bucket public; display URLs are short-lived signed URLs.

export const ITEMS_BUCKET = 'items'

/** True if the stored value is a bucket object path (needs signing to display). */
export function isStoragePath(url: string | null | undefined): boolean {
  return (
    !!url &&
    !url.startsWith('data:') &&
    !url.startsWith('http://') &&
    !url.startsWith('https://')
  )
}

// ── base64 → bytes (no dependency on atob, which is not guaranteed in Hermes) ──
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256)
  for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS.charCodeAt(i)] = i
  return t
})()

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const len = clean.length
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  const byteLen = (len * 3) / 4 - padding
  const bytes = new Uint8Array(byteLen)
  let p = 0
  for (let i = 0; i < len; i += 4) {
    const e1 = B64_LOOKUP[clean.charCodeAt(i)]
    const e2 = B64_LOOKUP[clean.charCodeAt(i + 1)]
    const e3 = B64_LOOKUP[clean.charCodeAt(i + 2)]
    const e4 = B64_LOOKUP[clean.charCodeAt(i + 3)]
    if (p < byteLen) bytes[p++] = (e1 << 2) | (e2 >> 4)
    if (p < byteLen) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2)
    if (p < byteLen) bytes[p++] = ((e3 & 3) << 6) | e4
  }
  return bytes
}

/**
 * Uploads a cutout data URI to the private items bucket.
 * Returns the object path on success, or null on failure (caller falls back to
 * storing the data URI so saving never hard-fails).
 */
export async function uploadItemImage(
  userId: string,
  itemId: string,
  dataUri: string,
): Promise<string | null> {
  try {
    const b64 = dataUri.replace(/^data:image\/[^;]+;base64,/, '')
    const bytes = base64ToBytes(b64)
    const path = `${userId}/${itemId}.png`
    const { error } = await supabase.storage
      .from(ITEMS_BUCKET)
      .upload(path, bytes, { contentType: 'image/png', upsert: true })
    if (error) {
      if (__DEV__) console.warn('uploadItemImage failed, falling back to data URI:', error.message)
      return null
    }
    return path
  } catch (e) {
    if (__DEV__) console.warn('uploadItemImage threw, falling back to data URI:', e)
    return null
  }
}

/** Removes an item's file from Storage. Accepts a stored path or legacy public URL. */
export async function removeItemImage(imageUrl: string): Promise<void> {
  let path: string | null = null
  if (isStoragePath(imageUrl)) {
    path = imageUrl
  } else if (imageUrl.includes('/storage/v1/object/')) {
    path = imageUrl.split(`/${ITEMS_BUCKET}/`)[1] ?? null
  }
  if (path) {
    await supabase.storage.from(ITEMS_BUCKET).remove([path])
  }
}

// ── Signed-URL resolution (cached) ────────────────────────────────────────────
const SIGN_TTL_SECONDS = 3600
const signedCache = new Map<string, { url: string; expiresAt: number }>()

/** Resolves a stored image_url to a displayable URI (signs storage paths). */
export async function getDisplayUri(imageUrl: string): Promise<string> {
  if (!isStoragePath(imageUrl)) return imageUrl
  const now = Date.now()
  const cached = signedCache.get(imageUrl)
  if (cached && cached.expiresAt > now) return cached.url

  const { data } = await supabase.storage
    .from(ITEMS_BUCKET)
    .createSignedUrl(imageUrl, SIGN_TTL_SECONDS)
  if (data?.signedUrl) {
    // Expire our cache a minute before the signed URL itself does.
    signedCache.set(imageUrl, { url: data.signedUrl, expiresAt: now + (SIGN_TTL_SECONDS - 60) * 1000 })
    return data.signedUrl
  }
  return imageUrl
}
