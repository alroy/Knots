"use client"

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { SetupInstructionCard } from '@/components/ui/setup-instruction-card'
import { createClient } from '@/lib/supabase-browser'

interface PendingApprovalProps {
  /** When true the user is already approved — show setup instructions + Continue instead of the waiting screen */
  approved?: boolean
}

export function PendingApproval({ approved = false }: PendingApprovalProps) {
  const { signOut, user } = useAuth()
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')

  const hasAcceptedTerms = user?.user_metadata?.has_accepted_terms === true

  async function handleAccept() {
    setAccepting(true)
    setError('')
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({
      data: { has_accepted_terms: true },
    })
    if (updateError) {
      setError('Something went wrong. Please try again.')
      setAccepting(false)
      return
    }
    setAccepting(false)
  }

  if (!hasAcceptedTerms) {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-8">
            <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-8 max-w-md w-full mx-auto text-center">
              <div className="mb-6 flex justify-center">
                <img
                  src="/welcome.svg"
                  alt="Welcome"
                  className="h-14 w-14"
                />
              </div>
              <h1 className="mb-2 text-2xl font-semibold text-gray-900">Welcome to Knots</h1>
              <p className="mb-8 text-sm leading-relaxed text-gray-500">
                Before we continue, please review and accept our{' '}
                <a href="https://knots.bot/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="https://knots.bot/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Privacy Policy
                </a>
                .
              </p>

              {error && (
                <p className="mb-4 text-center text-sm text-red-600">{error}</p>
              )}

              <Button className="w-full" onClick={handleAccept} disabled={accepting}>
                {accepting ? 'Accepting…' : 'I Accept'}
              </Button>
            </div>

            <div className="flex flex-col items-center gap-2">
              {user?.email && (
                <p className="text-sm text-muted-foreground">
                  Signed in as: <span className="font-medium">{user.email}</span>
                </p>
              )}
              <button
                onClick={signOut}
                className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  // Approved users: show setup instructions with a Continue button
  if (approved) {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-8">
            <div className="text-center">
              <h1 className="mb-2 text-2xl font-semibold text-gray-900">Get started with Knots</h1>
              <p className="text-sm leading-relaxed text-gray-500">
                Before you dive in, here&apos;s how to connect your tools so Knots can surface your action items automatically.
              </p>
            </div>

            <SetupInstructionCard />

            <Button className="w-full max-w-sm" size="lg" onClick={handleAccept} disabled={accepting}>
              {accepting ? 'Setting up…' : 'Continue'}
            </Button>

            <div className="flex flex-col items-center gap-2">
              {user?.email && (
                <p className="text-sm text-muted-foreground">
                  Signed in as: <span className="font-medium">{user.email}</span>
                </p>
              )}
              <button
                onClick={signOut}
                className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  // Non-approved users: show waiting screen with setup instructions
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-8">
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-8 max-w-lg w-full mx-auto text-center">
            <img
              src="/locked.svg"
              alt="Pending Approval"
              className="h-14 w-14 mx-auto mb-6"
            />
            <h1 className="mb-2 text-2xl font-semibold text-gray-900">Registration Pending</h1>
            <p className="mb-6 text-sm leading-relaxed text-gray-500">
              Your account is waiting for admin approval. In the meantime, get ready to put your inbox on autopilot.
            </p>

            <hr className="my-6 border-gray-100" />

            <div className="text-left">
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                ✨ Set Up Your AI Autopilot
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Knots pulls your action items directly from a Monday.com Tasks board. To
                put this on autopilot, we use Claude Cowork to scan your Slack, Gmail,
                and Granola transcripts and write tasks to that board twice a day.
              </p>
              <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  Enable the <strong>Slack</strong>, <strong>Granola</strong>,{" "}
                  <strong>Gmail</strong>, and <strong>Monday.com</strong> connectors in
                  your Claude Cowork account.
                </li>
                <li>
                  Copy our setup prompt into a new Cowork session. Claude will
                  automatically create your Monday board and schedule the daily scans.
                </li>
              </ol>
              <a href="/Action Items Automation Setup.md" download>
                <Button variant="ghost" className="w-full border border-border">
                  Download the Setup Prompt
                </Button>
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            {user?.email && (
              <p className="text-sm text-muted-foreground">
                Signed in as: <span className="font-medium">{user.email}</span>
              </p>
            )}
            <button
              onClick={signOut}
              className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
