import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Check if environment variables are loaded
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
    const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!hasUrl || !hasKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing environment variables',
        details: {
          hasUrl,
          hasKey,
        }
      }, { status: 500 })
    }

    // Test database connection by querying the tasks table
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .limit(1)

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          errorDetails: error,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Database connection successful!',
      taskCount: data?.length || 0,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to connect to database',
        details: error?.message || String(error),
        stack: error?.stack
      },
      { status: 500 }
    )
  }
}
