"use client"

import { useState, useRef, useEffect } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Heart, Loader2 } from "lucide-react"

interface FeedbackModalProps {
  category: "bug" | "improvement"
  onClose: () => void
}

export function FeedbackModal({ category, onClose }: FeedbackModalProps) {
  const { user } = useAuth()
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const subjectRef = useRef<HTMLInputElement>(null)

  const isBug = category === "bug"

  useEffect(() => {
    setTimeout(() => subjectRef.current?.focus(), 100)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !user) return

    setSubmitting(true)
    setError("")

    try {
      const supabase = createClient()
      const { error: insertError } = await supabase.from("feedback").insert({
        user_id: user.id,
        user_name: user.user_metadata?.full_name || "",
        user_email: user.email || "",
        category,
        subject: subject.trim(),
        description: description.trim(),
      })
      if (insertError) throw insertError
      setSubmitted(true)
    } catch (err: any) {
      console.error("Error submitting feedback:", err)
      setError(err.message || "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const fixedStyle: React.CSSProperties = {
    transform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        style={fixedStyle}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-4 z-50 mx-auto max-w-lg"
        style={{
          ...fixedStyle,
          top: "50%",
          transform: "translateY(-50%) translateZ(0)",
          maxHeight: "calc(100dvh - 2rem)",
          overflowY: "auto",
        }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-background rounded-3xl shadow-xl p-6">
          {submitted ? (
            <div className="flex flex-col items-center text-center py-6">
              <Heart className="h-12 w-12 text-amber-400 fill-amber-400 mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">Thank you!</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Thanks for helping us untangle Knots! Your feedback has been sent to our team.
              </p>
              <Button onClick={onClose} className="px-6 h-9 font-medium">
                Close
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-foreground mb-1">
                {isBug ? "Report a bug" : "Suggest an improvement"}
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                {isBug
                  ? "Help us squash it. Describe what happened and how to reproduce it."
                  : "Tell us what would make Knots better for you."}
              </p>

              <form onSubmit={handleSubmit}>
                <div className="space-y-2 mb-4">
                  <Label htmlFor="feedback-subject" className="text-sm text-muted-foreground">
                    Subject
                  </Label>
                  <Input
                    ref={subjectRef}
                    id="feedback-subject"
                    value={subject}
                    onChange={(e) => { setSubject(e.target.value); setError("") }}
                    placeholder="Brief summary"
                    className="bg-card border-border/60 shadow-none"
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2 mb-5">
                  <Label htmlFor="feedback-description" className="text-sm text-muted-foreground">
                    The Knot
                  </Label>
                  <Textarea
                    id="feedback-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      isBug
                        ? "Steps to reproduce, what you expected, and what happened instead..."
                        : "Describe the improvement and why it would be useful..."
                    }
                    rows={5}
                    className="bg-card border-border/60 shadow-none resize-none"
                    disabled={submitting}
                  />
                </div>

                {error && <p className="text-sm text-destructive mb-4">{error}</p>}

                <div className="flex flex-row-reverse gap-3">
                  <Button
                    type="submit"
                    disabled={submitting || !subject.trim()}
                    className="px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75"
                    style={{ touchAction: "manipulation" }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        Sending...
                      </>
                    ) : (
                      "Send"
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  )
}
