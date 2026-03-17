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
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  clearPasswordRecovery: () => void
  isAuthorized: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function getAllowedEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_EMAILS || ''
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

function isEmailAllowed(email: string): boolean {
  const allowed = getAllowedEmails()
  if (allowed.length === 0) return true
  return allowed.includes(email.toLowerCase())
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    // Check URL BEFORE creating Supabase client (which might clear the hash)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const hashType = hashParams.get('type')

    const queryParams = new URLSearchParams(window.location.search)
    const code = queryParams.get('code')
    const queryType = queryParams.get('type')

    const isRecoveryFromHash = hashType === 'recovery' && accessToken
    const isRecoveryFromQuery = queryType === 'recovery' && code

    if (isRecoveryFromHash || isRecoveryFromQuery) {
      setIsPasswordRecovery(true)
    }

    const supabase = createClient()

    // Handle hash-based recovery (implicit flow) - manually set session
    const handleHashRecovery = async () => {
      if (isRecoveryFromHash && accessToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        })
        if (!error) {
          window.history.replaceState({}, '', window.location.pathname)
        }
      }
    }

    // Handle code-based auth (PKCE flow) from URL
    const handleCodeFromUrl = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          window.history.replaceState({}, '', window.location.pathname)
        }
      }
    }

    // Run the appropriate handler
    if (isRecoveryFromHash) {
      handleHashRecovery()
    } else if (code) {
      handleCodeFromUrl()
    }

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null
      const authorized = currentUser?.email ? isEmailAllowed(currentUser.email) : false

      setUser(currentUser)
      setIsAuthorized(authorized)

      // Only stop loading if NOT waiting for recovery session
      if (!(isRecoveryFromHash || isRecoveryFromQuery) || currentUser) {
        setLoading(false)
      }
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
      setIsAuthorized(currentUser?.email ? isEmailAllowed(currentUser.email) : false)
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

    return () => {
      subscription.unsubscribe()
      clearTimeout(loadingTimeout)
    }
  }, [])

  const sendMagicLink = async (email: string): Promise<{ success: boolean; error?: string }> => {
    // Check if email is allowed before sending
    if (!isEmailAllowed(email)) {
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
    if (!isEmailAllowed(email)) {
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

  const signUp = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (!isEmailAllowed(email)) {
      return { success: false, error: 'This email is not authorized to access this app.' }
    }

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      })

      if (error) {
        if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already exists')) {
          return { success: false, error: 'An account with this email already exists. Try signing in instead.' }
        }
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
    <AuthContext.Provider value={{ user, loading, isPasswordRecovery, sendMagicLink, signInWithPassword, signUp, signOut, clearPasswordRecovery, isAuthorized }}>
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
