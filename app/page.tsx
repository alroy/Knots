"use client"

import { useState } from "react"
import KnotCard from "@/components/knot-card" // Import KnotCard component
import { SortableKnotList } from "@/components/sortable-knot-list"
import { KnotForm } from "@/components/knot-form"

interface Knot {
  id: string
  title: string
  description: string
  status: "active" | "completed"
}

const initialKnots: Knot[] = [
  {
    id: "1",
    title: "Learn the Bowline Knot",
    description: "Master the king of knots - essential for sailing and rescue operations",
    status: "completed",
  },
  {
    id: "2",
    title: "Practice the Figure Eight",
    description: "A stopper knot commonly used in climbing and sailing",
    status: "active",
  },
  {
    id: "3",
    title: "Study the Clove Hitch",
    description: "Quick and easy knot for securing a rope to a post or pole",
    status: "active",
  },
  {
    id: "4",
    title: "Master the Sheet Bend",
    description: "Perfect for joining two ropes of different diameters together",
    status: "active",
  },
]

export default function Page() {
  const [knots, setKnots] = useState<Knot[]>(initialKnots)

  const handleToggle = (id: string) => {
    setKnots((prev) =>
      prev.map((knot) =>
        knot.id === id
          ? { ...knot, status: knot.status === "active" ? "completed" : "active" }
          : knot
      )
    )
  }

  const handleDelete = (id: string) => {
    setKnots((prev) => prev.filter((knot) => knot.id !== id))
  }

  const handleReorder = (reorderedKnots: Knot[]) => {
    setKnots(reorderedKnots)
  }

  const handleAddKnot = (data: { title: string; description: string }) => {
    const newKnot: Knot = {
      id: Date.now().toString(),
      title: data.title,
      description: data.description,
      status: "active",
    }
    setKnots((prev) => [newKnot, ...prev])
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-2 text-2xl font-bold text-foreground">My Knots</h1>
        <p className="mb-8 text-muted-foreground">
          What you meant to come back to.
        </p>

        <div className="mb-12">
          <KnotForm onSubmit={handleAddKnot} />
        </div>

        {knots.length > 0 ? (
          <SortableKnotList
            knots={knots}
            onReorder={handleReorder}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            No knots to track. Add some to get started!
          </p>
        )}
      </div>
    </main>
  )
}
