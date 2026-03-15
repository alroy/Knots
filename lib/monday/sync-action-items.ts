import 'server-only'

import { createAdminClient } from '@/lib/supabase-admin'
import { fetchMondayItems, type MondayConnectionParams } from '@/lib/monday/sync'

export interface SyncResult {
  ok: boolean
  synced: number
  skipped: number
  message?: string
}

/**
 * Sync action items from Monday.com into the Supabase action_items table.
 *
 * Deduplicates by monday_item_id (primary) with message_link fallback
 * for rows that pre-date the monday_item_id column.
 * Records the sync timestamp in the sync_state table.
 */
export async function syncActionItems(userId: string, connectionParams?: MondayConnectionParams): Promise<SyncResult> {
  const mondayItems = await fetchMondayItems(connectionParams)

  if (mondayItems.length === 0) {
    return { ok: true, synced: 0, skipped: 0, message: 'No items on board' }
  }

  const supabase = createAdminClient()

  // Fetch existing dedup keys in a single query
  const { data: existing, error: fetchError } = await supabase
    .from('action_items')
    .select('monday_item_id, message_link')
    .eq('user_id', userId)

  if (fetchError) throw fetchError

  const existingMondayIds = new Set(
    (existing || []).filter(r => r.monday_item_id).map(r => r.monday_item_id)
  )
  const existingLinks = new Set(
    (existing || []).filter(r => r.message_link).map(r => r.message_link)
  )

  // An item is new if its monday_item_id is not in the table,
  // AND its message_link (if present) is not in the table either.
  const newItems = mondayItems.filter(item => {
    if (existingMondayIds.has(item.mondayItemId)) return false
    if (item.messageLink && existingLinks.has(item.messageLink)) return false
    return true
  })

  if (newItems.length === 0) {
    return { ok: true, synced: 0, skipped: mondayItems.length }
  }

  const rows = newItems.map(item => ({
    user_id: userId,
    monday_item_id: item.mondayItemId,
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

  // Record sync completion
  await supabase
    .from('sync_state')
    .upsert(
      {
        user_id: userId,
        sync_key: 'monday_action_items',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,sync_key' }
    )

  return {
    ok: true,
    synced: newItems.length,
    skipped: mondayItems.length - newItems.length,
  }
}
