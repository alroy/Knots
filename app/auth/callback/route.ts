import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  console.log('[Auth Callback] Processing OAuth callback')
  console.log('[Auth Callback] Has code:', !!code)
  console.log('[Auth Callback] Origin:', origin)

  if (!code) {
    console.error('[Auth Callback] ✗ No code provided')
    return NextResponse.redirect(`${origin}/?error=no_code`)
  }

  // Create the redirect response FIRST
  const redirectUrl = `${origin}${next}`
  const response = NextResponse.redirect(redirectUrl)

  // Create Supabase client that sets cookies on the response object
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          console.log('[Auth Callback] Setting', cookiesToSet.length, 'cookies on response')
          cookiesToSet.forEach(({ name, value, options }) => {
            console.log('[Auth Callback]   - Cookie:', name)
            console.log('[Auth Callback]     Options:', JSON.stringify(options))
            console.log('[Auth Callback]     Domain:', options?.domain || 'not set')
            console.log('[Auth Callback]     Path:', options?.path || '/')
            console.log('[Auth Callback]     SameSite:', options?.sameSite || 'default')
            console.log('[Auth Callback]     HttpOnly:', options?.httpOnly || false)
            console.log('[Auth Callback]     Secure:', options?.secure || false)
            // CRITICAL: Set cookies on the NextResponse object
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  console.log('[Auth Callback] Exchanging code for session...')
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[Auth Callback] ✗ Error exchanging code:', error.message)
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
  }

  console.log('[Auth Callback] ✓ Session exchanged successfully!')

  // Verify cookies on response
  const responseCookies = response.cookies.getAll()
  console.log('[Auth Callback] ✓ Response has', responseCookies.length, 'cookies')
  responseCookies.forEach(cookie => {
    console.log('[Auth Callback]     - Response cookie:', cookie.name, 'length:', cookie.value.length)
  })

  console.log('[Auth Callback] ✓ Redirecting to:', redirectUrl)

  // Return the response with cookies attached
  return response
}
