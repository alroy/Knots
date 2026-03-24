import { NextResponse } from 'next/server'
import createClient from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'gil.alroy@gmail.com'

export async function GET() {
  // Verify the caller is the admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch unapproved users using admin client (bypasses RLS)
  const adminClient = createAdminClient()
  const { data: profiles, error } = await adminClient
    .from('user_profile')
    .select('user_id, name, avatar_url, created_at')
    .eq('approved', false)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch email and metadata for each user from auth.users
  const users = await Promise.all(
    (profiles || []).map(async (profile) => {
      const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(profile.user_id)
      return {
        userId: profile.user_id,
        email: authUser?.email || '',
        name: profile.name || authUser?.user_metadata?.full_name || '',
        avatarUrl: profile.avatar_url || authUser?.user_metadata?.avatar_url || '',
        createdAt: profile.created_at,
        hasAcceptedTerms: authUser?.user_metadata?.has_accepted_terms === true,
      }
    })
  )

  // Only show users who have accepted terms (exclude those who dropped off before consenting)
  const filteredUsers = users
    .filter((u) => u.hasAcceptedTerms)
    .map(({ hasAcceptedTerms, ...rest }) => rest)

  return NextResponse.json({ users: filteredUsers })
}
