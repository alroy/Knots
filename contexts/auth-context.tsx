"use client"

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'gil.alroy@gmail.com'
const ALLOWED_DOMAIN = 'zencity.io'

interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  isApproved: boolean
  isAdmin: boolean
  isDomainValid: boolean
  recheckApproval: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function isDomainAllowed(email: string): boolean {
  const lower = email.toLowerCase()
  return lower === ADMIN_EMAIL.toLowerCase() || lower.endsWith(`@${ALLOWED_DOMAIN}`)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isApproved, setIsApproved] = useState(false)
  const [isDomainValid, setIsDomainValid] = useState(false)

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()

  const checkApproval = useCallback(async (currentUser: User) => {
    const email = currentUser.email || ''
    const domainOk = isDomainAllowed(email)
    setIsDomainValid(domainOk)

    if (!domainOk) {
      setIsApproved(false)
      return
    }

    const supabase = createClient()
    const { data } = await supabase
      .from('user_profile')
      .select('approved')
      .eq('user_id', currentUser.id)
      .maybeSingle()

    setIsApproved(data?.approved ?? false)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    // Check active session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        await checkApproval(currentUser)
      }

      setLoading(false)
    })

    // Timeout fallback
    const loadingTimeout = setTimeout(() => {
      setLoading(false)
    }, 5000)

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        await checkApproval(currentUser)
      } else {
        setIsDomainValid(false)
        setIsApproved(false)
      }

      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
      clearTimeout(loadingTimeout)
    }
  }, [checkApproval])

  const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            hd: ALLOWED_DOMAIN,
          },
          skipBrowserRedirect: true,
        },
      })

      console.log('[Auth] signInWithOAuth result:', { data, error })

      if (error) {
        console.error('[Auth] OAuth error:', error)
        return { success: false, error: error.message }
      }

      if (!data?.url) {
        console.error('[Auth] No OAuth URL returned. Is Google provider enabled in Supabase?')
        return { success: false, error: 'Google sign-in is not configured. Please contact the administrator.' }
      }

      console.log('[Auth] Redirecting to:', data.url)
      window.location.href = data.url
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'An unexpected error occurred' }
    }
  }

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
  }

  const recheckApproval = async () => {
    if (user) {
      await checkApproval(user)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut, isApproved, isAdmin, isDomainValid, recheckApproval }}>
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
