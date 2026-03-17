"use client"

import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { SetupInstructionCard } from '@/components/ui/setup-instruction-card'

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

          <SetupInstructionCard />

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
