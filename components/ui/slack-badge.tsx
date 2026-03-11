"use client"

type SourceType = 'slack' | 'granola'

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
  return <img src="/slack-svgrepo-com.svg" alt="" className={className} aria-hidden="true" />
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

const SOURCE_CONFIG: Record<SourceType, { fallbackName: string; linkText: string; Icon: typeof SlackIcon }> = {
  slack: { fallbackName: 'Slack', linkText: 'View in Slack', Icon: SlackIcon },
  granola: { fallbackName: 'Granola', linkText: 'View in Granola', Icon: GranolaIcon },
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
