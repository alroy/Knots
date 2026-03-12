import { NextResponse } from 'next/server'
import { syncActionItems } from '@/lib/monday/sync-action-items'

/**
 * Cron endpoint: Sync action items from Monday.com board.
 * Runs every 30 minutes via Vercel Cron.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = process.env.AUTH_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'AUTH_USER_ID not configured' }, { status: 500 })
  }

  try {
    const result = await syncActionItems(userId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Action items cron sync error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
