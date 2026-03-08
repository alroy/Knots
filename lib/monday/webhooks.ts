import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBoards, createBoardWebhook, deleteMondayWebhook } from './api'

const BATCH_SIZE = 5

/**
 * Register webhooks on all accessible Monday.com boards for a connection.
 * Called after OAuth completes. Failures are logged but don't throw.
 */
export async function registerWebhooksForConnection(
  supabase: SupabaseClient,
  connectionId: string,
  accessToken: string
): Promise<void> {
  const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/monday/events`

  const boards = await fetchBoards(accessToken)
  if (boards.length === 0) {
    console.log('Monday webhook registration: no boards found')
    return
  }

  console.log(`Monday webhook registration: ${boards.length} boards found`)

  // Process in batches to avoid rate limits
  for (let i = 0; i < boards.length; i += BATCH_SIZE) {
    const batch = boards.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (board) => {
        const webhook = await createBoardWebhook(accessToken, board.id, webhookUrl)
        if (!webhook) return null

        // Store the webhook registration
        const { error } = await supabase
          .from('monday_webhooks')
          .upsert(
            {
              connection_id: connectionId,
              board_id: board.id,
              webhook_id: webhook.id,
            },
            { onConflict: 'connection_id,board_id' }
          )

        if (error) {
          console.error(`Failed to store webhook for board ${board.id}:`, error)
        }

        return webhook.id
      })
    )

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value !== null
    ).length
    console.log(
      `Monday webhook batch ${Math.floor(i / BATCH_SIZE) + 1}: ${succeeded}/${batch.length} succeeded`
    )
  }
}

/**
 * Delete all webhooks for a connection from Monday.com and the database.
 */
export async function deleteWebhooksForConnection(
  supabase: SupabaseClient,
  connectionId: string,
  accessToken: string
): Promise<void> {
  const { data: webhooks } = await supabase
    .from('monday_webhooks')
    .select('id, webhook_id')
    .eq('connection_id', connectionId)

  if (webhooks && webhooks.length > 0) {
    // Delete from Monday.com (best-effort)
    await Promise.allSettled(
      webhooks.map((w) => deleteMondayWebhook(accessToken, w.webhook_id))
    )
  }

  // Always clean up local records
  await supabase
    .from('monday_webhooks')
    .delete()
    .eq('connection_id', connectionId)
}
