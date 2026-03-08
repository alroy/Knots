import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBoards, createBoardWebhook, deleteMondayWebhook } from './api'

const BATCH_SIZE = 5

/**
 * Register webhooks on Monday.com boards for a connection.
 * Called after OAuth completes. Failures are logged but don't throw.
 *
 * Filters out subitems boards (can't have webhooks). For remaining boards,
 * attempts webhook creation and silently skips boards where the user lacks
 * permissions (expected for non-admin boards).
 */
export async function registerWebhooksForConnection(
  supabase: SupabaseClient,
  connectionId: string,
  accessToken: string
): Promise<void> {
  const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/monday/events`

  const allBoards = await fetchBoards(accessToken)
  if (allBoards.length === 0) {
    console.log('Monday webhook registration: no boards found')
    return
  }

  // Filter out subitems boards (can't have webhooks)
  const boards = allBoards.filter((b) => b.type === 'board')

  console.log(
    `Monday webhook registration: ${boards.length} boards (${allBoards.length - boards.length} subitems excluded)`
  )

  if (boards.length === 0) return

  let totalSucceeded = 0
  let totalDenied = 0

  for (let i = 0; i < boards.length; i += BATCH_SIZE) {
    const batch = boards.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (board) => {
        const result = await createBoardWebhook(accessToken, board.id, webhookUrl)

        if (!result.ok) {
          if (result.rateLimited) {
            throw { rateLimited: true, retryInSeconds: result.retryInSeconds }
          }
          return result.authDenied ? 'denied' : null
        }

        // Store the webhook registration
        const { error } = await supabase
          .from('monday_webhooks')
          .upsert(
            {
              connection_id: connectionId,
              board_id: board.id,
              webhook_id: result.webhookId,
            },
            { onConflict: 'connection_id,board_id' }
          )

        if (error) {
          console.error(`Failed to store webhook for board ${board.id}:`, error)
        }

        return result.webhookId
      })
    )

    // Check for rate limiting in this batch
    const rateLimitResult = results.find(
      (r) =>
        r.status === 'rejected' &&
        typeof r.reason === 'object' &&
        r.reason?.rateLimited
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'denied') totalDenied++
        else if (r.value !== null) totalSucceeded++
      }
    }

    if (rateLimitResult && rateLimitResult.status === 'rejected') {
      const waitSeconds = rateLimitResult.reason.retryInSeconds || 30
      console.log(
        `Monday rate limited, waiting ${waitSeconds}s before continuing...`
      )
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
    }
  }

  console.log(
    `Monday webhook registration complete: ${totalSucceeded} succeeded, ${totalDenied} no permission`
  )
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
