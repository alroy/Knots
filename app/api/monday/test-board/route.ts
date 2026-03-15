import { NextResponse } from 'next/server'
import createClient from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.MONDAY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Monday.com integration is not configured. Ask your admin to set the MONDAY_API_KEY environment variable.' }, { status: 500 })
  }

  const { boardId } = await request.json()
  if (!boardId || typeof boardId !== 'string') {
    return NextResponse.json({ error: 'Board ID is required' }, { status: 400 })
  }

  try {
    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({
        query: `query { boards(ids: [${boardId.trim()}]) { name items_count } }`,
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Monday API returned ${res.status}` }, { status: 502 })
    }

    const json = await res.json()
    if (json.errors?.length) {
      return NextResponse.json({ error: json.errors[0].message }, { status: 502 })
    }

    const board = json.data?.boards?.[0]
    if (!board) {
      return NextResponse.json({ error: 'Board not found. Check the board ID.' }, { status: 404 })
    }

    return NextResponse.json({ boardName: board.name, itemsCount: board.items_count })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Connection failed' }, { status: 502 })
  }
}
