import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[Auth Callback] Error exchanging code:', error)
      return NextResponse.redirect(`${origin}/?error=${error.message}`)
    }

    console.log('[Auth Callback] Session exchanged successfully for:', data.user?.email)
  }

  // Redirect to home page after sign in
  return NextResponse.redirect(`${origin}/`)
}
