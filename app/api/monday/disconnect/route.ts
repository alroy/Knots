import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * Disconnect Monday.com integration
 * Revokes the connection by setting revoked_at.
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

  // Revoke the active connection
  const { error: updateError } = await adminSupabase
    .from('monday_connections')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('revoked_at', null)

  if (updateError) {
    console.error('Error revoking Monday connection:', updateError)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
