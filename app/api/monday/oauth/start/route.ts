import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import {
  getMondayOAuthConfig,
  generateOAuthState,
  buildAuthUrl,
} from '@/lib/monday/oauth'

/**
 * Start Monday.com OAuth flow
 */
export async function GET() {
  if (process.env.MONDAY_FEATURE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Monday.com integration disabled' }, { status: 404 })
  }

  const config = getMondayOAuthConfig()
  if (!config) {
    console.error('Monday.com OAuth not configured')
    return NextResponse.json({ error: 'Monday.com not configured' }, { status: 500 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
    return NextResponse.redirect(`${siteUrl}/?error=not_authenticated`)
  }

  const state = generateOAuthState(user.id, config.signingSecret)
  const authUrl = buildAuthUrl(config, state)

  return NextResponse.redirect(authUrl)
}
