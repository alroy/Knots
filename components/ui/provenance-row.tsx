"use client"

type SourceType = 'slack' | 'granola' | 'gmail' | 'notetaker'

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
 * Granola icon component (official Granola logo)
 */
function GranolaIcon({ className }: { className?: string }) {
  return <img src="/granola-icon.svg" alt="" className={className} aria-hidden="true" />
}

/**
 * Gmail icon component
 */
function GmailIcon({ className }: { className?: string }) {
  return <img src="/gmail.svg" alt="" className={className} aria-hidden="true" />
}

/**
 * Monday.com icon component (used for Notetaker source)
 */
function MondayIcon({ className }: { className?: string }) {
  return <img src="/monday-icon.svg" alt="" className={className} aria-hidden="true" />
}

const SOURCE_CONFIG: Record<SourceType, { fallbackName: string; linkText: string; Icon: typeof SlackIcon }> = {
  slack: { fallbackName: 'Slack', linkText: 'View in Slack', Icon: SlackIcon },
  granola: { fallbackName: 'Granola', linkText: 'View in Granola', Icon: GranolaIcon },
  gmail: { fallbackName: 'Gmail', linkText: 'View in Gmail', Icon: GmailIcon },
  notetaker: { fallbackName: 'Notetaker', linkText: 'View in Monday', Icon: MondayIcon },
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
