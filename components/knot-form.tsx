"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

interface KnotFormProps {
  onSubmit: (data: { title: string; description: string }) => void
}

export function KnotForm({ onSubmit }: KnotFormProps) {
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [error, setError] = React.useState("")
  const [touched, setTouched] = React.useState(false)
  const titleInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

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
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    if (error) {
      setError("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md">
      <h1 className="text-xl font-medium tracking-tight text-foreground mb-6">
        Tie a New Knot
      </h1>

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

      <Button
        type="submit"
        className="w-full sm:w-auto px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75"
      >
        Tie Knot
      </Button>
    </form>
  )
}
