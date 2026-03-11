import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

interface CalendarPayload {
  event_id: string
  title: string
  start_time: string
  end_time: string
  attendees?: string[]
  location?: string
  description?: string
  meeting_link?: string
  calendar_name?: string
}

/**
 * Zapier sends comma-separated values for recurring Google Calendar events
 * (e.g. "2026-01-01,2026-03-12,2026-03-11T19:30:00+02:00"). Pick the last
 * value that looks like a full ISO-8601 datetime; fall back to the last token.
 */
function parseTimestamp(raw: string): string {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  // prefer the last part that contains a 'T' (full datetime)
  const withTime = parts.filter(p => p.includes('T'))
  return withTime.length > 0 ? withTime[withTime.length - 1] : parts[parts.length - 1]
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const webhookSecret = process.env.ZAPIER_WEBHOOK_SECRET
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = process.env.ZAPIER_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'ZAPIER_USER_ID not configured' }, { status: 500 })
  }

  try {
    const body: CalendarPayload = await request.json()
    console.log('Calendar ingest payload:', JSON.stringify(body))

    if (!body.event_id || !body.title || !body.start_time || !body.end_time) {
      return NextResponse.json(
        { error: 'event_id, title, start_time, and end_time are required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('calendar_events')
      .upsert({
        user_id: userId,
        event_id: body.event_id,
        title: body.title,
        start_time: parseTimestamp(body.start_time),
        end_time: parseTimestamp(body.end_time),
        attendees: body.attendees || [],
        location: body.location || '',
        description: body.description || '',
        meeting_link: body.meeting_link || '',
        calendar_name: body.calendar_name || '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,event_id' })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      event_id: body.event_id,
      id: data.id,
    })
  } catch (error) {
    console.error('Calendar ingest error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Internal server error', detail: message },
      { status: 500 }
    )
  }
}
