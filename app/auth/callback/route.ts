import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  console.log('[Auth Callback] ==========================================')
  console.log('[Auth Callback] Processing OAuth callback')
  console.log('[Auth Callback] Has code:', !!code)
  console.log('[Auth Callback] Origin:', origin)

  if (!code) {
    console.error('[Auth Callback] ✗ No code provided in callback')
    return NextResponse.redirect(`${origin}/?error=no_code`)
  }

  // Use placeholder values during build if env vars are missing
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

  console.log('[Auth Callback] Supabase URL:', url)

  // CRITICAL: In Route Handlers, use cookies() API and Next.js will automatically
  // attach the cookies to the response you return
  const cookieStore = await cookies()

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          console.log('[Auth Callback] Setting', cookiesToSet.length, 'cookies via cookies() API')
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              console.log('[Auth Callback]   - Cookie:', name, 'maxAge:', options?.maxAge)
              cookieStore.set(name, value, options)
            })
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
            console.error('[Auth Callback] Error setting cookies:', error)
          }
        },
      },
    }
  )

  try {
    console.log('[Auth Callback] Exchanging code for session...')
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[Auth Callback] ✗ Error exchanging code:', error.message)
      return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
    }

    if (!data.session) {
      console.error('[Auth Callback] ✗ No session returned after code exchange')
      return NextResponse.redirect(`${origin}/?error=no_session`)
    }

    console.log('[Auth Callback] ✓ Session exchanged successfully!')
    console.log('[Auth Callback] ✓ User email:', data.user?.email)
    console.log('[Auth Callback] ✓ Session expires:', new Date(data.session.expires_at! * 1000).toISOString())
    console.log('[Auth Callback] ✓ Redirecting to home page')
    console.log('[Auth Callback] ==========================================')

    // Next.js automatically attaches cookies set via cookies() to this response
    return NextResponse.redirect(`${origin}/`)
  } catch (err) {
    console.error('[Auth Callback] ✗ Unexpected error:', err)
    return NextResponse.redirect(`${origin}/?error=unexpected_error`)
  }
}
