import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { deleteMondayWebhook } from '@/lib/monday/api'

/**
 * One-time cleanup endpoint: delete old Monday.com webhooks
 * that were created via the API before switching to polling.
 *
 * Protected by CRON_SECRET. Call once, then this endpoint can be removed.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Fetch all stored webhook records
  const { data: webhooks, error } = await supabase
    .from('monday_webhooks')
    .select('id, connection_id, board_id, webhook_id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!webhooks?.length) {
    return NextResponse.json({ message: 'No webhooks to clean up' })
  }

  // Get access tokens for the connections
  const connectionIds = [...new Set(webhooks.map((w) => w.connection_id))]
  const { data: connections } = await supabase
    .from('monday_connections')
    .select('id, access_token')
    .in('id', connectionIds)

  const tokenMap = new Map(connections?.map((c) => [c.id, c.access_token]) ?? [])

  const results = []

  for (const wh of webhooks) {
    const token = tokenMap.get(wh.connection_id)
    if (!token) {
      results.push({ webhookId: wh.webhook_id, status: 'no_token' })
      continue
    }

    const deleted = await deleteMondayWebhook(token, wh.webhook_id)

    // Remove from our table regardless (webhook may already be gone on Monday's side)
    await supabase.from('monday_webhooks').delete().eq('id', wh.id)

    results.push({
      webhookId: wh.webhook_id,
      boardId: wh.board_id,
      status: deleted ? 'deleted' : 'failed_but_removed',
    })
  }

  console.log('Monday webhook cleanup results:', results)
  return NextResponse.json({ message: `Cleaned up ${webhooks.length} webhooks`, results })
}
