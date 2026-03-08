import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBoards, createBoardWebhook, deleteMondayWebhook } from './api'

const BATCH_SIZE = 5

/**
 * Register webhooks on owned Monday.com boards for a connection.
 * Called after OAuth completes. Failures are logged but don't throw.
 *
 * Only registers on boards where:
 * - type is 'board' (excludes subitems boards, docs, etc.)
 * - user is the board owner (Monday only allows owners to create webhooks)
 */
export async function registerWebhooksForConnection(
  supabase: SupabaseClient,
  connectionId: string,
  accessToken: string,
  mondayUserId: string
): Promise<void> {
  const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/monday/events`

  const allBoards = await fetchBoards(accessToken)
  if (allBoards.length === 0) {
    console.log('Monday webhook registration: no boards found')
    return
  }

  // Filter to boards where user is owner and type is regular board
  const boards = allBoards.filter(
    (b) => b.type === 'board' && b.owner?.id === mondayUserId
  )

  console.log(
    `Monday webhook registration: ${boards.length} eligible boards (${allBoards.length} total)`
  )

  if (boards.length === 0) return

  let totalSucceeded = 0

  for (let i = 0; i < boards.length; i += BATCH_SIZE) {
    const batch = boards.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (board) => {
        const result = await createBoardWebhook(accessToken, board.id, webhookUrl)

        if (!result.ok) {
          if (result.rateLimited) {
            // Signal rate limit to caller — will be caught by allSettled
            throw { rateLimited: true, retryInSeconds: result.retryInSeconds }
          }
          return null
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

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value !== null
    ).length
    totalSucceeded += succeeded

    if (rateLimitResult && rateLimitResult.status === 'rejected') {
      const waitSeconds = rateLimitResult.reason.retryInSeconds || 30
      console.log(
        `Monday rate limited, waiting ${waitSeconds}s before continuing...`
      )
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
    }
  }

  console.log(
    `Monday webhook registration complete: ${totalSucceeded}/${boards.length} succeeded`
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
