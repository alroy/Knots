"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"

interface MondayConnection {
  id: string
  account_id: string
  created_at: string
  revoked_at: string | null
}

/**
 * Monday.com integration settings component
 * Shows connection status and connect/disconnect buttons
 */
export function MondaySettings() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<MondayConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [featureEnabled, setFeatureEnabled] = useState(true)

  useEffect(() => {
    if (!user) return

    const fetchConnection = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("monday_connections")
          .select("id, account_id, created_at, revoked_at")
          .eq("user_id", user.id)
          .is("revoked_at", null)
          .maybeSingle()

        if (error) {
          if (error.code === "42P01" || error.message.includes("does not exist")) {
            setFeatureEnabled(false)
          } else {
            console.error("Error fetching Monday connection:", error)
          }
        } else {
          setConnection(data)
        }
      } catch {
        setFeatureEnabled(false)
      } finally {
        setLoading(false)
      }
    }

    fetchConnection()
  }, [user])

  const handleConnect = () => {
    window.location.href = "/api/monday/oauth/start"
  }

  const handleDisconnect = async () => {
    if (!connection || !user) return

    setDisconnecting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("monday_connections")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", connection.id)
        .eq("user_id", user.id)

      if (error) {
        console.error("Error disconnecting Monday:", error)
      } else {
        setConnection(null)
      }
    } finally {
      setDisconnecting(false)
    }
  }

  if (!featureEnabled) {
    return null
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-accent">
      {/* Monday.com Icon */}
      <div className="w-8 h-8 flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="w-6 h-6"
          fill="currentColor"
        >
          <path d="M4.7 17.8c-1.6 0-2.8-1.4-2.7-3 .1-1.4 1.2-2.5 2.6-2.6 1.6-.1 3 1.1 3 2.7 0 1.6-1.3 2.9-2.9 2.9zm6.3-8.4c-1.6 0-2.9-1.3-2.9-2.9S9.4 3.6 11 3.6s2.9 1.3 2.9 2.9c0 1.6-1.3 2.9-2.9 2.9zm0 8.4c-1.6 0-2.9-1.3-2.9-2.9l2.9-9.3 2.9 9.3c0 1.6-1.3 2.9-2.9 2.9zm8.3 0c-1.6 0-2.9-1.3-2.9-2.9l2.9-9.3 2.9 9.3c0 1.6-1.3 2.9-2.9 2.9z" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Monday.com</p>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : connection ? (
          <p className="text-xs text-muted-foreground truncate">
            Connected
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Auto-create tasks from assigned items
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
