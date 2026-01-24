import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import createClient from '@/lib/supabase-server'

export async function GET() {
  const cookieStore = await cookies()

  // Get all cookies
  const allCookies = cookieStore.getAll()
  const sbCookies = allCookies.filter(c => c.name.startsWith('sb-'))

  // Check session
  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.getSession()

  return NextResponse.json({
    totalCookies: allCookies.length,
    supabaseCookies: sbCookies.length,
    cookieNames: sbCookies.map(c => ({
      name: c.name,
      valueLength: c.value.length,
    })),
    sessionExists: !!session,
    userEmail: session?.user?.email || null,
    error: error?.message || null,
    timestamp: new Date().toISOString(),
  })
}
