/**
 * Spike 4: AWIN server-side click tracker
 *
 * PASS criteria:
 *   ✓ Edge Function fires GET to AWIN tracking URL (records the click)
 *   ✓ Returns a final merchant URL with AWIN click parameters
 *   ✓ Client WebView opens that URL and cookie is set by awin1.com redirect
 *
 * Required env vars:
 *   AWIN_PUBLISHER_ID   – your AWIN publisher/affiliate ID
 *
 * How AWIN tracking works:
 *   1. This function builds the AWIN deep link and fires a server-side click.
 *   2. The returned `trackingUrl` is opened in the client WebView.
 *   3. The WebView follows the awin1.com → merchant redirect, receiving the
 *      tracking cookie; the cookie persists within the WebView session so any
 *      purchase on the merchant site is attributed to your publisher account.
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
  // Only authenticated users may fire affiliate clicks; otherwise anyone could
  // pollute AWIN attribution data with server-side clicks.
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
    const { merchantId, productUrl, productId, retailer, category } = await req.json() as {
      merchantId: string | number
      productUrl: string
      productId?: string
      retailer?: string
      category?: string
    }

    if (!merchantId || !productUrl) {
      return new Response(
        JSON.stringify({ error: 'merchantId and productUrl required' }),
        { status: 400, headers: CORS }
      )
    }

    const publisherId = Deno.env.get('AWIN_PUBLISHER_ID')
    if (!publisherId) {
      return new Response(
        JSON.stringify({ error: 'AWIN_PUBLISHER_ID not set' }),
        { status: 500, headers: CORS }
      )
    }

    const trackingUrl =
      `https://www.awin1.com/cread.php` +
      `?awinmid=${merchantId}` +
      `&awinaffid=${publisherId}` +
      `&ued=${encodeURIComponent(productUrl)}`

    // Fire server-side click — records the event with AWIN
    const clickRes = await fetch(trackingUrl, {
      method: 'GET',
      redirect: 'manual', // don't follow redirect; we just need AWIN to log it
      headers: { 'User-Agent': 'WrenApp/1.0 (server-side-click)' },
    })

    const clickRecorded = clickRes.status >= 200 && clickRes.status < 400

    // Record the click for our own analytics (write-only table). Uses the
    // caller's JWT so RLS attributes the row to them. Best-effort — never fail
    // the request over analytics.
    if (productId && retailer && category) {
      const { error: insertError } = await anonClient.from('affiliate_clicks').insert({
        user_id: user.id,
        product_id: productId,
        retailer,
        category,
        merchant_id: String(merchantId),
      })
      if (insertError) console.error('affiliate_clicks insert failed:', insertError.message)
    }

    return new Response(
      JSON.stringify({
        trackingUrl,   // → open this in the client WebView
        clickRecorded,
        awinStatus: clickRes.status,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS })
  }
})
