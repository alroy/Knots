"use client"

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SignIn() {
  const { sendMagicLink, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setStatus('error')
      setErrorMessage('Please enter your email address')
      return
    }

    setStatus('sending')
    setErrorMessage('')

    const result = await sendMagicLink(email.trim())

    if (result.success) {
      setStatus('sent')
    } else {
      setStatus('error')
      setErrorMessage(result.error || 'Failed to send magic link')
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
                We sent a magic link to <strong>{email}</strong>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Click the link in the email to sign in. You can close this tab.
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
            <h1 className="mb-2 text-3xl font-bold text-foreground">Welcome to Knots</h1>
            <p className="text-muted-foreground">
              Enter your email to receive a sign-in link
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

            {status === 'error' && errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            <Button
              type="submit"
              disabled={status === 'sending' || loading}
              size="lg"
              className="w-full"
            >
              {status === 'sending' ? 'Sending...' : 'Send magic link'}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            No password needed. We&apos;ll email you a secure link.
          </p>
        </div>
      </div>
    </main>
  )
}
