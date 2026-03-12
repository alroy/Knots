import { NextResponse } from 'next/server'
import { syncActionItems } from '@/lib/monday/sync-action-items'

/**
 * POST /api/sync/action-items
 *
 * Manual trigger to sync action items from Monday.com board.
 */
export async function POST(request: Request) {
  const syncSecret = process.env.SYNC_SECRET
  if (syncSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${syncSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const userId = process.env.AUTH_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'AUTH_USER_ID not configured' }, { status: 500 })
  }

  try {
    const result = await syncActionItems(userId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Action items sync error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
