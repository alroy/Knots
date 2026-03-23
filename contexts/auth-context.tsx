"use client"

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'

interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  isApproved: boolean | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isApproved, setIsApproved] = useState<boolean | null>(null)

  // Fetch approval status from user_profile, creating the row if missing
  const checkApproval = async (userId: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('user_profile')
      .select('approved')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      setIsApproved(false)
      return
    }

    if (data) {
      setIsApproved(data.approved)
      return
    }

    // No profile row exists — create one as fallback (DB trigger may not have fired)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase()
    const isAdmin = !!(adminEmail && authUser?.email?.toLowerCase() === adminEmail)
    const name = authUser?.user_metadata?.full_name || ''

    const { error: insertError } = await supabase
      .from('user_profile')
      .insert({ user_id: userId, name, approved: isAdmin })

    if (insertError) {
      // Unique constraint violation — trigger won the race, re-read the row
      if (insertError.code === '23505') {
        const { data: retry } = await supabase
          .from('user_profile')
          .select('approved')
          .eq('user_id', userId)
          .maybeSingle()
        setIsApproved(retry?.approved ?? false)
        return
      }
      setIsApproved(false)
      return
    }

    setIsApproved(isAdmin)
  }

  useEffect(() => {
    const supabase = createClient()

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        checkApproval(currentUser.id)
      } else {
        setIsApproved(null)
      }

      setLoading(false)
    })

    // Timeout fallback: stop loading after 5 seconds regardless
    const loadingTimeout = setTimeout(() => {
      setLoading(false)
    }, 5000)

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setLoading(false)

      if (currentUser) {
        checkApproval(currentUser.id)
      } else {
        setIsApproved(null)
      }
    })

    return () => {
      subscription.unsubscribe()
      clearTimeout(loadingTimeout)
    }
  }, [])

  const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'An unexpected error occurred' }
    }
  }

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut, isApproved }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
