"use client"

import { useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import type { RealtimeChannel } from "@supabase/supabase-js"

interface ChannelConfig {
  table: string
  filter: string
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
}

/**
 * Hook that manages a Supabase Realtime channel with visibility-aware
 * pause/resume. Disconnects the WebSocket when the tab is hidden and
 * reconnects + refetches when it becomes visible again. This prevents
 * iOS from reporting inflated Screen Time for the PWA.
 */
export function useRealtimeChannel(
  channelName: string,
  config: ChannelConfig,
  onEvent: (payload: any) => void,
) {
  const { user } = useAuth()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef(createClient())
  // Keep onEvent stable via ref so visibility handler always calls the latest version
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const subscribe = useCallback(() => {
    if (!user) return
    // Clean up any existing channel first
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current)
      channelRef.current = null
    }
    const channel = supabaseRef.current
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        {
          event: config.event ?? '*',
          schema: 'public',
          table: config.table,
          filter: config.filter,
        },
        (payload: any) => onEventRef.current(payload),
      )
      .subscribe()
    channelRef.current = channel
  }, [user, channelName, config.table, config.filter, config.event])

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!user) return

    // Initial subscription
    subscribe()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        unsubscribe()
      } else if (document.visibilityState === 'visible') {
        subscribe()
        // Catch-up: refetch data that may have changed while hidden
        onEventRef.current(null)
      }
    }

    // Safari PWA: handle pageshow for bfcache restoration
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        subscribe()
        onEventRef.current(null)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      unsubscribe()
    }
  }, [user, subscribe, unsubscribe])
}
