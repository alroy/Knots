"use client"

import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'

export function AuthHeader() {
  const { user, signOut } = useAuth()

  if (!user) return null

  return (
    <div className="mx-auto mb-6 flex max-w-xl items-center justify-between">
      <div className="flex items-center gap-2">
        {user.user_metadata?.avatar_url && (
          <img
            src={user.user_metadata.avatar_url}
            alt="Profile"
            className="h-8 w-8 rounded-full"
          />
        )}
        <span className="text-sm text-muted-foreground">{user.email}</span>
      </div>
      <Button onClick={signOut} variant="outline" size="sm">
        Sign out
      </Button>
    </div>
  )
}
