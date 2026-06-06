/**
 * Delete Account (GDPR / Apple App Store 5.1.1(v)).
 *
 * Authenticates the caller, then uses the service role to erase ALL of their data
 * — Storage files first, then DB rows in dependency order, then the auth record.
 * Returns 200 only if every step succeeded; on any failure it stops and reports,
 * so the client never shows "deleted" for a partial delete.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  const userId = user.id
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // 1. Storage files under <userId>/
    const { data: files } = await admin.storage.from('items').list(userId)
    if (files && files.length > 0) {
      const paths = files.map(f => `${userId}/${f.name}`)
      const { error: rmError } = await admin.storage.from('items').remove(paths)
      if (rmError) return json({ error: `Storage cleanup failed: ${rmError.message}` }, 500)
    }

    // 2. DB rows in dependency order.
    const { data: outfitRows } = await admin.from('outfits').select('id').eq('user_id', userId)
    const outfitIds = (outfitRows ?? []).map(o => o.id as string)

    const steps: { label: string; run: () => Promise<{ error: { message: string } | null }> }[] = [
      { label: 'wears', run: () => admin.from('wears').delete().eq('user_id', userId) },
      {
        label: 'outfit_items',
        run: () =>
          outfitIds.length
            ? admin.from('outfit_items').delete().in('outfit_id', outfitIds)
            : Promise.resolve({ error: null }),
      },
      { label: 'outfits', run: () => admin.from('outfits').delete().eq('user_id', userId) },
      { label: 'milestones', run: () => admin.from('milestones').delete().eq('user_id', userId) },
      { label: 'profiles', run: () => admin.from('profiles').delete().eq('user_id', userId) },
      { label: 'affiliate_clicks', run: () => admin.from('affiliate_clicks').delete().eq('user_id', userId) },
      { label: 'items', run: () => admin.from('items').delete().eq('user_id', userId) },
    ]

    for (const step of steps) {
      const { error } = await step.run()
      if (error) return json({ error: `Failed deleting ${step.label}: ${error.message}` }, 500)
    }

    // 3. The auth user itself.
    const { error: delError } = await admin.auth.admin.deleteUser(userId)
    if (delError) return json({ error: `Failed deleting account: ${delError.message}` }, 500)

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
