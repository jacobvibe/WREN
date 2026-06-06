/**
 * Fetch Product — "paste a link" item entry.
 *
 * Authenticates the user (counts against the 150-item cap, like vision-tag),
 * fetches the given URL server-side, parses OpenGraph tags, and — if an image is
 * found — removes its background via Remove.bg and returns the cut-out.
 *
 * Request:  { url: string }
 * Response: { cutout: string (data URI), title: string|null, description: string|null }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function metaContent(html: string, key: string): string | null {
  // Matches <meta property="og:image" content="..."> and the name="" / reversed-attribute forms.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ── Auth + item-cap guard ─────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { count } = await adminClient
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if ((count ?? 0) >= 150) return json({ error: 'item_cap_reached' }, 403)

  try {
    const { url } = await req.json() as { url?: string }
    if (!url || !/^https?:\/\//i.test(url)) {
      return json({ error: 'A valid http(s) url is required' }, 400)
    }

    // Fetch the product page.
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WrenApp/1.0)' },
      redirect: 'follow',
    })
    if (!pageRes.ok) {
      return json({ error: "Couldn't read that link — try taking a photo instead." }, 422)
    }
    const html = await pageRes.text()

    let imageUrl = metaContent(html, 'og:image')
    const title = metaContent(html, 'og:title')
    const description = metaContent(html, 'og:description')

    if (!imageUrl) {
      return json({ error: "Couldn't read that link — try taking a photo instead." }, 422)
    }
    // Resolve protocol-relative / root-relative image URLs.
    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl
    else if (imageUrl.startsWith('/')) {
      const base = new URL(url)
      imageUrl = `${base.origin}${imageUrl}`
    }

    // Background removal via Remove.bg (same provider as remove-bg function).
    const apiKey = Deno.env.get('REMOVE_BG_API_KEY')
    if (!apiKey) return json({ error: 'REMOVE_BG_API_KEY not set' }, 500)

    const form = new FormData()
    form.append('image_url', imageUrl)
    form.append('size', 'auto')
    form.append('format', 'png')

    const bgRes = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form,
    })
    if (!bgRes.ok) {
      return json({ error: "Couldn't process that image — try taking a photo instead." }, 422)
    }

    const buffer = await bgRes.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let raw = ''
    for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i])
    const base64 = btoa(raw)

    return json({
      cutout: `data:image/png;base64,${base64}`,
      title: title ?? null,
      description: description ?? null,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
