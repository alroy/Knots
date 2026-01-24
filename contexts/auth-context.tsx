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
      console.log('[Auth Context] ==========================================')
      console.log('[Auth Context] Initial session check')
      console.log('[Auth Context] Session exists:', !!session)
      console.log('[Auth Context] User email:', session?.user?.email)
      console.log('[Auth Context] User ID:', session?.user?.id)
      console.log('[Auth Context] Allowed email:', ALLOWED_EMAIL)

      const currentUser = session?.user ?? null
      const userEmail = currentUser?.email
      const authorized = userEmail === ALLOWED_EMAIL

      console.log('[Auth Context] Is authorized:', authorized)
      console.log('[Auth Context] Email match:', userEmail === ALLOWED_EMAIL)
      console.log('[Auth Context] ==========================================')

      setUser(currentUser)
      setIsAuthorized(authorized)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth Context] Auth state changed:', event)
      console.log('[Auth Context] Session exists:', !!session)
      console.log('[Auth Context] User email:', session?.user?.email)

      const currentUser = session?.user ?? null
      setUser(currentUser)
      setIsAuthorized(currentUser?.email === ALLOWED_EMAIL)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    try {
      console.log('[Auth] ==========================================')
      console.log('[Auth] Starting Google OAuth flow...')
      console.log('[Auth] Current origin:', window.location.origin)

      const supabase = createClient()
      console.log('[Auth] Supabase client created')
      console.log('[Auth] Redirect URL:', `${window.location.origin}/auth/callback`)

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      console.log('[Auth] OAuth call completed')
      console.log('[Auth] Data:', data)
      console.log('[Auth] Error:', error)

      if (error) {
        console.error('[Auth] ✗ Error signing in with Google:', error)
        alert(`Sign-in error: ${error.message}`)
        return
      }

      if (!data) {
        console.error('[Auth] ✗ No data returned from OAuth')
        alert('No data returned from authentication')
        return
      }

      if (!data.url) {
        console.error('[Auth] ✗ No URL in OAuth response')
        console.error('[Auth] Full data:', JSON.stringify(data, null, 2))
        alert('No redirect URL returned from authentication')
        return
      }

      console.log('[Auth] ✓ Got OAuth URL:', data.url)
      console.log('[Auth] ✓ Redirecting to Google...')
      console.log('[Auth] ==========================================')
      window.location.href = data.url
    } catch (err: any) {
      console.error('[Auth] ✗ Unexpected error:', err)
      console.error('[Auth] Error details:', err.message, err.stack)
      alert(`Unexpected error: ${err.message || err}`)
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
