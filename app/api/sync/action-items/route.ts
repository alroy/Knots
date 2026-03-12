import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchMondayItems } from '@/lib/monday/sync'

/**
 * POST /api/sync/action-items
 *
 * Syncs action items from Monday.com board into the Supabase action_items table.
 * Deduplicates by message_link to avoid inserting the same item twice.
 *
 * Requires:
 * - MONDAY_API_KEY env var
 * - SUPABASE_SERVICE_ROLE_KEY env var
 * - AUTH_USER_ID env var (the user to associate items with)
 *
 * Can be called manually, on a schedule, or on app startup.
 */
export async function POST(request: Request) {
  // Verify sync secret to prevent unauthorized calls
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
    // 1. Fetch items from Monday.com
    const mondayItems = await fetchMondayItems()

    if (mondayItems.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, skipped: 0, message: 'No items found on Monday.com board' })
    }

    // 2. Get existing message_links from Supabase for deduplication
    const supabase = createAdminClient()
    const { data: existing, error: fetchError } = await supabase
      .from('action_items')
      .select('message_link')
      .eq('user_id', userId)
      .not('message_link', 'is', null)

    if (fetchError) throw fetchError

    const existingLinks = new Set((existing || []).map(r => r.message_link))

    // 3. Filter to new items only (not already in Supabase)
    const newItems = mondayItems.filter(item =>
      item.messageLink && !existingLinks.has(item.messageLink)
    )

    // Also include items without a message_link (can't dedupe, but still want them)
    const noLinkItems = mondayItems.filter(item => !item.messageLink)

    const toInsert = [...newItems, ...noLinkItems]

    if (toInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        synced: 0,
        skipped: mondayItems.length,
        message: 'All items already synced',
      })
    }

    // 4. Insert new items
    const rows = toInsert.map(item => ({
      user_id: userId,
      action_item: item.actionItem,
      source: item.source,
      source_channel: item.sourceChannel,
      message_from: item.messageFrom,
      message_link: item.messageLink,
      message_timestamp: item.messageTimestamp,
      status: item.status,
      raw_context: item.rawContext,
      scan_timestamp: item.scanTimestamp || new Date().toISOString(),
    }))

    const { error: insertError } = await supabase
      .from('action_items')
      .insert(rows)

    if (insertError) throw insertError

    return NextResponse.json({
      ok: true,
      synced: toInsert.length,
      skipped: mondayItems.length - toInsert.length,
    })
  } catch (error) {
    console.error('Action items sync error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
