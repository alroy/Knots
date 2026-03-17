import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_auth_code`)
  }

  const redirectUrl = `${origin}${next}`
  const response = NextResponse.redirect(redirectUrl)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

  console.log('[Auth Callback] Exchange result:', {
    hasSession: !!sessionData?.session,
    user: sessionData?.session?.user?.email,
    error: error?.message,
  })

  if (error) {
    console.error('[Auth Callback] Exchange error:', error)
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
  }

  return response
}
