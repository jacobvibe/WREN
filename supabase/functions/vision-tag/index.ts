/**
 * Vision Tag Edge Function
 *
 * Accepts: { imageBase64: string }  — raw base64 (no data: prefix)
 * Returns: { tags: string[], suggestedCategory: string | null, rawLabels: object[] }
 *
 * Uses Google Cloud Vision LABEL_DETECTION, filtered to the CLOTHING set.
 * Required env var: GOOGLE_VISION_CREDENTIALS  (service account JSON, same key as spike 3)
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Same CLOTHING set used in spike3-vision.js (verified 23/30 pass rate)
const CLOTHING = new Set([
  'clothing', 'fashion', 'shirt', 't-shirt', 'dress', 'jeans', 'pants', 'trousers',
  'jacket', 'coat', 'skirt', 'blouse', 'sweater', 'hoodie', 'suit', 'shoe', 'boot',
  'sneaker', 'top', 'leggings', 'shorts', 'cardigan', 'vest', 'blazer', 'denim',
  'textile', 'apparel', 'garment', 'outerwear', 'footwear', 'sleeve', 'collar',
  'jersey', 'jumper', 'pullover', 'sweatshirt', 'turtleneck', 'polo', 'uniform',
  'sportswear', 'walking shoe',
])

const CATEGORY_MAP: Record<string, string> = {
  shirt: 'Top', 't-shirt': 'Top', blouse: 'Top', top: 'Top', sweater: 'Top',
  hoodie: 'Top', polo: 'Top', turtleneck: 'Top', jersey: 'Top', pullover: 'Top',
  sweatshirt: 'Top', cardigan: 'Top', collar: 'Top', sleeve: 'Top', sportswear: 'Top',
  pants: 'Bottom', jeans: 'Bottom', trousers: 'Bottom', shorts: 'Bottom',
  skirt: 'Bottom', leggings: 'Bottom', denim: 'Bottom',
  dress: 'Dress',
  jacket: 'Outerwear', coat: 'Outerwear', blazer: 'Outerwear', vest: 'Outerwear',
  outerwear: 'Outerwear', suit: 'Outerwear', uniform: 'Outerwear',
  shoe: 'Shoes', boot: 'Shoes', sneaker: 'Shoes', footwear: 'Shoes', 'walking shoe': 'Shoes',
}

// ── JWT helpers (Deno Web Crypto) ────────────────────────────────────────────

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\r?\n|\r/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function b64url(input: string | Uint8Array): string {
  let str: string
  if (typeof input === 'string') {
    str = btoa(input)
  } else {
    let s = ''
    for (let i = 0; i < input.length; i++) s += String.fromCharCode(input[i])
    str = btoa(s)
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getAccessToken(email: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signingInput = `${header}.${payload}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  )
  const jwt = `${signingInput}.${b64url(sigBytes)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  if (!res.ok) throw new Error(`Auth failed: ${await res.text()}`)
  const { access_token } = await res.json()
  return access_token
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ── Auth + item-cap guard ─────────────────────────────────────────────────
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

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { count } = await adminClient
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if ((count ?? 0) >= 150) {
    return new Response(
      JSON.stringify({ error: 'item_cap_reached' }),
      { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const { imageBase64 } = await req.json() as { imageBase64?: string }
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'imageBase64 required' }), { status: 400, headers: CORS })
    }

    const credsRaw = Deno.env.get('GOOGLE_VISION_CREDENTIALS')
    if (!credsRaw) {
      return new Response(JSON.stringify({ error: 'GOOGLE_VISION_CREDENTIALS not set' }), { status: 500, headers: CORS })
    }
    const creds = JSON.parse(credsRaw)

    const accessToken = await getAccessToken(creds.client_email, creds.private_key)

    const visionRes = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: 'LABEL_DETECTION', maxResults: 20 }],
        }],
      }),
    })

    if (!visionRes.ok) {
      const errText = await visionRes.text()
      return new Response(JSON.stringify({ error: `Vision: ${visionRes.status}`, detail: errText }), {
        status: visionRes.status,
        headers: CORS,
      })
    }

    const { responses } = await visionRes.json()
    const rawLabels: { description: string; score: number }[] = responses[0]?.labelAnnotations ?? []

    // Filter to clothing-relevant labels with ≥ 0.5 confidence
    const clothingLabels = rawLabels.filter(
      l => l.score >= 0.5 && CLOTHING.has(l.description.toLowerCase())
    )

    const tags = clothingLabels.map(l => l.description)

    // Infer category from the highest-confidence clothing label that has a mapping
    let suggestedCategory: string | null = null
    for (const { description } of clothingLabels) {
      const cat = CATEGORY_MAP[description.toLowerCase()]
      if (cat) { suggestedCategory = cat; break }
    }

    return new Response(
      JSON.stringify({ tags, suggestedCategory, rawLabels }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS })
  }
})
