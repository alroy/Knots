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
 * Board info returned by fetchBoards
 */
export interface MondayBoard {
  id: string
  name: string
  type: string
}

/**
 * Fetch all boards accessible to the authenticated user
 */
export async function fetchBoards(
  token: string
): Promise<MondayBoard[]> {
  const result = await mondayQuery<{ boards: MondayBoard[] }>(
    token,
    `query { boards(limit: 200) { id name type } }`
  )

  if (result.errors || !result.data?.boards) {
    console.error('Failed to fetch Monday boards:', result.errors)
    return []
  }

  return result.data.boards
}

/**
 * Result from createBoardWebhook
 */
export type WebhookCreateResult =
  | { ok: true; webhookId: string; boardId: string }
  | { ok: false; rateLimited: true; retryInSeconds: number }
  | { ok: false; rateLimited: false; authDenied: boolean }

/**
 * Create a webhook subscription on a Monday.com board
 */
export async function createBoardWebhook(
  token: string,
  boardId: string,
  url: string
): Promise<WebhookCreateResult> {
  const result = await mondayQuery<{
    create_webhook: { id: string; board_id: string }
  }>(
    token,
    `mutation ($boardId: ID!, $url: String!, $event: WebhookEventType!) {
      create_webhook(board_id: $boardId, url: $url, event: $event) {
        id
        board_id
      }
    }`,
    { boardId, url, event: 'change_column_value' }
  )

  if (result.errors) {
    const rateLimitError = result.errors.find(
      (e) => e.extensions?.code === 'COMPLEXITY_BUDGET_EXHAUSTED'
    )
    if (rateLimitError) {
      return {
        ok: false,
        rateLimited: true,
        retryInSeconds: rateLimitError.extensions?.retry_in_seconds ?? 30,
      }
    }

    // Expected errors: user lacks permissions or board is a subitems board
    const expectedCodes = ['UserUnauthorizedException', 'InvalidArgumentException']
    const isExpected = result.errors.every(
      (e) => expectedCodes.includes(e.extensions?.code)
    )
    if (isExpected) {
      return { ok: false, rateLimited: false, authDenied: true }
    }

    console.error(`Failed to create webhook for board ${boardId}:`, result.errors)
    return { ok: false, rateLimited: false, authDenied: false }
  }

  if (!result.data?.create_webhook) {
    return { ok: false, rateLimited: false, authDenied: false }
  }

  return {
    ok: true,
    webhookId: result.data.create_webhook.id,
    boardId: result.data.create_webhook.board_id,
  }
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
      delete_webhook(id: $webhookId) {
        id
      }
    }`,
    { webhookId }
  )

  if (result.errors) {
    console.error(`Failed to delete webhook ${webhookId}:`, result.errors)
    return false
  }

  return true
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
