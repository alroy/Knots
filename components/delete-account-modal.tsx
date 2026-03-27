"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"

const REASONS = [
  "Too complex",
  "Missing features",
  "Moved to another tool",
  "I was just checking it out",
  "Other",
] as const

interface DeleteAccountModalProps {
  onClose: () => void
}

export function DeleteAccountModal({ onClose }: DeleteAccountModalProps) {
  const { signOut } = useAuth()

  // Questionnaire state
  const [reason, setReason] = useState<string>("")
  const [recommendScore, setRecommendScore] = useState<number | null>(null)
  const [finalNote, setFinalNote] = useState("")

  // Flow state
  const [step, setStep] = useState<"questionnaire" | "confirm">("questionnaire")
  const [confirmText, setConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  const canProceedToConfirm = reason !== ""

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return

    setDeleting(true)
    setError("")

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          recommendScore,
          finalNote: finalNote.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete account")
      }

      // Sign out and redirect
      await signOut()
      window.location.href = "/goodbye"
    } catch (err: any) {
      console.error("Error deleting account:", err)
      setError(err.message || "Something went wrong. Please try again.")
      setDeleting(false)
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
        onClick={deleting ? undefined : onClose}
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
          {step === "questionnaire" ? (
            <>
              <h2 className="text-lg font-bold text-foreground mb-1">
                Before you go...
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                We&apos;d love to understand why you&apos;re leaving so we can improve.
              </p>

              {/* Reason */}
              <div className="mb-5">
                <p className="text-sm font-medium text-foreground mb-2.5">
                  Why are you untangling from Knots?
                </p>
                <div className="space-y-2">
                  {REASONS.map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-3 cursor-pointer group"
                      onClick={() => setReason(r)}
                    >
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          reason === r
                            ? "border-primary bg-primary"
                            : "border-border group-hover:border-muted-foreground"
                        }`}
                      >
                        {reason === r && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span className="text-sm text-foreground">{r}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* NPS */}
              <div className="mb-5">
                <p className="text-sm font-medium text-foreground mb-2.5">
                  Would you recommend us to a friend?
                </p>
                <div className="flex gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRecommendScore(n)}
                      className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${
                        recommendScore === n
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-muted-foreground hover:bg-accent-hover"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">Not likely</span>
                  <span className="text-[10px] text-muted-foreground">Very likely</span>
                </div>
              </div>

              {/* Final note */}
              <div className="mb-5">
                <p className="text-sm font-medium text-foreground mb-2">
                  Any final knots you want us to know about?
                </p>
                <Textarea
                  value={finalNote}
                  onChange={(e) => setFinalNote(e.target.value)}
                  placeholder="Optional — anything else on your mind..."
                  rows={3}
                  className="bg-card border-border/60 shadow-none resize-none"
                />
              </div>

              <div className="flex flex-row-reverse gap-3">
                <Button
                  onClick={() => setStep("confirm")}
                  disabled={!canProceedToConfirm}
                  variant="destructive"
                  className="px-5 h-9 font-medium"
                >
                  Continue
                </Button>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-destructive mb-1">
                Delete your account
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                This action is <strong className="text-foreground">permanent</strong> and
                cannot be undone. All your tasks, goals, people, and profile data will be
                permanently erased.
              </p>

              <div className="mb-5">
                <p className="text-sm font-medium text-foreground mb-2">
                  Type <span className="font-mono font-bold">DELETE</span> to confirm
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => { setConfirmText(e.target.value); setError("") }}
                  placeholder="DELETE"
                  className="bg-card border-border/60 shadow-none font-mono"
                  disabled={deleting}
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-destructive mb-4">{error}</p>}

              <div className="flex flex-row-reverse gap-3">
                <Button
                  onClick={handleDelete}
                  disabled={confirmText !== "DELETE" || deleting}
                  variant="destructive"
                  className="px-5 h-9 font-medium"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Deleting...
                    </>
                  ) : (
                    "Delete my account"
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => { setStep("questionnaire"); setConfirmText(""); setError("") }}
                  disabled={deleting}
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
