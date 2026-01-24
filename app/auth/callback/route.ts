import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  console.log('[Auth Callback] ==========================================')
  console.log('[Auth Callback] Processing OAuth callback')
  console.log('[Auth Callback] Has code:', !!code)
  console.log('[Auth Callback] Origin:', origin)
  console.log('[Auth Callback] Next:', next)

  if (!code) {
    console.error('[Auth Callback] ✗ No code provided in callback')
    return NextResponse.redirect(`${origin}/?error=no_code`, { status: 302 })
  }

  // Use placeholder values during build if env vars are missing
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

  console.log('[Auth Callback] Supabase URL:', url)

  // Create the redirect response FIRST - this is critical for cookie setting
  const redirectUrl = `${origin}${next}`
  const response = NextResponse.redirect(redirectUrl, { status: 302 })

  // Create Supabase client that sets cookies on the response object
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        console.log('[Auth Callback] Setting', cookiesToSet.length, 'cookies on response')
        cookiesToSet.forEach(({ name, value, options }) => {
          console.log('[Auth Callback]   - Cookie:', name, 'httpOnly:', options?.httpOnly, 'sameSite:', options?.sameSite)
          // Set cookies on the response object, not the cookie store
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  try {
    console.log('[Auth Callback] Exchanging code for session...')
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[Auth Callback] ✗ Error exchanging code:', error.message)
      return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`, { status: 302 })
    }

    if (!data.session) {
      console.error('[Auth Callback] ✗ No session returned')
      return NextResponse.redirect(`${origin}/?error=no_session`, { status: 302 })
    }

    console.log('[Auth Callback] ✓ Session exchanged successfully!')
    console.log('[Auth Callback] ✓ User email:', data.user?.email)
    console.log('[Auth Callback] ✓ Session expires:', new Date(data.session.expires_at! * 1000).toISOString())

    // Log cookies that were set on the response
    const responseCookies = response.cookies.getAll()
    console.log('[Auth Callback] ✓ Response has', responseCookies.length, 'cookies')
    responseCookies.forEach(cookie => {
      console.log('[Auth Callback]   - Response cookie:', cookie.name)
    })

    console.log('[Auth Callback] ✓ Redirecting to:', redirectUrl)
    console.log('[Auth Callback] ==========================================')

    // Return the response with cookies
    return response
  } catch (err) {
    console.error('[Auth Callback] ✗ Unexpected error:', err)
    return NextResponse.redirect(`${origin}/?error=unexpected_error`, { status: 302 })
  }
}
