"use client"

type SourceType = 'slack' | 'granola' | 'monday'

interface ProvenanceRowProps {
  sourceType?: SourceType
  authorName?: string
  permalink?: string
  className?: string
}

/**
 * Slack icon component
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
 * Granola icon component (stylized grain shape)
 */
function GranolaIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C9 2 6 5.5 6 11s3 11 6 11 6-5.5 6-11S15 2 12 2zm0 2.5c2 0 3.5 2.5 3.5 6.5S14 18 12 18s-3.5-3.5-3.5-7S10 4.5 12 4.5z" />
    </svg>
  )
}

/**
 * Monday.com icon component
 */
function MondayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4.7 17.8c-1.6 0-2.8-1.4-2.7-3 .1-1.4 1.2-2.5 2.6-2.6 1.6-.1 3 1.1 3 2.7 0 1.6-1.3 2.9-2.9 2.9zm6.3-8.4c-1.6 0-2.9-1.3-2.9-2.9S9.4 3.6 11 3.6s2.9 1.3 2.9 2.9c0 1.6-1.3 2.9-2.9 2.9zm0 8.4c-1.6 0-2.9-1.3-2.9-2.9l2.9-9.3 2.9 9.3c0 1.6-1.3 2.9-2.9 2.9zm8.3 0c-1.6 0-2.9-1.3-2.9-2.9l2.9-9.3 2.9 9.3c0 1.6-1.3 2.9-2.9 2.9z" />
    </svg>
  )
}

const SOURCE_CONFIG: Record<SourceType, { fallbackName: string; linkText: string; Icon: typeof SlackIcon }> = {
  slack: { fallbackName: 'Slack', linkText: 'View in Slack', Icon: SlackIcon },
  granola: { fallbackName: 'Granola', linkText: 'View in Granola', Icon: GranolaIcon },
  monday: { fallbackName: 'Monday.com', linkText: 'View in Monday', Icon: MondayIcon },
}

/**
 * Shared provenance row for task cards and edit modal.
 *
 * Renders: [icon] {name} · View in {source}
 */
export function ProvenanceRow({ sourceType = 'slack', authorName, permalink, className }: ProvenanceRowProps) {
  const config = SOURCE_CONFIG[sourceType]
  const displayName = authorName || config.fallbackName
  const Icon = config.Icon

  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground/70 ${className || ''}`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span>{displayName}</span>
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
            {config.linkText}
          </a>
        </>
      )}
    </div>
  )
}

/** @deprecated Use ProvenanceRow instead */
export const SlackProvenanceRow = ProvenanceRow

/** @deprecated Use ProvenanceRow instead */
export const SlackBadge = ProvenanceRow
