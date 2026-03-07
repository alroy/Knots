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
          <img src="/slack-svgrepo-com.svg" alt="" className="w-6 h-6" />
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
