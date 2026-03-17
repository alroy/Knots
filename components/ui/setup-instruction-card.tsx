"use client"

import { Button } from "@/components/ui/button"

const SETUP_PROMPT_URL =
  "https://drive.google.com/file/d/1-qUfqqA7VjwKRJGj_a3BUN5eN8VlK3_f/view"

export function SetupInstructionCard() {
  return (
    <div className="w-full rounded-lg border border-border bg-[#f8f9fa] p-6 dark:bg-accent">
      <h2 className="mb-2 text-lg font-semibold text-foreground">
        ✨ Set Up Your AI Autopilot
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Knots pulls your action items directly from a Monday.com Tasks board. To
        put this on autopilot, we use Claude Cowork to scan your Slack, Gmail,
        and Granola transcripts and write tasks to that board twice a day.
      </p>
      <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          Enable the <strong>Slack</strong>, <strong>Granola</strong>,{" "}
          <strong>Gmail</strong>, and <strong>Monday.com</strong> connectors in
          your Claude Cowork account.
        </li>
        <li>
          Copy our setup prompt into a new Cowork session. Claude will
          automatically create your Monday board and schedule the daily scans.
        </li>
      </ol>
      <a href={SETUP_PROMPT_URL} target="_blank" rel="noopener noreferrer">
        <Button variant="ghost" className="w-full border border-border">
          Get the Setup Prompt
        </Button>
      </a>
    </div>
  )
}
