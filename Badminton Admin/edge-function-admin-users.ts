// ═══════════════════════════════════════════════════════════════════════════
// Edge Function: admin-users
//
// Creates, deletes and re-passwords host accounts.
//
// WHY THIS EXISTS: creating a user requires the service_role key, which
// bypasses every RLS policy. That key must never reach a browser. It lives
// here, inside Supabase, injected from the environment. The dashboard calls
// this function with the ADMIN'S OWN login token; this function checks that
// token belongs to an admin before it does anything at all.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function
//         Name it exactly:  admin-users
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const URL  = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SVC  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // ── 1. Who is calling? ──────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in.' }, 401)

  const caller = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userErr } = await caller.auth.getUser()
  if (userErr || !user) return json({ error: 'Invalid session.' }, 401)

  // ── 2. Are they an admin? ───────────────────────────────────────────────
  // Read through the CALLER's client, so RLS applies. A non-admin can only
  // ever read their own row, and that row will say is_admin = false.
  const { data: self } = await caller
    .from('hosts').select('is_admin, suspended').eq('id', user.id).single()

  if (!self?.is_admin || self.suspended)
    return json({ error: 'Not an admin.' }, 403)

  // ── 3. Only now do we touch the privileged key ──────────────────────────
  const admin = createClient(URL, SVC, { auth: { persistSession: false } })

  let body: Record<string, string>
  try { body = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }

  const action = body.action
  const log = async (act: string, target: string | null, detail: unknown) => {
    await admin.from('audit_log').insert({
      actor: user.id, actor_email: user.email, action: act,
      target_host: target, detail,
    })
  }

  try {
    // ── CREATE ────────────────────────────────────────────────────────────
    if (action === 'create') {
      const email = (body.email ?? '').trim().toLowerCase()
      const password = body.password ?? ''
      if (!email.includes('@')) return json({ error: 'That is not an email address.' }, 400)
      if (password.length < 8)  return json({ error: 'Password must be at least 8 characters.' }, 400)

      const { data, error } = await admin.auth.admin.createUser({
        email, password,
        email_confirm: true,                 // no confirmation email needed
        user_metadata: { created_by: 'admin' },
      })
      if (error) return json({ error: error.message }, 400)

      const id = data.user!.id

      // The signup trigger has already made the hosts + entitlements rows.
      if (body.display_name)
        await admin.from('hosts').update({ display_name: body.display_name }).eq('id', id)

      // Optional starting plan, otherwise the trigger's 14-day trial stands.
      // 'life' is active with NO expiry -- is_premium() treats a null expiry
      // as never-expiring, which is exactly what lifetime means.
      if (body.plan && body.plan !== 'trial') {
        const days = body.plan === 'year' ? 365 : body.plan === 'month' ? 30 : null
        const lifetime = body.plan === 'life'
        await admin.from('entitlements').upsert({
          host_id: id,
          status: (days || lifetime) ? 'active' : 'free',
          expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null,
          source: lifetime ? 'admin:lifetime' : 'admin:created',
          updated_at: new Date().toISOString(),
        })
      }

      await log('host.create', id, { email, plan: body.plan ?? 'trial' })
      return json({ ok: true, id, email })
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    // Permanently removes the account and, by cascade, all of its data.
    if (action === 'delete') {
      const id = body.id
      if (!id) return json({ error: 'Missing id.' }, 400)
      if (id === user.id) return json({ error: 'You cannot delete your own account.' }, 400)

      const { data: target } = await admin
        .from('hosts').select('email, is_admin').eq('id', id).single()
      if (target?.is_admin)
        return json({ error: 'Remove admin rights before deleting that account.' }, 400)

      await log('host.delete', null, { email: target?.email, id })

      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    // ── RESET PASSWORD ────────────────────────────────────────────────────
    if (action === 'password') {
      const { id, password } = body
      if (!id) return json({ error: 'Missing id.' }, 400)
      if ((password ?? '').length < 8)
        return json({ error: 'Password must be at least 8 characters.' }, 400)

      const { error } = await admin.auth.admin.updateUserById(id, { password })
      if (error) return json({ error: error.message }, 400)

      await log('host.password', id, {})
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)

  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
