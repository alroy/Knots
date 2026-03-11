import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Group items by their creation date, returning an array of { label, items } groups.
 * Items are ordered newest-first within each group, groups are ordered newest-first.
 */
export function groupByDate<T extends { createdAt?: string }>(items: T[]): { label: string; items: T[] }[] {
  const groups: Map<string, T[]> = new Map()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)

  for (const item of items) {
    let key: string
    if (!item.createdAt) {
      key = 'Unknown'
    } else {
      const ts = item.createdAt.endsWith('Z') || item.createdAt.includes('+') ? item.createdAt : item.createdAt + 'Z'
      const d = new Date(ts)
      const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      if (itemDay.getTime() === today.getTime()) {
        key = 'Today'
      } else if (itemDay.getTime() === yesterday.getTime()) {
        key = 'Yesterday'
      } else {
        key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a timestamp as relative time (e.g., "just now", "10 min ago", "yesterday")
 * After 7 days, switches to absolute date (e.g., "Jan 24")
 * Returns null if timestamp is invalid
 */
export function formatRelativeTime(timestamp: string | Date | null | undefined): string | null {
  if (!timestamp) return null

  let date: Date
  if (typeof timestamp === 'string') {
    // Ensure UTC timestamps are parsed correctly
    // Supabase returns timestamps without 'Z' suffix, so we add it if missing
    const normalizedTimestamp = timestamp.endsWith('Z') || timestamp.includes('+')
      ? timestamp
      : timestamp + 'Z'
    date = new Date(normalizedTimestamp)
  } else {
    date = timestamp
  }

  // Check for invalid date
  if (isNaN(date.getTime())) return null

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  // Less than 1 minute
  if (diffSeconds < 60) {
    return 'just now'
  }

  // Less than 1 hour
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }

  // Less than 24 hours
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  }

  // Yesterday (1 day ago)
  if (diffDays === 1) {
    return 'yesterday'
  }

  // 2-6 days ago
  if (diffDays < 7) {
    return `${diffDays} days ago`
  }

  // 7+ days - show absolute date (e.g., "Jan 24")
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
