import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
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

  // Get the cookie store
  const cookieStore = await cookies()

  // Create Supabase client that sets cookies via the cookie store
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          console.log('[Auth Callback] Setting', cookiesToSet.length, 'cookies via cookie store')
          cookiesToSet.forEach(({ name, value, options }) => {
            console.log('[Auth Callback]   - Cookie:', name)
            console.log('[Auth Callback]     Path:', options?.path || '/')
            console.log('[Auth Callback]     MaxAge:', options?.maxAge)
            console.log('[Auth Callback]     SameSite:', options?.sameSite)
            console.log('[Auth Callback]     HttpOnly:', options?.httpOnly)
            // Set cookies using the cookie store API
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  console.log('[Auth Callback] Exchanging code for session...')
  const { error, data } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[Auth Callback] ✗ Error exchanging code:', error.message)
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
  }

  console.log('[Auth Callback] ✓ Session exchanged successfully!')
  console.log('[Auth Callback] ✓ User:', data.user?.email)

  // Verify cookies in store
  const allCookies = cookieStore.getAll()
  const sbCookies = allCookies.filter(c => c.name.startsWith('sb-'))
  console.log('[Auth Callback] ✓ Cookie store has', sbCookies.length, 'Supabase cookies')
  sbCookies.forEach(cookie => {
    console.log('[Auth Callback]     -', cookie.name)
  })

  console.log('[Auth Callback] ✓ Redirecting to:', next)

  // Redirect - cookies should be automatically included
  return NextResponse.redirect(`${origin}${next}`)
}
