import { NextResponse } from 'next/server'
import createClient from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { updateMondayItemStatus } from '@/lib/monday/sync'

/**
 * POST /api/monday/update-status
 *
 * Updates the Status column of a Monday.com item.
 * Body: { mondayItemId: string, status: 'Done' | 'Dismissed' }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.MONDAY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Monday.com integration is not configured' }, { status: 500 })
  }

  const { mondayItemId, status } = await request.json()
  if (!mondayItemId || !['Done', 'Dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid mondayItemId or status' }, { status: 400 })
  }

  try {
    // Look up per-user board ID
    const admin = createAdminClient()
    const { data: conn } = await admin
      .from('monday_connections')
      .select('board_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const connectionParams = conn
      ? { apiKey, boardId: conn.board_id }
      : { apiKey, boardId: '' }

    await updateMondayItemStatus(mondayItemId, status, connectionParams)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Monday status update error:', err)
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 502 })
  }
}
