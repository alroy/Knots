import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

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

  // Handle magic link (OTP) verification
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'magiclink' | 'email',
    })

    if (error) {
      return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
    }

    return response
  }

  // Handle code exchange - always forward to client
  // This allows onAuthStateChange to detect PASSWORD_RECOVERY events
  if (code) {
    const redirectParams = new URLSearchParams({ code })
    if (type) redirectParams.set('type', type)
    return NextResponse.redirect(`${origin}/?${redirectParams.toString()}`)
  }

  // No valid auth parameters
  return NextResponse.redirect(`${origin}/?error=missing_auth_params`)
}
