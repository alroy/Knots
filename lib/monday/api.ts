/**
 * Monday.com GraphQL API client
 */

const MONDAY_API_URL = 'https://api.monday.com/v2'

interface GraphQLResponse<T = any> {
  data?: T
  errors?: Array<{ message: string; extensions?: Record<string, any> }>
  account_id?: number
}

/**
 * Execute a Monday.com GraphQL query
 */
async function mondayQuery<T = any>(
  token: string,
  query: string,
  variables?: Record<string, any>
): Promise<GraphQLResponse<T>> {
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  })

  return response.json()
}

/**
 * Monday.com user info
 */
export interface MondayUser {
  id: string
  name: string
  email: string
  account: {
    id: string
  }
}

/**
 * Fetch the current authenticated user
 */
export async function fetchCurrentUser(token: string): Promise<MondayUser | null> {
  const result = await mondayQuery<{ me: MondayUser }>(
    token,
    `query { me { id name email account { id } } }`
  )

  if (result.errors || !result.data?.me) {
    console.error('Failed to fetch Monday user:', result.errors)
    return null
  }

  return result.data.me
}

/**
 * Monday.com item details
 */
export interface MondayItem {
  id: string
  name: string
  url: string
  board: {
    id: string
    name: string
  }
  group?: {
    id: string
    title: string
  }
  column_values: Array<{
    id: string
    type: string
    text: string
    value: string | null
  }>
}

/**
 * Fetch item details by ID
 */
export async function fetchItem(
  token: string,
  itemId: string
): Promise<MondayItem | null> {
  const result = await mondayQuery<{ items: MondayItem[] }>(
    token,
    `query ($ids: [ID!]!) {
      items(ids: $ids) {
        id
        name
        url
        board { id name }
        group { id title }
        column_values {
          id
          type
          text
          value
        }
      }
    }`,
    { ids: [itemId] }
  )

  if (result.errors || !result.data?.items?.[0]) {
    console.error('Failed to fetch Monday item:', result.errors)
    return null
  }

  return result.data.items[0]
}

/**
 * Extract person IDs from a Monday item's Person column values
 * Person columns store assigned user IDs
 */
export function extractAssigneeIds(item: MondayItem): string[] {
  const personColumns = item.column_values.filter(
    (col) => col.type === 'people' || col.type === 'multiple-person'
  )

  const ids: string[] = []
  for (const col of personColumns) {
    if (!col.value) continue
    try {
      const parsed = JSON.parse(col.value)
      // Monday stores people as { personsAndTeams: [{ id, kind }] }
      const persons = parsed?.personsAndTeams || []
      for (const p of persons) {
        if (p.kind === 'person' && p.id) {
          ids.push(String(p.id))
        }
      }
    } catch {
      // Skip malformed values
    }
  }

  return ids
}

/**
 * Board info
 */
export interface MondayBoard {
  id: string
  name: string
  type: string
}

/**
 * Fetch all boards accessible to the authenticated user
 */
export async function fetchBoards(token: string): Promise<MondayBoard[]> {
  const allBoards: MondayBoard[] = []
  let page = 1

  // Paginate — Monday returns up to 500 boards per page
  while (true) {
    const result = await mondayQuery<{ boards: MondayBoard[] }>(
      token,
      `query ($page: Int!) { boards(limit: 500, page: $page) { id name type } }`,
      { page }
    )

    if (result.errors || !result.data?.boards?.length) break
    allBoards.push(...result.data.boards)
    if (result.data.boards.length < 500) break
    page++
  }

  return allBoards
}

/**
 * Activity log entry from Monday.com
 */
export interface MondayActivityLog {
  id: string
  event: string
  data: string // JSON string
  created_at: string // Unix timestamp as string (e.g. "17098...")
}

/**
 * Fetch activity logs for a board, filtered to person-column changes.
 * `from` is an ISO 8601 string (e.g. "2026-03-08T00:00:00Z").
 */
export async function fetchActivityLogs(
  token: string,
  boardId: string,
  from: string
): Promise<MondayActivityLog[]> {
  const result = await mondayQuery<{ boards: Array<{ activity_logs: MondayActivityLog[] }> }>(
    token,
    `query ($ids: [ID!]!, $from: ISO8601DateTime!) {
      boards(ids: $ids) {
        activity_logs(from: $from, column_ids: ["person", "people"], limit: 100) {
          id
          event
          data
          created_at
        }
      }
    }`,
    { ids: [boardId], from }
  )

  if (result.errors || !result.data?.boards?.[0]) {
    // Don't log expected errors (e.g. board access revoked)
    return []
  }

  return result.data.boards[0].activity_logs || []
}

/**
 * Build a human-readable description from a Monday item
 */
export function buildItemDescription(item: MondayItem): string {
  const parts: string[] = []

  if (item.board?.name) {
    parts.push(`Board: ${item.board.name}`)
  }
  if (item.group?.title) {
    parts.push(`Group: ${item.group.title}`)
  }

  return parts.join(' · ')
}

/**
 * Delete a webhook subscription from Monday.com
 */
export async function deleteMondayWebhook(
  token: string,
  webhookId: string
): Promise<boolean> {
  const result = await mondayQuery<{ delete_webhook: { id: string } }>(
    token,
    `mutation ($webhookId: ID!) {
      delete_webhook(id: $webhookId) { id }
    }`,
    { webhookId }
  )

  if (result.errors) {
    console.error(`Failed to delete webhook ${webhookId}:`, result.errors)
    return false
  }

  return true
}
