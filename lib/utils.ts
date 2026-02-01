import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a timestamp as relative time (e.g., "just now", "10 min ago", "yesterday")
 * After 7 days, switches to absolute date (e.g., "Jan 24")
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
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
