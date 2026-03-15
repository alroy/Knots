"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LOCATION_OPTIONS } from "@/lib/chief-of-staff-types"
import type { PersonLocation } from "@/lib/chief-of-staff-types"

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [location, setLocation] = useState<PersonLocation | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Please enter your name')
      return
    }

    if (!user) return

    setSaving(true)
    setError('')

    try {
      const supabase = createClient()
      const { error: dbError } = await supabase
        .from('user_profile')
        .update({
          name: name.trim(),
          role_title: roleTitle.trim(),
          location: location || '',
        })
        .eq('user_id', user.id)

      if (dbError) throw dbError
      onComplete()
    } catch (err: any) {
      console.error('Error saving profile:', err)
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
          <div className="text-center">
            <h1 className="mb-2 text-3xl font-bold text-foreground">Welcome to Knots</h1>
            <p className="text-muted-foreground">
              Tell us a bit about yourself to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
            <div className="space-y-2">
              <Label htmlFor="onboarding-name">Name</Label>
              <Input
                id="onboarding-name"
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="onboarding-role">Role <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="onboarding-role"
                type="text"
                placeholder="e.g. VP of Engineering"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="onboarding-location">Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <select
                id="onboarding-location"
                value={location}
                onChange={(e) => setLocation(e.target.value as PersonLocation | '')}
                disabled={saving}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select location...</option>
                {LOCATION_OPTIONS.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              disabled={saving}
              size="lg"
              className="w-full"
            >
              {saving ? 'Setting up...' : 'Get started'}
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}
