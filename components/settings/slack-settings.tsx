"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"

interface SlackConnection {
  id: string
  team_name: string | null
  created_at: string
  revoked_at: string | null
}

/**
 * Slack integration settings component
 * Shows connection status and connect/disconnect buttons
 */
export function SlackSettings() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<SlackConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  // Check if Slack feature is enabled (based on presence of connection data)
  const [featureEnabled, setFeatureEnabled] = useState(true)

  useEffect(() => {
    if (!user) return

    const fetchConnection = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("slack_connections")
          .select("id, team_name, created_at, revoked_at")
          .eq("user_id", user.id)
          .is("revoked_at", null)
          .maybeSingle()

        if (error) {
          // If table doesn't exist, feature is not enabled
          if (error.code === "42P01" || error.message.includes("does not exist")) {
            setFeatureEnabled(false)
          } else {
            console.error("Error fetching Slack connection:", error)
          }
        } else {
          setConnection(data)
        }
      } catch {
        // Feature likely not configured
        setFeatureEnabled(false)
      } finally {
        setLoading(false)
      }
    }

    fetchConnection()
  }, [user])

  const handleConnect = () => {
    // Redirect to OAuth start endpoint
    window.location.href = "/api/slack/oauth/start"
  }

  const handleDisconnect = async () => {
    if (!connection || !user) return

    setDisconnecting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("slack_connections")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", connection.id)
        .eq("user_id", user.id)

      if (error) {
        console.error("Error disconnecting Slack:", error)
      } else {
        setConnection(null)
      }
    } finally {
      setDisconnecting(false)
    }
  }

  // Don't render if feature is not enabled
  if (!featureEnabled) {
    return null
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-accent">
        {/* Slack Icon */}
        <div className="w-8 h-8 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="w-6 h-6"
            fill="currentColor"
          >
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Slack</p>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : connection ? (
            <p className="text-xs text-muted-foreground truncate">
              Connected to {connection.team_name || "workspace"}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Auto-create tasks from DMs and mentions
            </p>
          )}
        </div>

        {!loading && (
          connection ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-muted-foreground hover:text-foreground"
            >
              {disconnecting ? "..." : "Disconnect"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Connect
            </Button>
          )
        )}
      </div>
  )
}
