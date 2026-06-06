import { supabase } from './supabase'

/**
 * Guarantees there is a Supabase session before the pre-auth onboarding flow runs.
 *
 * WHY: The AI Edge Functions (remove-bg, vision-tag) and the items table RLS all
 * require an authenticated user. Onboarding lets people add a real item *before*
 * choosing Apple/Google sign-in, so we sign them in anonymously first. An
 * anonymous user has a real JWT and user id, so:
 *   - remove-bg / vision-tag accept the call (the bare anon *key* does not — it
 *     has no user, which is exactly the abuse we want to block), and
 *   - items insert under the anon user's id via the users_insert_own RLS policy.
 *
 * On Apple/Google sign-in the anon user's items are reassigned to the permanent
 * account by claim-onboarding-items (matched on the onboarding session token).
 *
 * Idempotent: if a session already exists (anonymous or permanent) it is reused.
 *
 * Requires "Anonymous sign-ins" to be enabled in the Supabase dashboard
 * (Authentication → Providers → Anonymous). See AUDIT_REPORT.md.
 */
export async function ensureAnonSession(): Promise<{ userId: string | null; error: Error | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    return { userId: session.user.id, error: null }
  }

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    return { userId: null, error }
  }
  return { userId: data.user?.id ?? null, error: null }
}
