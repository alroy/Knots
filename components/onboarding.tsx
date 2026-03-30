"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { LOCATION_OPTIONS } from "@/lib/chief-of-staff-types"
import type { PersonLocation } from "@/lib/chief-of-staff-types"
import { SetupInstructionCard } from "@/components/ui/setup-instruction-card"

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const { user } = useAuth()
  const [step, setStep] = useState<'setup' | 'profile' | 'monday'>('setup')
  const [name, setName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [location, setLocation] = useState<PersonLocation | null>(null)
  const [boardId, setBoardId] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleProfileSubmit = async (e: React.FormEvent) => {
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
      setStep('monday')
      setSaving(false)
    } catch (err: any) {
      console.error('Error saving profile:', err)
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const handleTestBoard = async () => {
    if (!boardId.trim()) return

    setTesting(true)
    setTestResult(null)

    try {
      const res = await fetch("/api/monday/test-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: boardId.trim() }),
      })

      const json = await res.json()
      if (!res.ok) {
        setTestResult({ ok: false, message: json.error || `Failed (${res.status})` })
        return
      }

      setTestResult({ ok: true, message: `Found "${json.boardName}" (${json.itemsCount} items)` })
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || "Connection failed" })
    } finally {
      setTesting(false)
    }
  }

  const handleMondaySubmit = async () => {
    if (!user || !boardId.trim()) return

    setSaving(true)
    setError('')

    try {
      const supabase = createClient()
      const { error: upsertError } = await supabase
        .from('monday_connections')
        .upsert(
          {
            user_id: user.id,
            api_key: "shared",
            board_id: boardId.trim(),
          },
          { onConflict: 'user_id' }
        )

      if (upsertError) throw upsertError
      onComplete()
    } catch (err: any) {
      console.error('Error saving Monday connection:', err)
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  if (step === 'setup') {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
            <div className="text-center">
              <h1 className="mb-2 text-3xl font-bold text-foreground">Set up your autopilot</h1>
              <p className="text-muted-foreground">
                Connect your tools so Knots can surface your action items automatically.
              </p>
            </div>

            <div className="w-full max-w-sm">
              <SetupInstructionCard />
            </div>

            <Button size="lg" className="w-full max-w-sm" onClick={() => setStep('profile')}>
              Continue
            </Button>
          </div>
        </div>
      </main>
    )
  }

  if (step === 'monday') {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
            <div className="text-center">
              <h1 className="mb-2 text-3xl font-bold text-foreground">Connect your Monday board</h1>
              <p className="text-muted-foreground">
                Knots syncs action items from your Monday.com board. Paste the Board ID below — you can find it in the board URL after <code className="text-xs bg-accent px-1 py-0.5 rounded">/boards/</code>.
              </p>
            </div>

            <div className="w-full max-w-sm">
              <SetupInstructionCard />
            </div>

            <div className="w-full max-w-sm space-y-5">
              <div className="space-y-2">
                <Label htmlFor="onboarding-board-id">Board ID</Label>
                <Input
                  id="onboarding-board-id"
                  type="text"
                  placeholder="e.g. 18403632593"
                  value={boardId}
                  onChange={(e) => { setBoardId(e.target.value); setTestResult(null); setError('') }}
                  disabled={saving}
                  autoFocus
                />
              </div>

              {testResult && (
                <p className={`text-sm ${testResult.ok ? "text-green-600" : "text-destructive"}`}>
                  {testResult.message}
                </p>
              )}

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={handleTestBoard}
                  disabled={testing || !boardId.trim()}
                  className="flex-1"
                >
                  {testing ? 'Testing...' : 'Test connection'}
                </Button>
                <Button
                  size="lg"
                  onClick={handleMondaySubmit}
                  disabled={saving || !boardId.trim()}
                  className="flex-1"
                >
                  {saving ? 'Saving...' : 'Connect'}
                </Button>
              </div>

              <button
                onClick={onComplete}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
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
            <h1 className="mb-2 text-3xl font-bold text-foreground">Welcome to Knots</h1>
            <p className="text-muted-foreground">
              Tell us a bit about yourself to get started
            </p>
          </div>

          <form onSubmit={handleProfileSubmit} className="w-full max-w-sm space-y-5">
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
              <Label>Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="flex flex-wrap" style={{ gap: '8px' }}>
                {LOCATION_OPTIONS.map((loc) => (
                  <button key={loc} type="button" onClick={() => setLocation(location === loc ? null : loc)}
                    disabled={saving}
                    className={cn(
                      "rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
                      location === loc ? "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950" : "bg-accent text-muted-foreground"
                    )}>
                    {loc}
                  </button>
                ))}
              </div>
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
              {saving ? 'Setting up...' : 'Next'}
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}
