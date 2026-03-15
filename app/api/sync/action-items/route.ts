import { NextResponse } from 'next/server'
import createClient from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { syncActionItems } from '@/lib/monday/sync-action-items'

/**
 * POST /api/sync/action-items
 *
 * Manual trigger to sync action items from Monday.com board.
 * Uses the authenticated user's monday_connections row,
 * falling back to AUTH_USER_ID + MONDAY_API_KEY env vars.
 */
export async function POST(request: Request) {
  // Check for sync secret (optional auth for programmatic callers)
  const syncSecret = process.env.SYNC_SECRET
  const authHeader = request.headers.get('authorization')
  const hasSyncSecret = syncSecret && authHeader === `Bearer ${syncSecret}`

  // Get the authenticated user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Must be either authenticated or have sync secret
  if (!user && !hasSyncSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user?.id || process.env.AUTH_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'No user context available' }, { status: 500 })
  }

  try {
    // Look up per-user Monday connection
    const admin = createAdminClient()
    const { data: conn } = await admin
      .from('monday_connections')
      .select('api_key, board_id')
      .eq('user_id', userId)
      .maybeSingle()

    const connectionParams = conn
      ? { apiKey: conn.api_key, boardId: conn.board_id }
      : undefined

    const result = await syncActionItems(userId, connectionParams)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Action items sync error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
