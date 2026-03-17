"use client"

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type AuthMode = 'password' | 'magic-link' | 'sign-up'

export function SignIn() {
  const { sendMagicLink, signInWithPassword, signUp, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<AuthMode>('password')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setStatus('error')
      setErrorMessage('Please enter your email address')
      return
    }

    if ((mode === 'password' || mode === 'sign-up') && !password) {
      setStatus('error')
      setErrorMessage('Please enter your password')
      return
    }

    if (mode === 'sign-up' && password.length < 6) {
      setStatus('error')
      setErrorMessage('Password must be at least 6 characters')
      return
    }

    setStatus('sending')
    setErrorMessage('')

    if (mode === 'magic-link') {
      const result = await sendMagicLink(email.trim())
      if (result.success) {
        setStatus('sent')
      } else {
        setStatus('error')
        setErrorMessage(result.error || 'Failed to send magic link')
      }
    } else if (mode === 'sign-up') {
      const result = await signUp(email.trim(), password)
      if (result.success) {
        setStatus('sent')
      } else {
        setStatus('error')
        setErrorMessage(result.error || 'Failed to create account')
      }
    } else {
      const result = await signInWithPassword(email.trim(), password)
      if (result.success) {
        // Auth state change will handle redirect
      } else {
        setStatus('error')
        setErrorMessage(result.error || 'Failed to sign in')
      }
    }
  }

  if (status === 'sent') {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
            <div className="text-center">
              <div className="mb-4 text-4xl">✉️</div>
              <h1 className="mb-2 text-2xl font-bold text-foreground">Check your email</h1>
              <p className="text-muted-foreground">
                We sent a {mode === 'sign-up' ? 'confirmation' : 'magic'} link to <strong>{email}</strong>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Click the link in the email to {mode === 'sign-up' ? 'confirm your account' : 'sign in'}. You can close this tab.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setStatus('idle')
                setEmail('')
              }}
            >
              Use a different email
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
          <div className="text-center">
            <h1 className="mb-2 text-3xl font-bold text-foreground">Welcome to ZC Knots</h1>
            <p className="text-muted-foreground">
              Your AI-powered to-do list and much more. Track priorities manually, or let AI extract action items automatically.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === 'sending' || loading}
              autoFocus
            />

            {(mode === 'password' || mode === 'sign-up') && (
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status === 'sending' || loading}
              />
            )}

            {status === 'error' && errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            <Button
              type="submit"
              disabled={status === 'sending' || loading}
              size="lg"
              className="w-full"
            >
              {status === 'sending'
                ? (mode === 'sign-up' ? 'Creating account...' : mode === 'password' ? 'Signing in...' : 'Sending...')
                : (mode === 'sign-up' ? 'Create account' : mode === 'password' ? 'Sign in' : 'Send magic link')}
            </Button>
          </form>

          <div className="flex flex-col items-center gap-2">
            {mode === 'sign-up' ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setMode('password')
                  setStatus('idle')
                  setErrorMessage('')
                }}
              >
                Already have an account? Sign in
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMode(mode === 'password' ? 'magic-link' : 'password')
                    setStatus('idle')
                    setErrorMessage('')
                  }}
                >
                  {mode === 'password' ? 'Use magic link instead' : 'Use password instead'}
                </Button>
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline hover:opacity-80 transition-opacity"
                  onClick={() => {
                    setMode('sign-up')
                    setStatus('idle')
                    setErrorMessage('')
                  }}
                >
                  New here? Create an account
                </button>
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 pt-4">
            <p className="text-sm text-muted-foreground">Seamlessly integrates with:</p>
            <div className="flex items-center gap-4">
              <img src="/slack-svgrepo-com.svg" alt="Slack" className="h-6 w-6 grayscale opacity-60" />
              <img src="/granola-icon.svg" alt="Granola" className="h-6 w-6 grayscale opacity-60" />
              <img src="/gmail.svg" alt="Gmail" className="h-6 w-6 grayscale opacity-60" />
              <img src="/monday-icon.svg" alt="Monday.com" className="h-6 w-6 grayscale opacity-60" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
