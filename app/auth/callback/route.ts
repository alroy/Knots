import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_auth_code`)
  }

  const cookiesSet: string[] = []

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
            cookiesSet.push(name)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
    }

    // Temporary debug: show what happened instead of redirecting
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:40px">
        <h2>Auth Callback Debug</h2>
        <p><b>Exchange:</b> SUCCESS</p>
        <p><b>User:</b> ${data.user?.email || 'none'}</p>
        <p><b>Session:</b> ${data.session ? 'yes' : 'no'}</p>
        <p><b>Cookies set:</b> ${cookiesSet.length} - [${cookiesSet.join(', ')}]</p>
        <p><b>Origin:</b> ${origin}</p>
        <p><b>Redirect would go to:</b> ${redirectUrl}</p>
        <p><a href="/">Click here to continue to app</a></p>
      </body></html>`,
      {
        status: 200,
        headers: {
          'content-type': 'text/html',
          // Copy the cookies from the redirect response
          ...Object.fromEntries(
            response.headers.entries()
          ),
        },
      }
    )
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(err.message || 'auth_callback_error')}`)
  }
}
