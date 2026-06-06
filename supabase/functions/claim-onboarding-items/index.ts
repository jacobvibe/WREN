import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  // Verify the *new* (permanent) account's JWT.
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  let body: { fromUserId?: string; sessionToken?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const { fromUserId, sessionToken } = body
  if (!fromUserId || !sessionToken) {
    return json({ error: 'fromUserId and sessionToken required' }, 400)
  }

  // Reassign ONLY the rows belonging to this exact onboarding session. Matching
  // on both the anonymous user id and the random session token makes it
  // impossible for one sign-up to claim another's items (fixes the race where
  // a time-window query could grab a concurrent user's rows).
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await adminClient
    .from('items')
    .update({ user_id: user.id, session_token: null })
    .eq('user_id', fromUserId)
    .eq('session_token', sessionToken)
    .select('id')

  if (error) return json({ error: error.message }, 500)

  return json({ claimed: data?.length ?? 0 })
})
