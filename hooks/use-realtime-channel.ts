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
 * pause/resume and resilient reconnection. Disconnects the WebSocket
 * after a grace period when the tab is hidden and reconnects when it
 * becomes visible again, with additional recovery via online/focus
 * events and a periodic health check.
 */
export function useRealtimeChannel(
  channelName: string,
  config: ChannelConfig,
  onEvent: (payload: any) => void,
) {
  const { user } = useAuth()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef(createClient())
  // Keep onEvent stable via ref so handlers always call the latest version
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  // Monotonic counter for unique channel names — avoids conflicts when
  // old removeChannel() hasn't completed before new channel is created
  const channelCounterRef = useRef(0)

  // Grace period timeout before disconnecting on visibility hidden
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Health check interval
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Debounce refetches — visibilitychange and focus often fire together
  const lastRefetchRef = useRef(0)

  const triggerRefetch = useCallback(() => {
    const now = Date.now()
    if (now - lastRefetchRef.current < 500) return
    lastRefetchRef.current = now
    onEventRef.current(null)
  }, [])

  const subscribe = useCallback(() => {
    if (!user) return
    // Fire-and-forget: remove old channel (unique names prevent conflicts)
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current)
      channelRef.current = null
    }
    const uniqueName = `${channelName}-${channelCounterRef.current++}`
    const channel = supabaseRef.current
      .channel(uniqueName)
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

    // --- Visibility: grace-period disconnect, immediate reconnect ---
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Start a 5-second grace period before disconnecting.
        // Brief app switches (checking a notification) won't kill the channel.
        if (!hideTimeoutRef.current) {
          hideTimeoutRef.current = setTimeout(() => {
            hideTimeoutRef.current = null
            unsubscribe()
          }, 5000)
        }
      } else if (document.visibilityState === 'visible') {
        // Cancel pending disconnect if user returned quickly
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current)
          hideTimeoutRef.current = null
        }
        // Reconnect if channel was torn down while hidden
        if (!channelRef.current) {
          subscribe()
        }
        triggerRefetch()
      }
    }

    // --- Focus: catch-all reconnect + refetch ---
    // Some mobile browsers don't reliably fire visibilitychange
    const handleFocus = () => {
      if (!channelRef.current || (channelRef.current as any).state !== 'joined') {
        subscribe()
      }
      triggerRefetch()
    }

    // --- Network: reconnect when connectivity is restored ---
    const handleOnline = () => {
      subscribe()
      triggerRefetch()
    }

    // --- Safari PWA: handle pageshow for bfcache restoration ---
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        subscribe()
        triggerRefetch()
      }
    }

    // --- Health check: every 30s while visible, verify channel is alive ---
    healthCheckRef.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!channelRef.current || (channelRef.current as any).state !== 'joined') {
        subscribe()
        triggerRefetch()
      }
    }, 30_000)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      // Clean up all listeners, intervals, timeouts, and channel
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = null
      }
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current)
        healthCheckRef.current = null
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('pageshow', handlePageShow)
      unsubscribe()
    }
  }, [user, subscribe, unsubscribe, triggerRefetch])
}
