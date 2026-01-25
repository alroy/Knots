"use client"

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ResetPasswordProps {
  onComplete: () => void
}

export function ResetPassword({ onComplete }: ResetPasswordProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!password) {
      setStatus('error')
      setErrorMessage('Please enter a password')
      return
    }

    if (password.length < 6) {
      setStatus('error')
      setErrorMessage('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setStatus('error')
      setErrorMessage('Passwords do not match')
      return
    }

    setStatus('saving')
    setErrorMessage('')

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setStatus('error')
        setErrorMessage(error.message)
        return
      }

      setStatus('success')
      setTimeout(() => {
        onComplete()
      }, 2000)
    } catch (err: any) {
      setStatus('error')
      setErrorMessage(err.message || 'An unexpected error occurred')
    }
  }

  if (status === 'success') {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
            <div className="text-center">
              <div className="mb-4 text-4xl">✓</div>
              <h1 className="mb-2 text-2xl font-bold text-foreground">Password updated</h1>
              <p className="text-muted-foreground">
                Your password has been successfully updated. Redirecting...
              </p>
            </div>
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
            <h1 className="mb-2 text-3xl font-bold text-foreground">Set new password</h1>
            <p className="text-muted-foreground">
              Enter your new password below
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={status === 'saving'}
              autoFocus
            />

            <Input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={status === 'saving'}
            />

            {status === 'error' && errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            <Button
              type="submit"
              disabled={status === 'saving'}
              size="lg"
              className="w-full"
            >
              {status === 'saving' ? 'Updating...' : 'Update password'}
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}
