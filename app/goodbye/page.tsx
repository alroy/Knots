export default function GoodbyePage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-background">
      {/* Untangled thread illustration */}
      <img
        src="/final.svg"
        alt=""
        width={160}
        height={160}
        className="mb-8 opacity-60"
        aria-hidden="true"
      />

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
