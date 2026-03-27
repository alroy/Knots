import { NextResponse, type NextRequest } from 'next/server'
import createClient from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  // Verify the caller is authenticated
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id

  let body: { reason?: string; recommendScore?: number; finalNote?: string } = {}
  try {
    body = await request.json()
  } catch {
    // Body is optional — proceed even if missing
  }

  const adminClient = createAdminClient()

  // 1. Store anonymous churn insight (no user_id)
  if (body.reason || body.recommendScore || body.finalNote) {
    await adminClient.from('churn_insights').insert({
      reason: body.reason || null,
      recommend_score: body.recommendScore || null,
      final_note: body.finalNote || null,
    })
  }

  // 2. Delete user data from all tables
  const tables = [
    'monday_connections',
    'feedback',
    'tasks',
    'goals',
    'people',
    'user_profile',
  ]

  for (const table of tables) {
    const { error } = await adminClient.from(table).delete().eq('user_id', userId)
    if (error) {
      console.error(`Error deleting from ${table}:`, error)
      return NextResponse.json(
        { error: `Failed to delete data from ${table}` },
        { status: 500 }
      )
    }
  }

  // 3. Delete the auth user
  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId)
  if (deleteUserError) {
    console.error('Error deleting auth user:', deleteUserError)
    return NextResponse.json(
      { error: 'Failed to delete user account' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
