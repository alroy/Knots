import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  const supabaseCookies = allCookies.filter(c =>
    c.name.includes('supabase') ||
    c.name.includes('sb-') ||
    c.name.includes('auth')
  )

  return NextResponse.json({
    totalCookies: allCookies.length,
    supabaseCookies: supabaseCookies.map(c => ({
      name: c.name,
      hasValue: !!c.value,
      valueLength: c.value.length
    })),
    allCookieNames: allCookies.map(c => c.name)
  })
}
