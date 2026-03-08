import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-admin'
import { deleteWebhooksForConnection } from '@/lib/monday/webhooks'

/**
 * Disconnect Monday.com integration
 * Cleans up webhooks from Monday.com, then revokes the connection.
 */
export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const adminSupabase = createAdminClient()

  // Fetch the active connection
  const { data: connection, error: fetchError } = await adminSupabase
    .from('monday_connections')
    .select('id, access_token')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .maybeSingle()

  if (fetchError) {
    console.error('Error fetching Monday connection:', fetchError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (!connection) {
    return NextResponse.json({ ok: true, message: 'No active connection' })
  }

  // Clean up webhooks from Monday.com
  await deleteWebhooksForConnection(
    adminSupabase,
    connection.id,
    connection.access_token
  ).catch((err) => console.error('Monday webhook cleanup failed:', err))

  // Revoke the connection
  const { error: updateError } = await adminSupabase
    .from('monday_connections')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', connection.id)

  if (updateError) {
    console.error('Error revoking Monday connection:', updateError)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
