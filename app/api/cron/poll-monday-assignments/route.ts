import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  fetchBoards,
  fetchActivityLogs,
  fetchItem,
  buildItemDescription,
} from '@/lib/monday/api'
import { createTaskFromSource } from '@/lib/slack/ingest/create-task'
import { linkTaskToGoal } from '@/lib/slack/ingest/link-goal'
import type { TaskFromSourceInput } from '@/lib/slack/ingest/types'

/**
 * Cron endpoint: Poll Monday.com activity logs for new assignments
 *
 * Runs every 5 minutes via Vercel Cron. For each active Monday connection:
 * 1. Fetches all accessible boards
 * 2. Queries activity logs for person-column changes since last poll
 * 3. Finds items where the connected user was newly assigned
 * 4. Creates tasks (with deduplication)
 */
export async function GET(request: Request) {
  if (process.env.MONDAY_FEATURE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Monday.com integration disabled' }, { status: 404 })
  }

  // Verify cron authorization
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Fetch all active Monday connections
  const { data: connections, error: connError } = await supabase
    .from('monday_connections')
    .select('id, user_id, account_id, monday_user_id, access_token, last_poll_at')
    .is('revoked_at', null)

  if (connError || !connections?.length) {
    return NextResponse.json({
      message: 'No active Monday connections',
      error: connError?.message,
    })
  }

  const results: Array<{
    userId: string
    boardsPolled: number
    logsChecked: number
    tasksCreated: number
    errors: string[]
  }> = []

  for (const conn of connections) {
    const result = {
      userId: conn.user_id,
      boardsPolled: 0,
      logsChecked: 0,
      tasksCreated: 0,
      errors: [] as string[],
    }

    try {
      // Default to 10 minutes ago if never polled
      const from = conn.last_poll_at || new Date(Date.now() - 10 * 60 * 1000).toISOString()

      // Fetch all accessible boards (skip subitems boards)
      const boards = await fetchBoards(conn.access_token)
      const mainBoards = boards.filter((b) => b.type !== 'sub_items_board')
      result.boardsPolled = mainBoards.length
      console.log(`[monday-poll] User ${conn.user_id}: polling ${mainBoards.length} boards since ${from}`)

      // Track item IDs we've already seen to avoid duplicates within a single poll
      const processedItemIds = new Set<string>()

      // Process boards in batches of 10 to stay within rate limits
      for (let i = 0; i < mainBoards.length; i += 10) {
        const batch = mainBoards.slice(i, i + 10)
        const logResults = await Promise.all(
          batch.map(async (board) => {
            try {
              const logs = await fetchActivityLogs(conn.access_token, board.id, from)
              return { board, logs }
            } catch (err: any) {
              result.errors.push(`Board ${board.id}: ${err.message}`)
              return { board, logs: [] }
            }
          })
        )

        for (const { board, logs } of logResults) {
          for (const log of logs) {
            result.logsChecked++

            // Parse the data JSON to find assignment changes
            let data: any
            try {
              data = JSON.parse(log.data)
            } catch {
              continue
            }

            // The data contains pulse_id (item ID) and value with personsAndTeams
            const pulseId = data.pulse_id || data.item_id
            if (!pulseId) continue

            const itemId = String(pulseId)
            if (processedItemIds.has(itemId)) continue

            // Check if the connected user was added in the new value
            const newValue = data.value || {}
            const persons = newValue.personsAndTeams || []
            const wasAssigned = persons.some(
              (p: any) => p.kind === 'person' && String(p.id) === conn.monday_user_id
            )

            // Also check previous value to see if this is a NEW assignment
            const prevValue = data.previous_value || {}
            const prevPersons = prevValue.personsAndTeams || []
            const wasAlreadyAssigned = prevPersons.some(
              (p: any) => p.kind === 'person' && String(p.id) === conn.monday_user_id
            )

            if (!wasAssigned || wasAlreadyAssigned) continue

            processedItemIds.add(itemId)
            console.log(`[monday-poll] New assignment detected: item ${itemId} on board ${board.id} (${board.name})`)

            // Fetch full item details
            const item = await fetchItem(conn.access_token, itemId)
            if (!item) {
              result.errors.push(`Item ${itemId}: fetch failed`)
              continue
            }

            const description = buildItemDescription(item)
            const sourceId = `${conn.account_id}:${board.id}:${item.id}`

            const taskInput: TaskFromSourceInput = {
              user_id: conn.user_id,
              title: item.name,
              description,
              source_type: 'monday',
              source_id: sourceId,
              source_url: item.url,
              ingest_trigger: 'assignment',
            }

            const createResult = await createTaskFromSource(supabase, taskInput)
            console.log(`[monday-poll] Task creation result for "${item.name}":`, {
              success: createResult.success,
              deduped: createResult.deduped,
              taskId: createResult.taskId,
            })

            if (createResult.success && !createResult.deduped && createResult.taskId) {
              result.tasksCreated++

              // Fire-and-forget goal linking
              linkTaskToGoal(supabase, createResult.taskId, conn.user_id, item.name, description)
                .catch((err) => console.error('Goal linking failed:', err))
            }
          }
        }
      }

      // Update watermark
      await supabase
        .from('monday_connections')
        .update({ last_poll_at: new Date().toISOString() })
        .eq('id', conn.id)
    } catch (err: any) {
      result.errors.push(`Connection error: ${err.message}`)
    }

    results.push(result)
  }

  const totalCreated = results.reduce((sum, r) => sum + r.tasksCreated, 0)
  const totalLogs = results.reduce((sum, r) => sum + r.logsChecked, 0)

  console.log(`[monday-poll] Done: ${connections.length} connection(s), ${totalLogs} logs, ${totalCreated} tasks created`)

  return NextResponse.json({
    message: `Polled ${connections.length} connection(s). Checked ${totalLogs} activity logs, created ${totalCreated} tasks.`,
    results,
  })
}
