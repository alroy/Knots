"use client"

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'

interface AuthContextType {
  user: User | null
  loading: boolean
  isPasswordRecovery: boolean
  sendMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>
  signInWithPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  clearPasswordRecovery: () => void
  isAuthorized: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ALLOWED_EMAIL = 'gil.alroy@gmail.com'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // Handle code-based auth (PKCE flow) from URL
    const handleCodeFromUrl = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const type = params.get('type')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          if (type === 'recovery') {
            setIsPasswordRecovery(true)
          }
          window.history.replaceState({}, '', window.location.pathname)
        }
      }
    }

    handleCodeFromUrl()

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null
      const authorized = currentUser?.email === ALLOWED_EMAIL

      setUser(currentUser)
      setIsAuthorized(authorized)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setIsAuthorized(currentUser?.email === ALLOWED_EMAIL)
      setLoading(false)

      // Detect password recovery mode
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }

      // Clean up URL hash after Supabase processes it
      if (window.location.hash) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const sendMagicLink = async (email: string): Promise<{ success: boolean; error?: string }> => {
    // Check if email is allowed before sending
    if (email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
      return { success: false, error: 'This email is not authorized to access this app.' }
    }

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Redirect to root - client-side handles the code exchange
          emailRedirectTo: `${window.location.origin}/`,
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

  const signInWithPassword = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
      return { success: false, error: 'This email is not authorized to access this app.' }
    }

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
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

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false)
  }

  return (
    <AuthContext.Provider value={{ user, loading, isPasswordRecovery, sendMagicLink, signInWithPassword, signOut, clearPasswordRecovery, isAuthorized }}>
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
