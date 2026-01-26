"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import KnotCard, { type KnotCardProps } from "./knot-card";

interface Knot {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed";
  position: number;
}

interface SortableKnotListProps {
  knots: Knot[];
  onReorder: (knots: Knot[]) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

interface SortableKnotItemProps {
  knot: Knot;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function SortableKnotItem({ knot, onToggle, onDelete }: SortableKnotItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: knot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 120ms ease-out",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <KnotCard
        id={knot.id}
        title={knot.title}
        description={knot.description}
        status={knot.status}
        onToggle={onToggle}
        onDelete={onDelete}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

export function SortableKnotList({
  knots,
  onReorder,
  onToggle,
  onDelete,
}: SortableKnotListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeKnot = knots.find((k) => k.id === activeId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = knots.findIndex((k) => k.id === active.id);
      const newIndex = knots.findIndex((k) => k.id === over.id);
      onReorder(arrayMove(knots, oldIndex, newIndex));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={knots} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3">
          {knots.map((knot) => (
            <SortableKnotItem
              key={knot.id}
              knot={knot}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeKnot ? (
          <KnotCard
            id={activeKnot.id}
            title={activeKnot.title}
            description={activeKnot.description}
            status={activeKnot.status}
            onToggle={() => {}}
            onDelete={() => {}}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
