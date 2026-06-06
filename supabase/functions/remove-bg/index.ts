/**
 * Remove.bg Edge Function
 *
 * Accepts either:
 *   { imageUrl: string }   — for a publicly accessible image URL
 *   { imageBase64: string } — for raw base64 image data (JPEG from device camera)
 *
 * Returns:
 *   { cutout: string }  — data:image/png;base64,… ready for <Image source={{ uri: cutout }} />
 *
 * Required env var: REMOVE_BG_API_KEY (set in Supabase dashboard → Settings → Edge Functions)
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ── Auth guard ─────────────────────────────────────────────────────────────
  // Only authenticated users may invoke this function. Without this check anyone
  // holding the anon key could drain paid Remove.bg credits.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser()
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const body = await req.json() as { imageUrl?: string; imageBase64?: string }
    const { imageUrl, imageBase64 } = body

    if (!imageUrl && !imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageUrl or imageBase64 required' }),
        { status: 400, headers: CORS }
      )
    }

    const apiKey = Deno.env.get('REMOVE_BG_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'REMOVE_BG_API_KEY not set' }),
        { status: 500, headers: CORS }
      )
    }

    const form = new FormData()
    if (imageBase64) {
      form.append('image_file_b64', imageBase64)
    } else {
      form.append('image_url', imageUrl!)
    }
    form.append('size', 'auto')
    form.append('format', 'png')

    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form,
    })

    if (!res.ok) {
      const errText = await res.text()
      return new Response(
        JSON.stringify({ error: `remove.bg: ${res.status}`, detail: errText }),
        { status: res.status, headers: CORS }
      )
    }

    const buffer = await res.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let raw = ''
    for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i])
    const base64 = btoa(raw)
    const creditsUsed = res.headers.get('X-Credits-Charged') ?? 'unknown'

    return new Response(
      JSON.stringify({
        cutout: `data:image/png;base64,${base64}`,
        creditsUsed,
        widthPx: res.headers.get('X-Width'),
        heightPx: res.headers.get('X-Height'),
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS })
  }
})
