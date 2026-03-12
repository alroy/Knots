import 'server-only'

const MONDAY_BOARD_ID = '18403632593'

/** Column IDs on the Monday.com "Action Items" board */
const COLUMNS = {
  source: 'color_mm1cpn7a',
  sourceChannel: 'text_mm1cm1s8',
  messageFrom: 'text_mm1cfnw',
  messageLink: 'link_mm1cypt5',
  messageTimestamp: 'date_mm1cdmjs',
  status: 'color_mm1ccgck',
  rawContext: 'long_text_mm1c7cjw',
  scanTimestamp: 'date_mm1c61w2',
} as const

interface MondayItem {
  id: string
  name: string
  column_values: {
    id: string
    text: string
    value: string | null
  }[]
}

interface MondayResponse {
  data?: {
    boards?: {
      items_page?: {
        cursor?: string | null
        items: MondayItem[]
      }
    }[]
  }
  errors?: { message: string }[]
}

export interface ParsedActionItem {
  mondayItemId: string
  actionItem: string
  source: 'slack' | 'granola'
  sourceChannel: string | null
  messageFrom: string | null
  messageLink: string | null
  messageTimestamp: string | null
  status: 'new' | 'done' | 'dismissed'
  rawContext: string | null
  scanTimestamp: string | null
}

function getColumnText(item: MondayItem, columnId: string): string | null {
  const col = item.column_values.find(c => c.id === columnId)
  return col?.text || null
}

function getColumnLink(item: MondayItem, columnId: string): string | null {
  const col = item.column_values.find(c => c.id === columnId)
  if (!col?.value) return null
  try {
    const parsed = JSON.parse(col.value)
    return parsed.url || null
  } catch {
    // Fall back to text representation
    return col.text || null
  }
}

function getColumnDate(item: MondayItem, columnId: string): string | null {
  const col = item.column_values.find(c => c.id === columnId)
  if (!col?.text) return null
  // Monday.com returns dates as "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss"
  // Convert to ISO timestamp
  try {
    const d = new Date(col.text)
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch {
    return null
  }
}

function getColumnStatus(item: MondayItem, columnId: string): string | null {
  const col = item.column_values.find(c => c.id === columnId)
  // Status columns return the label text (e.g., "new", "done", "dismissed")
  return col?.text?.toLowerCase() || null
}

function getLongText(item: MondayItem, columnId: string): string | null {
  const col = item.column_values.find(c => c.id === columnId)
  if (!col?.value) return col?.text || null
  try {
    const parsed = JSON.parse(col.value)
    return parsed.text || col.text || null
  } catch {
    return col.text || null
  }
}

function parseSource(text: string | null): 'slack' | 'granola' {
  if (text?.toLowerCase() === 'granola') return 'granola'
  return 'slack'
}

function parseStatus(text: string | null): 'new' | 'done' | 'dismissed' {
  if (text === 'done') return 'done'
  if (text === 'dismissed') return 'dismissed'
  return 'new'
}

function parseMondayItem(item: MondayItem): ParsedActionItem {
  return {
    mondayItemId: item.id,
    actionItem: item.name,
    source: parseSource(getColumnStatus(item, COLUMNS.source)),
    sourceChannel: getColumnText(item, COLUMNS.sourceChannel),
    messageFrom: getColumnText(item, COLUMNS.messageFrom),
    messageLink: getColumnLink(item, COLUMNS.messageLink),
    messageTimestamp: getColumnDate(item, COLUMNS.messageTimestamp),
    status: parseStatus(getColumnStatus(item, COLUMNS.status)),
    rawContext: getLongText(item, COLUMNS.rawContext),
    scanTimestamp: getColumnDate(item, COLUMNS.scanTimestamp),
  }
}

/**
 * Fetch action items from the Monday.com board.
 * Queries for items (optionally filtering by status).
 */
export async function fetchMondayItems(): Promise<ParsedActionItem[]> {
  const apiKey = process.env.MONDAY_API_KEY
  if (!apiKey) {
    throw new Error('MONDAY_API_KEY environment variable is not set')
  }

  const columnIds = Object.values(COLUMNS)

  // Query items from the board, requesting all column values we need
  const query = `query {
    boards(ids: [${MONDAY_BOARD_ID}]) {
      items_page(limit: 100) {
        cursor
        items {
          id
          name
          column_values(ids: ${JSON.stringify(columnIds)}) {
            id
            text
            value
          }
        }
      }
    }
  }`

  const allItems: MondayItem[] = []
  let cursor: string | null = null
  let isFirstPage = true

  // Paginate through all items
  while (true) {
    let currentQuery: string
    if (isFirstPage) {
      currentQuery = query
    } else {
      currentQuery = `query {
        next_items_page(cursor: "${cursor}", limit: 100) {
          cursor
          items {
            id
            name
            column_values(ids: ${JSON.stringify(columnIds)}) {
              id
              text
              value
            }
          }
        }
      }`
    }

    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({ query: currentQuery }),
    })

    if (!res.ok) {
      throw new Error(`Monday.com API returned ${res.status}: ${await res.text()}`)
    }

    const json: MondayResponse = await res.json()

    if (json.errors?.length) {
      throw new Error(`Monday.com API errors: ${json.errors.map(e => e.message).join(', ')}`)
    }

    const page = isFirstPage
      ? json.data?.boards?.[0]?.items_page
      : (json.data as any)?.next_items_page

    if (!page?.items?.length) break

    allItems.push(...page.items)
    cursor = page.cursor
    isFirstPage = false

    if (!cursor) break
  }

  return allItems.map(parseMondayItem)
}
