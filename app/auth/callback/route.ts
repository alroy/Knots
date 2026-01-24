import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  // CRITICAL: Create the response object FIRST, before creating Supabase client
  // Cookies MUST be set on this response object to be sent back to the browser
  let response = NextResponse.redirect(`${origin}/`)

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          console.log('[Auth Callback] Setting', cookiesToSet.length, 'cookies on response')
          cookiesToSet.forEach(({ name, value, options }) => {
            // CRITICAL: Set cookies on the RESPONSE object, not the request
            response.cookies.set(name, value, options)
            console.log('[Auth Callback]   - Cookie:', name, 'maxAge:', options?.maxAge)
          })
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
    console.log('[Auth Callback] ✓ Returning response with session cookies')
    console.log('[Auth Callback] ==========================================')

    // Return the response object that has the session cookies set on it
    return response
  } catch (err) {
    console.error('[Auth Callback] ✗ Unexpected error:', err)
    return NextResponse.redirect(`${origin}/?error=unexpected_error`)
  }
}
