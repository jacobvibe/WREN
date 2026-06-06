import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

serve(async (req) => {
  // Only the service role key may call this function.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authHeader = req.headers.get('Authorization')

  if (!authHeader || !serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: JSON_HEADERS }
    )
  }

  let body: { user_id?: string; title?: string; body?: string; nudge?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: JSON_HEADERS }
    )
  }

  const { user_id, title, body: messageBody, nudge } = body
  if (!user_id || !title || !messageBody) {
    return new Response(
      JSON.stringify({ error: 'Missing user_id, title, or body' }),
      { status: 400, headers: JSON_HEADERS }
    )
  }
  if (nudge && nudge !== 'day3' && nudge !== 'day7') {
    return new Response(
      JSON.stringify({ error: 'Invalid nudge (expected day3 or day7)' }),
      { status: 400, headers: JSON_HEADERS }
    )
  }

  // Fetch push token via service-role client (bypasses RLS).
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('expo_push_token')
    .eq('user_id', user_id)
    .single()

  if (profileError || !profile?.expo_push_token) {
    return new Response(
      JSON.stringify({ error: 'No push token for user' }),
      { status: 404, headers: JSON_HEADERS }
    )
  }

  // ── Personalisation ──────────────────────────────────────────────────────
  // Day-3 / day-7 nudges get copy tailored to the user's wardrobe (personalised
  // pushes see ~4× open rates). Every query is wrapped so any failure falls
  // through to the generic copy the caller passed in — the push must always send.
  let pushTitle = title
  let pushBody = messageBody

  if (nudge === 'day3' || nudge === 'day7') {
    try {
      const { data: items } = await adminClient
        .from('items')
        .select('category')
        .eq('user_id', user_id)

      const itemCount = items?.length ?? 0

      // Combination counts by category → tops × bottoms × max(shoes,1) + dresses
      let tops = 0, bottoms = 0, shoes = 0, dresses = 0
      for (const it of items ?? []) {
        switch ((it as { category: string }).category) {
          case 'Top': tops++; break
          case 'Bottom': bottoms++; break
          case 'Shoes': shoes++; break
          case 'Dress': dresses++; break
        }
      }
      const comboCount = tops * bottoms * Math.max(shoes, 1) + dresses

      if (nudge === 'day3' && itemCount > 0) {
        pushTitle = 'Your wardrobe is waiting'
        pushBody = `You added ${itemCount} item${itemCount === 1 ? '' : 's'} — build your first outfit.`
      } else if (nudge === 'day7' && comboCount > 0) {
        pushTitle = 'Your wardrobe has potential'
        pushBody = `${comboCount} outfit combinations — start exploring.`
      }
      // Otherwise leave the generic copy untouched.
    } catch {
      // Personalisation failed — fall through to the generic copy.
    }
  }

  const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title: pushTitle,
      body: pushBody,
      sound: 'default',
    }),
  })

  if (!pushRes.ok) {
    const text = await pushRes.text()
    return new Response(
      JSON.stringify({ error: 'Expo push failed', detail: text }),
      { status: 502, headers: JSON_HEADERS }
    )
  }

  // The HTTP 200 only means Expo accepted the request — the per-message ticket
  // can still report an error. Inspect it.
  const pushJson = await pushRes.json().catch(() => null)
  const ticket = Array.isArray(pushJson?.data) ? pushJson.data[0] : pushJson?.data

  if (ticket?.status === 'error') {
    // Dead token: stop wasting future pushes on it.
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      await adminClient
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('user_id', user_id)
    }
    return new Response(
      JSON.stringify({ ok: false, error: ticket?.message ?? 'push_ticket_error' }),
      { status: 200, headers: JSON_HEADERS }
    )
  }

  // Delivered successfully — record which nudge was sent so the cron jobs don't
  // resend it and so day-7 only follows users who received day-3.
  if (nudge === 'day3' || nudge === 'day7') {
    const column = nudge === 'day3' ? 'nudge_day3_sent_at' : 'nudge_day7_sent_at'
    await adminClient
      .from('profiles')
      .update({ [column]: new Date().toISOString() })
      .eq('user_id', user_id)
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: JSON_HEADERS }
  )
})
