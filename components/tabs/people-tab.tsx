"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { Trash2, Plus, ChevronRight, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CardActionGroup, cardActionDestructiveClass } from "@/components/ui/card-action-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { Person } from "@/lib/chief-of-staff-types"
import { RELATIONSHIP_LABELS, RELATIONSHIP_COLORS } from "@/lib/chief-of-staff-types"
import { StickyHeader } from "@/components/sticky-header"

interface PeopleTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}

export function PeopleTab({ contentColumnRef }: PeopleTabProps) {
  const { user } = useAuth()
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editPerson, setEditPerson] = useState<Person | null>(null)
  const [detailPerson, setDetailPerson] = useState<Person | null>(null)
  const [deleteConfirmPerson, setDeleteConfirmPerson] = useState<Person | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (user) loadPeople()
  }, [user])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('people-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people', filter: `user_id=eq.${user.id}` }, () => {
        loadPeople()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const loadPeople = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true })
      if (error) throw error
      setPeople((data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        role: p.role || '',
        relationship: p.relationship,
        context: p.context || '',
        strengths: p.strengths || '',
        growthAreas: p.growth_areas || '',
        motivations: p.motivations || '',
        communicationStyle: p.communication_style || '',
        currentFocus: p.current_focus || '',
        risksConcerns: p.risks_concerns || '',
        position: p.position,
        createdAt: p.created_at,
      })))
    } catch (error) {
      console.error('Error loading people:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (data: PersonFormData) => {
    if (!user) return
    try {
      const { error } = await supabase.from('people').insert({
        name: data.name,
        role: data.role,
        relationship: data.relationship,
        context: data.context,
        strengths: data.strengths,
        growth_areas: data.growthAreas,
        motivations: data.motivations,
        communication_style: data.communicationStyle,
        current_focus: data.currentFocus,
        risks_concerns: data.risksConcerns,
        user_id: user.id,
        position: 0,
      })
      if (error) throw error
      loadPeople()
    } catch (error) {
      console.error('Error adding person:', error)
    }
  }

  const handleUpdate = async (id: string, data: PersonFormData) => {
    try {
      const { error } = await supabase.from('people').update({
        name: data.name,
        role: data.role,
        relationship: data.relationship,
        context: data.context,
        strengths: data.strengths,
        growth_areas: data.growthAreas,
        motivations: data.motivations,
        communication_style: data.communicationStyle,
        current_focus: data.currentFocus,
        risks_concerns: data.risksConcerns,
      }).eq('id', id)
      if (error) throw error
      loadPeople()
    } catch (error) {
      console.error('Error updating person:', error)
    }
  }

  const handleDelete = async (id: string) => {
    setPeople((prev) => prev.filter((p) => p.id !== id))
    if (detailPerson?.id === id) setDetailPerson(null)
    try {
      const { error } = await supabase.from('people').delete().eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error deleting person:', error)
      loadPeople()
    }
  }

  // Group by relationship
  const grouped = {
    manager: people.filter(p => p.relationship === 'manager'),
    team: people.filter(p => p.relationship === 'team'),
    report: people.filter(p => p.relationship === 'report'),
    stakeholder: people.filter(p => p.relationship === 'stakeholder'),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading people...</p>
      </div>
    )
  }

  // Detail view
  if (detailPerson) {
    return (
      <>
        <PersonDetail
          person={detailPerson}
          onBack={() => setDetailPerson(null)}
          onEdit={() => { setEditPerson(detailPerson); setIsFormOpen(true) }}
          onDelete={() => setDeleteConfirmPerson(detailPerson)}
        />

        {isFormOpen && (
          <PersonFormModal
            person={editPerson}
            onSubmit={(data) => {
              if (editPerson) {
                handleUpdate(editPerson.id, data)
              }
              setIsFormOpen(false)
              setEditPerson(null)
              setDetailPerson(null)
            }}
            onClose={() => { setIsFormOpen(false); setEditPerson(null) }}
          />
        )}

        {deleteConfirmPerson && (
          <DeleteConfirmModal
            personName={deleteConfirmPerson.name}
            onConfirm={() => { handleDelete(deleteConfirmPerson.id); setDeleteConfirmPerson(null) }}
            onClose={() => setDeleteConfirmPerson(null)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <StickyHeader
        title="People"
        byline={<p>{
          people.length === 0
            ? "Your stakeholder directory is empty."
            : people.length === 1
              ? "Managing 1 key relationship."
              : `Managing ${people.length} key relationships.`
        }</p>}
      />

      {people.length > 0 ? (
        <div className="space-y-6">
          {(['manager', 'team', 'report', 'stakeholder'] as const).map((rel) => {
            const group = grouped[rel]
            if (group.length === 0) return null
            return (
              <div key={rel}>
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                  {rel === 'report' ? 'Direct Reports' : rel === 'manager' ? 'Manager' : rel === 'team' ? 'Team' : 'Stakeholders'}
                </h2>
                <div className="flex flex-col gap-2">
                  {group.map((person) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      onClick={() => setDetailPerson(person)}
                      onDelete={() => setDeleteConfirmPerson(person)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <img src="/people.svg" alt="" aria-hidden="true" className="h-20 w-20 opacity-40 mb-5" />
          <p className="text-lg font-semibold text-foreground mb-1">Stakeholder directory.</p>
          <p className="text-muted-foreground text-sm max-w-[300px]">
            Your network is currently empty. Add the managers, team members, and stakeholders you work with to track their priorities and preferences.
          </p>
          <button
            type="button"
            onClick={() => { setEditPerson(null); setIsFormOpen(true) }}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-5 h-9 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-transform duration-75"
          >
            Add your first connection
          </button>
        </div>
      )}

      <FAB onClick={() => { setEditPerson(null); setIsFormOpen(true) }} contentColumnRef={contentColumnRef} />

      {isFormOpen && (
        <PersonFormModal
          person={editPerson}
          onSubmit={(data) => {
            if (editPerson) {
              handleUpdate(editPerson.id, data)
            } else {
              handleAdd(data)
            }
            setIsFormOpen(false)
            setEditPerson(null)
            setDetailPerson(null)
          }}
          onClose={() => { setIsFormOpen(false); setEditPerson(null) }}
        />
      )}

      {deleteConfirmPerson && (
        <DeleteConfirmModal
          personName={deleteConfirmPerson.name}
          onConfirm={() => { handleDelete(deleteConfirmPerson.id); setDeleteConfirmPerson(null) }}
          onClose={() => setDeleteConfirmPerson(null)}
        />
      )}
    </>
  )
}

// --- Person Card ---

function PersonCard({ person, onClick, onDelete }: { person: Person; onClick: () => void; onDelete: () => void }) {
  return (
    <div
      className="group flex items-center gap-3 rounded-lg bg-card p-4 hover:bg-accent-hover transition-colors cursor-pointer"
      onClick={onClick}
    >
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
        RELATIONSHIP_COLORS[person.relationship]
      )}>
        {person.name.charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">{person.name}</span>
        {person.role && <span className="block text-xs text-muted-foreground">{person.role}</span>}
        {person.currentFocus && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{person.currentFocus}</p>
        )}
      </div>

      <CardActionGroup>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className={cardActionDestructiveClass}
          aria-label={`Delete ${person.name}`}
        >
          <Trash2 className="h-5 w-5" />
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
      </CardActionGroup>
    </div>
  )
}

// --- Person Detail ---

function PersonDetail({ person, onBack, onEdit, onDelete }: {
  person: Person; onBack: () => void; onEdit: () => void; onDelete: () => void
}) {
  const sections = [
    { label: "What they care about", value: person.context },
    { label: "Current focus", value: person.currentFocus },
    { label: "Strengths", value: person.strengths },
    { label: "Growth areas", value: person.growthAreas },
    { label: "Motivations", value: person.motivations },
    { label: "Communication style", value: person.communicationStyle },
    { label: "Risks & Concerns", value: person.risksConcerns },
  ]

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-start gap-3 mb-8">
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0",
          RELATIONSHIP_COLORS[person.relationship]
        )}>
          {person.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{person.name}</h1>
          <p className="text-sm text-muted-foreground">{person.role}</p>
          <span className={cn(
            "inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            RELATIONSHIP_COLORS[person.relationship]
          )}>
            {RELATIONSHIP_LABELS[person.relationship]}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map(({ label, value }) => {
          if (!value) return null
          return (
            <div key={label}>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
              <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{value}</p>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2 mt-8">
        <Button size="sm" onClick={onEdit} className="text-xs h-8">Edit</Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-xs h-8 text-destructive hover:text-destructive">Delete</Button>
      </div>
    </div>
  )
}

// --- FAB ---

function FAB({ onClick, contentColumnRef }: { onClick: () => void; contentColumnRef: React.RefObject<HTMLDivElement | null> }) {
  const [fabPosition, setFabPosition] = useState<{ right: number } | null>(null)

  useEffect(() => {
    const update = () => {
      if (!contentColumnRef?.current || !window.matchMedia('(min-width: 768px)').matches) {
        setFabPosition(null); return
      }
      const rect = contentColumnRef.current.getBoundingClientRect()
      setFabPosition({ right: window.innerWidth - rect.right + 20 })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [contentColumnRef])

  return (
    <div
      className="fixed z-30"
      style={{
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        right: fabPosition?.right ?? 24,
        transform: "translateZ(0)",
        WebkitBackfaceVisibility: "hidden",
        backfaceVisibility: "hidden",
      }}
    >
      <Button
        onClick={onClick}
        size="icon"
        className="h-14 w-14 md:h-12 md:w-12 rounded-full shadow-lg"
        style={{ touchAction: "manipulation" }}
        aria-label="Add person"
      >
        <Plus className="h-6 w-6 md:h-5 md:w-5" />
      </Button>
    </div>
  )
}

// --- Delete Confirm Modal ---

function DeleteConfirmModal({ personName, onConfirm, onClose }: {
  personName: string; onConfirm: () => void; onClose: () => void
}) {
  const fixedStyle: React.CSSProperties = {
    transform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" style={fixedStyle} onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-x-4 z-50 mx-auto max-w-sm"
        style={{ ...fixedStyle, top: "50%", transform: "translateY(-50%) translateZ(0)" }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-background rounded-lg shadow-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">Delete person</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Delete <span className="font-medium text-foreground">{personName}</span>? This can&apos;t be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100">
              Cancel
            </button>
            <Button onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-700 px-5 h-9 font-medium">
              Delete
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

// --- Person Form Modal ---

interface PersonFormData {
  name: string
  role: string
  relationship: 'manager' | 'team' | 'report' | 'stakeholder'
  context: string
  strengths: string
  growthAreas: string
  motivations: string
  communicationStyle: string
  currentFocus: string
  risksConcerns: string
}

function PersonFormModal({ person, onSubmit, onClose }: {
  person: Person | null
  onSubmit: (data: PersonFormData) => void
  onClose: () => void
}) {
  const [name, setName] = useState(person?.name || '')
  const [role, setRole] = useState(person?.role || '')
  const [relationship, setRelationship] = useState<'manager' | 'team' | 'report' | 'stakeholder'>(person?.relationship || 'stakeholder')
  const [context, setContext] = useState(person?.context || '')
  const [strengths, setStrengths] = useState(person?.strengths || '')
  const [growthAreas, setGrowthAreas] = useState(person?.growthAreas || '')
  const [motivations, setMotivations] = useState(person?.motivations || '')
  const [communicationStyle, setCommunicationStyle] = useState(person?.communicationStyle || '')
  const [currentFocus, setCurrentFocus] = useState(person?.currentFocus || '')
  const [risksConcerns, setRisksConcerns] = useState(person?.risksConcerns || '')
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Please add a name'); return }
    onSubmit({ name: name.trim(), role: role.trim(), relationship, context: context.trim(), strengths: strengths.trim(), growthAreas: growthAreas.trim(), motivations: motivations.trim(), communicationStyle: communicationStyle.trim(), currentFocus: currentFocus.trim(), risksConcerns: risksConcerns.trim() })
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
        className="fixed inset-x-4 z-50 mx-auto max-w-md"
        style={{ ...fixedStyle, top: "50%", transform: "translateY(-50%) translateZ(0)", maxHeight: "calc(100dvh - 2rem)", overflowY: "auto" }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-background rounded-lg shadow-xl p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-foreground mb-2">{person ? "Edit Person" : "Add Person"}</h2>
            <p className="text-sm text-muted-foreground">Add a new colleague or stakeholder to your network.</p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="person-name" className="text-sm text-muted-foreground">Name</Label>
                <Input ref={nameRef} id="person-name" value={name} onChange={(e) => { setName(e.target.value); setError('') }}
                  placeholder="Full name" className="h-10 bg-card border-border/60 shadow-none" />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="person-role" className="text-sm text-muted-foreground">Role / Title</Label>
                <Input id="person-role" value={role} onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. VP Engineering" className="h-10 bg-card border-border/60 shadow-none" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Relationship</Label>
                <div className="flex gap-2">
                  {(['manager', 'team', 'report', 'stakeholder'] as const).map((rel) => (
                    <button key={rel} type="button" onClick={() => setRelationship(rel)}
                      className={cn(
                        "rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
                        relationship === rel ? RELATIONSHIP_COLORS[rel] : "bg-accent text-muted-foreground"
                      )}>
                      {RELATIONSHIP_LABELS[rel]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">What they care about <span className="text-muted-foreground/60">(optional)</span></Label>
                <Textarea value={context} onChange={(e) => setContext(e.target.value)}
                  placeholder="Expectations, priorities, what matters to them..." rows={2} className="bg-card border-border/60 shadow-none resize-none" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Current focus <span className="text-muted-foreground/60">(optional)</span></Label>
                <Input value={currentFocus} onChange={(e) => setCurrentFocus(e.target.value)}
                  placeholder="What they're working on now" className="h-10 bg-card border-border/60 shadow-none" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Strengths <span className="text-muted-foreground/60">(optional)</span></Label>
                <Textarea value={strengths} onChange={(e) => setStrengths(e.target.value)}
                  placeholder="What they're great at..." rows={2} className="bg-card border-border/60 shadow-none resize-none" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Growth areas <span className="text-muted-foreground/60">(optional)</span></Label>
                <Textarea value={growthAreas} onChange={(e) => setGrowthAreas(e.target.value)}
                  placeholder="Where they need development..." rows={2} className="bg-card border-border/60 shadow-none resize-none" />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Communication style <span className="text-muted-foreground/60">(optional)</span></Label>
                <Input value={communicationStyle} onChange={(e) => setCommunicationStyle(e.target.value)}
                  placeholder="How they prefer to receive info" className="h-10 bg-card border-border/60 shadow-none" />
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <Button type="submit" className="w-full sm:w-auto px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75">
                {person ? "Save changes" : "Add Person"}
              </Button>
              <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
