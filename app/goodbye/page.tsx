export default function GoodbyePage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-background">
      {/* Untangled thread illustration */}
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mb-8 opacity-40"
        aria-hidden="true"
      >
        {/* A loose, unwound thread */}
        <path
          d="M30 90 C35 70, 45 75, 50 60 C55 45, 40 40, 50 30 C60 20, 70 35, 65 50 C60 65, 75 60, 80 45 C85 30, 90 40, 85 55"
          stroke="oklch(0.55 0.03 240)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Loose end */}
        <path
          d="M85 55 C82 62, 88 68, 92 65"
          stroke="oklch(0.55 0.03 240)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Small loose loop */}
        <path
          d="M30 90 C25 95, 22 88, 28 85"
          stroke="oklch(0.55 0.03 240)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      <h1 className="text-2xl font-bold text-foreground/60 mb-3 text-center">
        You&apos;re all untangled.
      </h1>

      <p className="text-sm text-muted-foreground/70 text-center max-w-sm mb-10 leading-relaxed">
        We&apos;re sad to see you go, but we wish you clarity.
      </p>

      <a
        href="/"
        className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-200"
      >
        Start fresh
      </a>
    </div>
  )
}
