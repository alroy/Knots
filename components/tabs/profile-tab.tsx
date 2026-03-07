"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pencil, Check, FileText, LogOut } from "lucide-react"
import { SlackSettings } from "@/components/settings/slack-settings"
import type { UserProfile } from "@/lib/chief-of-staff-types"

export function ProfileTab() {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (user) loadProfile()
  }, [user])

  const loadProfile = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('user_profile')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code === 'PGRST116') {
        // No profile yet, create one
        const { data: newProfile, error: insertError } = await supabase
          .from('user_profile')
          .insert({ user_id: user.id })
          .select()
          .single()
        if (insertError) throw insertError
        setProfile(mapProfile(newProfile))
      } else if (error) {
        throw error
      } else {
        setProfile(mapProfile(data))
      }
    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const mapProfile = (data: any): UserProfile => ({
    id: data.id,
    name: data.name || '',
    roleTitle: data.role_title || '',
    roleDescription: data.role_description || '',
    communicationStyle: data.communication_style || '',
    thinkingStyle: data.thinking_style || '',
    blindSpots: data.blind_spots || '',
    energyDrains: data.energy_drains || '',
    aiInstructions: data.ai_instructions || '',
  })

  const handleSave = async (field: string, value: string) => {
    if (!profile) return
    const dbField = field === 'roleTitle' ? 'role_title'
      : field === 'roleDescription' ? 'role_description'
      : field === 'communicationStyle' ? 'communication_style'
      : field === 'thinkingStyle' ? 'thinking_style'
      : field === 'blindSpots' ? 'blind_spots'
      : field === 'energyDrains' ? 'energy_drains'
      : field === 'aiInstructions' ? 'ai_instructions'
      : field

    setProfile({ ...profile, [field]: value })
    setEditingSection(null)

    try {
      const { error } = await supabase
        .from('user_profile')
        .update({ [dbField]: value })
        .eq('id', profile.id)
      if (error) throw error
    } catch (error) {
      console.error('Error saving profile:', error)
      loadProfile() // Reload on error
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    )
  }

  if (!profile) return null

  const sections = [
    { key: 'name', label: 'Name', value: profile.name, placeholder: 'Your full name', isInput: true },
    { key: 'roleTitle', label: 'Role', value: profile.roleTitle, placeholder: 'e.g. VP of Engineering', isInput: true },
    { key: 'roleDescription', label: 'Responsibilities', value: profile.roleDescription, placeholder: 'Core responsibilities and scope...' },
    { key: 'communicationStyle', label: 'Communication Style', value: profile.communicationStyle, placeholder: 'How you prefer to receive information...' },
    { key: 'thinkingStyle', label: 'How You Think', value: profile.thinkingStyle, placeholder: 'How you approach problems...' },
    { key: 'blindSpots', label: 'Blind Spots', value: profile.blindSpots, placeholder: 'What you want to be challenged on...' },
    { key: 'energyDrains', label: 'Energy', value: profile.energyDrains, placeholder: 'What drains vs. energizes you...' },
    { key: 'aiInstructions', label: 'AI Instructions', value: profile.aiInstructions, placeholder: 'How your AI Chief of Staff should work with you...' },
  ]

  return (
    <div>
      {/* Header with user info */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-accent shrink-0">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-lg font-medium">
                {(profile.name || user?.email || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{profile.name || 'Your Profile'}</h1>
            <p className="text-sm text-muted-foreground">{profile.roleTitle || user?.email}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowTranscript(true)}
            className="text-xs h-8 gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" />
            Import from transcript
          </Button>
        </div>
      </header>

      {/* Profile sections */}
      <div className="space-y-1">
        {sections.map(({ key, label, value, placeholder, isInput }) => (
          <ProfileSection
            key={key}
            sectionKey={key}
            label={label}
            value={value}
            placeholder={placeholder}
            isInput={isInput}
            isEditing={editingSection === key}
            onStartEdit={() => setEditingSection(key)}
            onSave={(v) => handleSave(key, v)}
            onCancel={() => setEditingSection(null)}
          />
        ))}
      </div>

      {/* Settings */}
      <div className="mt-10 pt-6 border-t border-border">
        <SlackSettings />
        <Button
          onClick={signOut}
          className="mt-4 w-full bg-accent text-foreground hover:bg-accent-hover"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>

      {/* Transcript import modal */}
      {showTranscript && (
        <TranscriptImportModal
          onClose={() => setShowTranscript(false)}
          onImported={() => { setShowTranscript(false); loadProfile() }}
        />
      )}
    </div>
  )
}

// --- Profile Section ---

function ProfileSection({ sectionKey, label, value, placeholder, isInput, isEditing, onStartEdit, onSave, onCancel }: {
  sectionKey: string
  label: string
  value: string
  placeholder: string
  isInput?: boolean
  isEditing: boolean
  onStartEdit: () => void
  onSave: (value: string) => void
  onCancel: () => void
}) {
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing) {
      setEditValue(value)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isEditing, value])

  const handleSave = () => {
    onSave(editValue.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (isInput || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') onCancel()
  }

  if (isEditing) {
    return (
      <div className="rounded-lg bg-card p-4">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
        <div className="mt-2">
          {isInput ? (
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="h-10 bg-background border-border/60 shadow-none"
            />
          ) : (
            <Textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={3}
              className="bg-background border-border/60 shadow-none resize-none"
            />
          )}
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={handleSave} className="text-xs h-7 gap-1">
              <Check className="h-3 w-3" /> Save
            </Button>
            <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-lg p-4 hover:bg-accent-hover transition-colors cursor-pointer group"
      onClick={onStartEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          {value ? (
            <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{value}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground/50 italic">{placeholder}</p>
          )}
        </div>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}

// --- Transcript Import Modal ---

function TranscriptImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [transcript, setTranscript] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [])

  const handleParse = async () => {
    if (!transcript.trim()) {
      setError('Please paste your transcript first')
      return
    }

    setIsProcessing(true)
    setError('')
    setStatus('Analyzing transcript...')

    try {
      const res = await fetch('/api/parse-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcript.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to parse transcript')
      }

      setStatus('Populating your profile...')
      const data = await res.json()

      // Data has been inserted by the API route
      setStatus(`Done! Created ${data.summary.goalsCount} goals, ${data.summary.peopleCount} people, ${data.summary.backlogCount} backlog items.`)

      setTimeout(() => {
        onImported()
      }, 1500)
    } catch (err: any) {
      console.error('Error parsing transcript:', err)
      setError(err.message || 'Something went wrong')
      setIsProcessing(false)
    }
  }

  const fixedStyle: React.CSSProperties = {
    transform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" style={fixedStyle} onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-x-4 z-50 mx-auto max-w-lg"
        style={{ ...fixedStyle, top: "50%", transform: "translateY(-50%) translateZ(0)", maxHeight: "calc(100dvh - 2rem)", overflowY: "auto" }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-background rounded-lg shadow-xl p-6">
          <h2 className="text-lg font-bold text-foreground mb-2">Import from Transcript</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Paste a transcript about your role, team, priorities, and working style. AI will extract and populate your profile, goals, people, and backlog.
          </p>

          <Textarea
            ref={textareaRef}
            value={transcript}
            onChange={(e) => { setTranscript(e.target.value); setError('') }}
            placeholder="Paste your transcript here..."
            rows={10}
            className="bg-card border-border/60 shadow-none resize-none mb-4"
            disabled={isProcessing}
          />

          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          {status && !error && <p className="text-sm text-muted-foreground mb-4">{status}</p>}

          <div className="flex items-center gap-4">
            <Button
              onClick={handleParse}
              disabled={isProcessing || !transcript.trim()}
              className="px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75"
            >
              {isProcessing ? "Processing..." : "Parse & Import"}
            </Button>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
