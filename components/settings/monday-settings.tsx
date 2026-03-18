"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { SetupInstructionCard } from "@/components/ui/setup-instruction-card"

interface MondayConnection {
  id: string
  board_id: string
  created_at: string
}

export function MondaySettings() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<MondayConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [boardId, setBoardId] = useState("")
  const [error, setError] = useState("")
  const [showInstructions, setShowInstructions] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (!user) return

    const fetchConnection = async () => {
      try {
        const { data, error } = await supabase
          .from("monday_connections")
          .select("id, board_id, created_at")
          .eq("user_id", user.id)
          .maybeSingle()

        if (error) {
          // Table missing or RLS — treat as "no connection yet", still show UI
          console.warn("Monday connection fetch:", error.message)
        } else {
          setConnection(data)
        }
      } catch (err) {
        console.warn("Monday connection fetch failed:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchConnection()
  }, [user])

  const handleTest = async () => {
    if (!boardId.trim()) {
      setError("Please enter a board ID")
      return
    }

    setTesting(true)
    setTestResult(null)
    setError("")

    try {
      const res = await fetch("/api/monday/test-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: boardId.trim() }),
      })

      const json = await res.json()
      if (!res.ok) {
        setTestResult({ ok: false, message: json.error || `API returned ${res.status}` })
        return
      }

      setTestResult({ ok: true, message: `Connected to "${json.boardName}" (${json.itemsCount} items)` })
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || "Connection failed" })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!user || !boardId.trim()) {
      setError("Please enter a board ID")
      return
    }

    setSaving(true)
    setError("")

    try {
      const { data, error: upsertError } = await supabase
        .from("monday_connections")
        .upsert(
          {
            user_id: user.id,
            api_key: "shared",
            board_id: boardId.trim(),
          },
          { onConflict: "user_id" }
        )
        .select("id, board_id, created_at")
        .single()

      if (upsertError) throw upsertError

      setConnection(data)
      setShowForm(false)
      setBoardId("")
      setTestResult(null)
    } catch (err: any) {
      setError(err.message || "Failed to save connection")
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!connection || !user) return

    setDisconnecting(true)
    try {
      const { error } = await supabase
        .from("monday_connections")
        .delete()
        .eq("id", connection.id)
        .eq("user_id", user.id)

      if (error) {
        console.error("Error disconnecting Monday:", error)
      } else {
        setConnection(null)
      }
    } finally {
      setDisconnecting(false)
      setShowDisconnectModal(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-accent">
        {/* Monday.com Icon */}
        <div className="w-8 h-8 flex items-center justify-center">
          <img src="/monday-icon.svg" alt="" className="w-6 h-6" aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Monday.com</p>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : connection ? (
            <p className="text-xs text-muted-foreground truncate">
              Board ID: {connection.board_id}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Sync action items from your Monday board
            </p>
          )}
        </div>

        {!loading && (
          connection ? (
            <button
              onClick={() => setShowDisconnectModal(true)}
              disabled={disconnecting}
              className="bg-red-50 text-red-600 px-4 py-1.5 rounded-md text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              {disconnecting ? "..." : "Disconnect"}
            </button>
          ) : (
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Connect
            </Button>
          )
        )}
      </div>

      {/* Setup instructions accordion — only shown when not connected */}
      {!loading && !connection && (
        <div className="mt-2">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            {showInstructions ? "Hide setup instructions" : "Need instructions to set up your Monday board?"}
          </button>
          {showInstructions && (
            <div className="mt-2">
              <SetupInstructionCard />
            </div>
          )}
        </div>
      )}

      {/* Connection form modal */}
      {showForm && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            style={{ transform: "translateZ(0)" }}
            onClick={() => { setShowForm(false); setTestResult(null); setError("") }}
            aria-hidden="true"
          />
          <div
            className="fixed inset-x-4 z-50 mx-auto max-w-sm"
            style={{ top: "50%", transform: "translateY(-50%) translateZ(0)" }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-background rounded-lg shadow-xl p-6">
              <h2 className="text-lg font-bold text-foreground mb-2">Connect Monday.com</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Enter the Board ID of the Monday board you want to sync action items from.
                You can find it in the board URL — it&apos;s the number after <code className="text-xs bg-accent px-1 py-0.5 rounded">/boards/</code>.
              </p>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Board ID</label>
                  <Input
                    value={boardId}
                    onChange={(e) => { setBoardId(e.target.value); setError("") }}
                    placeholder="e.g. 18403632593"
                    className="mt-1"
                    autoFocus
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive mb-3">{error}</p>}
              {testResult && (
                <p className={`text-sm mb-3 ${testResult.ok ? "text-green-600" : "text-destructive"}`}>
                  {testResult.message}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowForm(false); setTestResult(null); setError("") }}
                >
                  Cancel
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing || !boardId.trim()}
                >
                  {testing ? "Testing..." : "Test"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !boardId.trim()}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Disconnect confirmation modal */}
      {showDisconnectModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            style={{ transform: "translateZ(0)" }}
            onClick={() => setShowDisconnectModal(false)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-x-4 z-50 mx-auto max-w-sm"
            style={{ top: "50%", transform: "translateY(-50%) translateZ(0)" }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-background rounded-lg shadow-xl p-6">
              <h2 className="text-lg font-bold text-foreground mb-2">Disconnect Monday.com</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure? Action items will stop syncing from your Monday board.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDisconnectModal(false)}
                >
                  Cancel
                </Button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
