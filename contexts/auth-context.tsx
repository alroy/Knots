"use client"

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'

interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  isAuthorized: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ALLOWED_EMAIL = 'gil.alroy@gmail.com'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[Auth Context] Session check:', session ? 'User logged in' : 'No session')
      console.log('[Auth Context] User email:', session?.user?.email)
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setIsAuthorized(currentUser?.email === ALLOWED_EMAIL)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setIsAuthorized(currentUser?.email === ALLOWED_EMAIL)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    try {
      const supabase = createClient()
      console.log('[Auth] Starting Google OAuth flow...')
      console.log('[Auth] Redirect URL:', `${window.location.origin}/auth/callback`)

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      console.log('[Auth] OAuth response:', { data, error })

      if (error) {
        console.error('[Auth] Error signing in with Google:', error)
        alert(`Sign-in error: ${error.message}`)
      } else if (data?.url) {
        console.log('[Auth] Redirecting to:', data.url)
        window.location.href = data.url
      } else {
        console.error('[Auth] No URL returned from OAuth')
        alert('No redirect URL returned from authentication')
      }
    } catch (err) {
      console.error('[Auth] Unexpected error:', err)
      alert(`Unexpected error: ${err}`)
    }
  }

  const signOut = async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut, isAuthorized }}>
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
