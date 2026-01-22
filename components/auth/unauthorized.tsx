"use client"

import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'

export function Unauthorized() {
  const { signOut, user } = useAuth()

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
          <div className="text-center">
            <h1 className="mb-2 text-3xl font-bold text-foreground">Access Denied</h1>
            <p className="mb-4 text-muted-foreground">
              Sorry, this account is not authorized to access Knots.
            </p>
            {user?.email && (
              <p className="mb-6 text-sm text-muted-foreground">
                Signed in as: <span className="font-medium">{user.email}</span>
              </p>
            )}
          </div>

          <Button onClick={signOut} variant="outline">
            Sign out
          </Button>
        </div>
      </div>
    </main>
  )
}
