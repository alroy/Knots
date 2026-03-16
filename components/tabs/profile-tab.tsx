"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pencil, Check, FileText, Camera, Sparkles } from "lucide-react"
import { MondaySettings } from "@/components/settings/monday-settings"
import { cn } from "@/lib/utils"
import type { UserProfile, PersonLocation } from "@/lib/chief-of-staff-types"
import { LOCATION_OPTIONS } from "@/lib/chief-of-staff-types"

interface ProfileTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}

export function ProfileTab({ contentColumnRef }: ProfileTabProps) {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [editName, setEditName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
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
    avatarUrl: data.avatar_url || '',
    roleTitle: data.role_title || '',
    location: data.location || '',
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
      : field === 'location' ? 'location'
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

  const avatarInputRef = useRef<HTMLInputElement>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    )
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    // Validate file type and size (max 2MB)
    if (!file.type.startsWith('image/')) return
    if (file.size > 2 * 1024 * 1024) return

    // Resize and compress to data URL
    const dataUrl = await resizeImage(file, 256)
    setProfile({ ...profile, avatarUrl: dataUrl })

    try {
      const { error } = await supabase
        .from('user_profile')
        .update({ avatar_url: dataUrl })
        .eq('id', profile.id)
      if (error) throw error
    } catch (error) {
      console.error('Error saving avatar:', error)
      loadProfile()
    }
  }

  if (!profile) return null

  const avatarSrc = profile.avatarUrl || user?.user_metadata?.avatar_url

  const profileSections = [
    { key: 'roleTitle', label: 'Role', value: profile.roleTitle, placeholder: 'e.g. VP of Engineering', isInput: true },
    { key: 'location', label: 'Location', value: profile.location, placeholder: 'Select your location', isSelect: true, options: LOCATION_OPTIONS },
    { key: 'roleDescription', label: 'Responsibilities', value: profile.roleDescription, placeholder: 'Core responsibilities and scope...' },
  ]

  const workingPrefSections = [
    { key: 'communicationStyle', label: 'Communication Style', value: profile.communicationStyle, placeholder: 'How you prefer to receive information...' },
    { key: 'thinkingStyle', label: 'How You Think', value: profile.thinkingStyle, placeholder: 'How you approach problems...' },
    { key: 'blindSpots', label: 'Blind Spots', value: profile.blindSpots, placeholder: 'What you want to be challenged on...' },
    { key: 'energyDrains', label: 'Energy', value: profile.energyDrains, placeholder: 'What drains vs. energizes you...' },
  ]

  const aiPrefSections = [
    { key: 'aiInstructions', label: 'AI Instructions', value: profile.aiInstructions, placeholder: 'How your AI Chief of Staff should work with you...' },
  ]

  const handleNameEdit = () => {
    setEditName(profile.name)
    setEditingSection('name')
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }

  const handleNameSave = () => {
    handleSave('name', editName.trim())
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleNameSave() }
    if (e.key === 'Escape') setEditingSection(null)
  }

  return (
    <div className="pb-24">
      {/* Header with user info */}
      <header className="mb-10 md:mb-12">
        <div className="flex items-center gap-4 mb-4">
          {/* Avatar with upload overlay */}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="relative w-16 h-16 rounded-full overflow-hidden bg-accent shrink-0 group cursor-pointer"
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-2xl font-medium">
                {(profile.name || user?.email || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-5 w-5 text-white" />
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </button>
          <div className="min-w-0 flex-1">
            {editingSection === 'name' ? (
              <div>
                <Input
                  ref={nameInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  placeholder="Your full name"
                  className="text-2xl font-bold h-auto py-0 px-0 bg-transparent border-none shadow-none focus-visible:ring-0 text-foreground"
                />
                <div className="flex gap-2 mt-1">
                  <Button size="sm" onClick={handleNameSave} className="text-xs h-7 gap-1">
                    <Check className="h-3 w-3" /> Save
                  </Button>
                  <button onClick={() => setEditingSection(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="group cursor-pointer flex items-center gap-2" onClick={handleNameEdit}>
                <h1 className="text-2xl font-bold text-foreground">{profile.name || 'Your Profile'}</h1>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            {user?.email && (
              <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
            )}
          </div>
        </div>
      </header>

      {/* PROFILE card */}
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Profile</h3>
      <div className="rounded-lg bg-card p-4 mb-6">
        <div className="space-y-1">
          {profileSections.map(({ key, label, value, placeholder, isInput, isSelect, options }) => (
            <ProfileSection
              key={key}
              sectionKey={key}
              label={label}
              value={value}
              placeholder={placeholder}
              isInput={isInput}
              isSelect={isSelect}
              selectOptions={options}
              isEditing={editingSection === key}
              onStartEdit={() => setEditingSection(key)}
              onSave={(v) => handleSave(key, v)}
              onCancel={() => setEditingSection(null)}
            />
          ))}
        </div>
      </div>

      {/* WORKING PREFERENCES card */}
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Working Preferences</h3>
      <div className="rounded-lg bg-card p-4 mb-6">
        <div className="space-y-1">
          {workingPrefSections.map(({ key, label, value, placeholder }) => (
            <ProfileSection
              key={key}
              sectionKey={key}
              label={label}
              value={value}
              placeholder={placeholder}
              isEditing={editingSection === key}
              onStartEdit={() => setEditingSection(key)}
              onSave={(v) => handleSave(key, v)}
              onCancel={() => setEditingSection(null)}
            />
          ))}
        </div>
      </div>

      {/* AI PREFERENCES card */}
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">AI Preferences</h3>
      <div className="rounded-lg bg-card p-4 mb-6">
        <div className="space-y-1">
          {aiPrefSections.map(({ key, label, value, placeholder }) => (
            <ProfileSection
              key={key}
              sectionKey={key}
              label={label}
              value={value}
              placeholder={placeholder}
              isEditing={editingSection === key}
              onStartEdit={() => setEditingSection(key)}
              onSave={(v) => handleSave(key, v)}
              onCancel={() => setEditingSection(null)}
            />
          ))}
        </div>
      </div>

      {/* Settings zone */}
      <div className="border-t border-border mt-8 pt-8">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Settings</h3>
        <MondaySettings />

        {/* Sign Out */}
        <button
          onClick={() => signOut()}
          className="mt-6 block text-sm font-medium text-red-600 py-3 px-4 rounded-lg hover:bg-red-50 active:bg-red-100 dark:hover:bg-red-950/30 dark:active:bg-red-950/50 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* FAB */}
      <ProfileFAB
        onImportTranscript={() => setShowTranscript(true)}
        contentColumnRef={contentColumnRef}
      />

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

function ProfileSection({ sectionKey, label, value, placeholder, isInput, isSelect, selectOptions, isEditing, onStartEdit, onSave, onCancel }: {
  sectionKey: string
  label: string
  value: string
  placeholder: string
  isInput?: boolean
  isSelect?: boolean
  selectOptions?: readonly string[]
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
      if (!isSelect) setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isEditing, value, isSelect])

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
      <div className="p-4">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
        <div className="mt-2">
          {isSelect && selectOptions ? (
            <select
              value={editValue}
              onChange={(e) => { setEditValue(e.target.value); onSave(e.target.value); }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">None</option>
              {selectOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : isInput ? (
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
          {!isSelect && (
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={handleSave} className="text-xs h-7 gap-1">
                <Check className="h-3 w-3" /> Save
              </Button>
              <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          )}
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

// --- Profile FAB ---

function ProfileFAB({ onImportTranscript, contentColumnRef }: {
  onImportTranscript: () => void
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [fabPosition, setFabPosition] = useState<{ right: number } | null>(null)

  useEffect(() => {
    const update = () => {
      if (!contentColumnRef?.current || !window.matchMedia('(min-width: 768px)').matches) {
        setFabPosition(null)
        return
      }
      const rect = contentColumnRef.current.getBoundingClientRect()
      setFabPosition({ right: window.innerWidth - rect.right + 20 })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [contentColumnRef])

  useEffect(() => {
    if (!isOpen) return
    const close = () => setIsOpen(false)
    window.addEventListener('scroll', close, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', close, true)
  }, [isOpen])

  const handleAction = (action: () => void) => {
    setIsOpen(false)
    action()
  }

  const fixedStyle: React.CSSProperties = {
    transform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-200"
          style={fixedStyle}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className="fixed z-50"
        style={{
          ...fixedStyle,
          bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
          right: fabPosition?.right ?? 24,
        }}
      >
        {isOpen && (
          <div className="absolute bottom-16 right-0 flex flex-col items-end gap-3 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              onClick={() => handleAction(onImportTranscript)}
              className="flex items-center gap-3 group min-h-[48px]"
              style={{ touchAction: "manipulation" }}
            >
              <span className="rounded-full bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-md whitespace-nowrap">
                Import from transcript
              </span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground shadow-md">
                <FileText className="h-5 w-5" />
              </span>
            </button>
          </div>
        )}

        <Button
          onClick={() => setIsOpen(!isOpen)}
          size="icon"
          className="h-14 w-14 md:h-12 md:w-12 rounded-full shadow-lg"
          style={{ touchAction: "manipulation" }}
          aria-label={isOpen ? "Close menu" : "Profile actions"}
          aria-expanded={isOpen}
        >
          <Sparkles className={cn(
            "h-6 w-6 md:h-5 md:w-5 transition-transform duration-200",
            isOpen && "rotate-45"
          )} />
        </Button>
      </div>
    </>
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

// --- Image Resize Utility ---

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        if (width > height) {
          if (width > maxSize) { height = (height * maxSize) / width; width = maxSize }
        } else {
          if (height > maxSize) { width = (width * maxSize) / height; height = maxSize }
        }
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}
