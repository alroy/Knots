"use client"

import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'

export function PendingApproval() {
  const { signOut, user } = useAuth()

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <img
                src="/lock.svg"
                alt="Pending Approval"
                className="h-16 w-16 opacity-75"
              />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-foreground">Registration Pending</h1>
            <p className="mb-4 text-muted-foreground">
              Your account is waiting for admin approval. In the meantime, get ready to put your inbox on autopilot.
            </p>
          </div>

          <div className="w-full rounded-lg border border-border bg-[#f8f9fa] p-6 dark:bg-accent">
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              ✨ Prepare your AI Autopilot
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Knots uses Claude Cowork to scan your messages twice a day and extract action items directly to a Monday.com board.
            </p>
            <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Ensure your Claude Cowork account has the Slack, Granola, Gmail, and Monday.com connectors enabled.
              </li>
              <li>
                Download the setup prompt and paste it into a new Cowork session.
              </li>
            </ol>
            <a
              href="https://drive.google.com/file/d/1-qUfqqA7VjwKRJGj_a3BUN5eN8VlK3_f/view"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" className="w-full border border-border">
                Get the Setup Prompt
              </Button>
            </a>
          </div>

          <div className="flex flex-col items-center gap-2 pt-2">
            {user?.email && (
              <p className="text-sm text-muted-foreground">
                Signed in as: <span className="font-medium">{user.email}</span>
              </p>
            )}
            <Button onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}
