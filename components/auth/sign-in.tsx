"use client"

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

export function SignIn() {
  const { signInWithGoogle } = useAuth()
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleGoogleSignIn = async () => {
    setStatus('loading')
    setErrorMessage('')
    const result = await signInWithGoogle()
    if (!result.success) {
      setStatus('error')
      setErrorMessage(result.error || 'Failed to sign in')
    }
    // On success, browser redirects to Google — no need to update state
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <div className="text-center">
            <img src="/knot_logo.svg" alt="Knots logo" className="mx-auto mb-4 h-16 w-16" />
            <h1 className="mb-2 text-3xl font-bold text-foreground">Welcome to Knots</h1>
            <p className="mx-auto max-w-sm leading-relaxed text-gray-500">
              Your AI-powered to-do list. Track priorities manually, or let AI extract your action items automatically.
            </p>
          </div>

          <div className="mt-6 w-full max-w-sm space-y-4">
            {status === 'error' && errorMessage && (
              <p className="text-sm text-red-600 text-center">{errorMessage}</p>
            )}
            <Button
              onClick={handleGoogleSignIn}
              disabled={status === 'loading'}
              size="lg"
              variant="outline"
              className="w-full gap-3"
            >
              <GoogleIcon />
              {status === 'loading' ? 'Redirecting...' : 'Sign in with Google'}
            </Button>
          </div>

          <div className="flex flex-col items-center gap-3 mt-12">
            <p className="text-sm text-muted-foreground">Seamlessly integrates with:</p>
            <div className="flex items-center gap-4">
              <img src="/slack-svgrepo-com.svg" alt="Slack" className="h-6 w-6" />
              <img src="/granola-icon.svg" alt="Granola" className="h-6 w-6" />
              <img src="/gmail.svg" alt="Gmail" className="h-6 w-6" />
              <img src="/monday-icon.svg" alt="Monday.com" className="h-6 w-6" />
            </div>
          </div>
        </div>
        <div className="w-full text-center py-6 text-sm text-slate-500">
          Powered by <a href="https://knots.bot/" target="_blank" rel="noopener noreferrer" className="font-medium text-slate-600 hover:text-slate-900 hover:underline transition-colors">knots.bot</a>
        </div>
      </div>
    </main>
  )
}
