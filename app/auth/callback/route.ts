import { NextResponse } from 'next/server'
import createClient from '@/lib/supabase-server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  console.log('[Auth Callback] Processing OAuth callback')
  console.log('[Auth Callback] Has code:', !!code)
  console.log('[Auth Callback] Origin:', origin)

  if (code) {
    const supabase = await createClient()

    console.log('[Auth Callback] Exchanging code for session...')
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      console.log('[Auth Callback] ✓ Session exchanged successfully!')
      console.log('[Auth Callback] ✓ Redirecting to:', next)
      return NextResponse.redirect(`${origin}${next}`)
    }

    console.error('[Auth Callback] ✗ Error exchanging code:', error.message)
  }

  // Redirect to error page if code is missing or exchange fails
  console.error('[Auth Callback] ✗ OAuth callback failed')
  return NextResponse.redirect(`${origin}/?error=auth_failed`)
}
