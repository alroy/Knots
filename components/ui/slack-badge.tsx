"use client"

interface SlackProvenanceRowProps {
  authorName?: string
  permalink?: string
  className?: string
}

/**
 * Slack icon component (same SVG used across the app)
 */
function SlackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.52 2.521h-2.522V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.52v-2.522h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.52 2.521h-6.313z" />
    </svg>
  )
}

/**
 * Shared Slack provenance row for task cards and edit modal.
 *
 * Renders: [Slack icon] {name} via Slack · View in Slack
 */
export function SlackProvenanceRow({ authorName, permalink, className }: SlackProvenanceRowProps) {
  const displayName = authorName || 'Unknown'

  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground/70 ${className || ''}`}>
      <SlackIcon className="h-3 w-3 shrink-0" />
      <span>{displayName} via Slack</span>
      {permalink && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <a
            href={permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/70 hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            View in Slack
          </a>
        </>
      )}
    </div>
  )
}

/** @deprecated Use SlackProvenanceRow instead */
export const SlackBadge = SlackProvenanceRow
