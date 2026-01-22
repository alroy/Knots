"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

function KnotIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
    >
      <path d="m20.969 32.527c0-16.008 13.023-29.031 29.031-29.031s29.031 13.023 29.031 29.031c0 3.0938-0.89844 7.9766-2.8711 11.395l-20.238 35.055-3.6992-6.4102 18.387-31.848c1.3086-2.2656 2.0117-5.9102 2.0117-8.1875 0-12.473-10.148-22.621-22.621-22.621-12.473-0.003906-22.621 10.145-22.621 22.617 0 0.82422 0.089844 1.7734 0.25 2.7383h-1.0117c-1.7461 0-3.582 0.26172-5.3633 0.68359-0.1875-1.2031-0.28516-2.3828-0.28516-3.4219zm23.375 60.086c-4.4102 2.5469-9.4258 3.8945-14.492 3.8945-10.352 0-19.996-5.5664-25.168-14.52-3.8789-6.7188-4.9062-14.543-2.9023-22.035 2.0078-7.4922 6.8125-13.754 13.527-17.629 2.6797-1.5469 7.3555-3.2109 11.305-3.2109h40.48l-3.7031 6.4102-31.223 0.003906h-5.5547c-2.6133 0-6.125 1.2109-8.0977 2.3516-5.2344 3.0195-8.9766 7.8984-10.539 13.734-1.5625 5.8359-0.76172 11.934 2.2617 17.168 4.0273 6.9766 11.543 11.312 19.613 11.312 3.9453 0 7.8477-1.0508 11.285-3.0352 0.71484-0.41016 1.4883-0.96094 2.25-1.5859l0.50391 0.87891c0.87109 1.5117 2.0156 2.9727 3.2734 4.3047-0.94922 0.75781-1.9141 1.4336-2.8203 1.957zm50.973-10.629c-5.1719 8.957-14.812 14.523-25.168 14.523-5.0703 0-10.082-1.3477-14.492-3.8945-2.6797-1.5469-6.4609-4.7656-8.4336-8.1836l-20.238-35.055h7.4023l15.613 27.039 2.7773 4.8086c0.46875 0.80859 1.1367 1.668 1.9844 2.5508 1.2461 1.2969 2.7812 2.5234 4.1016 3.2891 3.4375 1.9844 7.3398 3.0352 11.285 3.0352 8.0664 0 15.586-4.3359 19.613-11.316 3.0234-5.2305 3.8242-11.328 2.2617-17.164-1.5625-5.8359-5.3086-10.715-10.539-13.738-0.71484-0.41016-1.5781-0.80859-2.4961-1.1562l0.50391-0.875c0.87109-1.5117 1.5664-3.2344 2.0938-4.9883 1.1367 0.44531 2.207 0.94922 3.1055 1.4688 6.7148 3.8789 11.52 10.137 13.527 17.629 2.0039 7.4883 0.97656 15.312-2.9023 22.027z" />
    </svg>
  )
}

interface KnotFormProps {
  onSubmit: (data: { title: string; description: string }) => void
}

export function KnotForm({ onSubmit }: KnotFormProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [error, setError] = React.useState("")
  const [touched, setTouched] = React.useState(false)
  const titleInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (isOpen) {
      titleInputRef.current?.focus()
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setError("Please add a title")
      return
    }

    onSubmit({ title: trimmedTitle, description: description.trim() })
    setTitle("")
    setDescription("")
    setError("")
    setTouched(false)
    setIsOpen(false)
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    if (error) {
      setError("")
    }
  }

  if (!isOpen) {
    return (
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        size="icon"
        className="h-10 w-10 rounded-full"
        aria-label="Tie a new knot"
      >
        <KnotIcon className="h-5 w-5" />
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md">
      <div className="space-y-2 mb-5">
        <Label htmlFor="title" className="text-sm text-muted-foreground">
          Title
        </Label>
        <Input
          ref={titleInputRef}
          id="title"
          type="text"
          placeholder="What needs to be untangled?"
          value={title}
          onChange={handleTitleChange}
          aria-invalid={touched && !!error}
          aria-describedby={touched && error ? "title-error" : undefined}
          className="h-10 bg-card border-border/60 shadow-none"
        />
        {touched && error && (
          <p id="title-error" className="text-sm text-muted-foreground">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2 mb-6">
        <Label htmlFor="description" className="text-sm text-muted-foreground">
          Description <span className="text-muted-foreground/60">(optional)</span>
        </Label>
        <Textarea
          id="description"
          placeholder="Add details..."
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-card border-border/60 shadow-none resize-none"
        />
      </div>

      <div className="flex items-center gap-4">
        <Button
          type="submit"
          className="w-full sm:w-auto px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75"
        >
          Tie Knot
        </Button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
