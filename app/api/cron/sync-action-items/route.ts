import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { syncActionItems } from '@/lib/monday/sync-action-items'

/**
 * Cron endpoint: Sync action items from Monday.com boards.
 * Runs every 30 minutes via Vercel Cron.
 *
 * Iterates all users with a monday_connections row.
 * Falls back to AUTH_USER_ID + MONDAY_API_KEY env vars if no connections exist.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const results: { userId: string; result?: any; error?: string }[] = []

  // Try per-user connections from DB first
  const { data: connections, error: connError } = await supabase
    .from('monday_connections')
    .select('user_id, board_id')

  if (connError) {
    // Table may not exist yet — fall through to env var fallback
    console.error('Error fetching monday_connections:', connError.message)
  }

  const sharedApiKey = process.env.MONDAY_API_KEY

  if (connections && connections.length > 0 && sharedApiKey) {
    // Multi-user: sync each user's board using the shared API key
    for (const conn of connections) {
      try {
        const result = await syncActionItems(conn.user_id, {
          apiKey: sharedApiKey,
          boardId: conn.board_id,
        })
        results.push({ userId: conn.user_id, result })
      } catch (error) {
        console.error(`Sync error for user ${conn.user_id}:`, error)
        results.push({ userId: conn.user_id, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  // Env var fallback: sync for AUTH_USER_ID if no DB connection exists for that user
  const fallbackUserId = process.env.AUTH_USER_ID
  if (fallbackUserId) {
    const alreadySynced = results.some(r => r.userId === fallbackUserId)
    if (!alreadySynced) {
      try {
        const result = await syncActionItems(fallbackUserId)
        results.push({ userId: fallbackUserId, result })
      } catch (error) {
        console.error('Action items cron sync error (env var fallback):', error)
        results.push({ userId: fallbackUserId, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ error: 'No Monday.com connections configured' }, { status: 500 })
  }

  return NextResponse.json({ results })
}
