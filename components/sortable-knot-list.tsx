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
import { useState, useCallback, useRef, useEffect } from "react";
import KnotCard from "./knot-card";
import { useSafariPWAFix } from "@/hooks/use-safari-pwa-fix";
import { TaskMetadata } from "@/lib/types";

interface Knot {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed";
  position: number;
  metadata?: TaskMetadata;
  createdAt?: string;
  // Source provenance fields (from database columns)
  sourceType?: string;
  sourceUrl?: string;
}

interface SortableKnotListProps {
  knots: Knot[];
  onReorder: (knots: Knot[]) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
  /** ID of the item currently playing snooze exit animation */
  snoozingId?: string | null;
}

interface SortableKnotItemProps {
  knot: Knot;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
  onSnooze?: (id: string, until: Date) => void;
  /** True when any item in the list is being dragged */
  isListDragging: boolean;
  /** Whether this item is playing its snooze exit animation */
  isSnoozing: boolean;
}

function SortableKnotItem({ knot, onToggle, onDelete, onEdit, onSnooze, isListDragging, isSnoozing }: SortableKnotItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: knot.id });

  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);

  // Use transform with hardware acceleration hints for Safari PWA stability
  // The translateZ(0) creates a new compositing layer, preventing
  // stale transform issues when iOS Safari suspends/resumes the PWA
  const style: React.CSSProperties = {
    transform: transform
      ? `${CSS.Transform.toString(transform)} translateZ(0)`
      : "translateZ(0)",
    transition: transition || "transform 120ms ease-out",
    // Hint to browser that this element will be animated
    willChange: isDragging ? "transform" : "auto",
    // Ensure element is in its own compositing layer on iOS
    WebkitBackfaceVisibility: "hidden" as const,
    backfaceVisibility: "hidden" as const,
    // Lift above siblings when snooze menu is open (transform creates stacking context)
    zIndex: snoozeMenuOpen ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} data-sortable-item>
      <KnotCard
        id={knot.id}
        title={knot.title}
        description={knot.description}
        status={knot.status}
        metadata={knot.metadata}
        createdAt={knot.createdAt}
        sourceType={knot.sourceType}
        sourceUrl={knot.sourceUrl}
        onToggle={onToggle}
        onDelete={onDelete}
        onEdit={onEdit}
        onSnooze={onSnooze}
        isDragging={isDragging}
        isListDragging={isListDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        onSnoozeMenuOpenChange={setSnoozeMenuOpen}
        isSnoozing={isSnoozing}
      />
    </div>
  );
}

export function SortableKnotList({
  knots,
  onReorder,
  onToggle,
  onDelete,
  onEdit,
  onSnooze,
  snoozingId,
}: SortableKnotListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Key to force re-render when Safari PWA resumes from background
  const [refreshKey, setRefreshKey] = useState(0);
  const activeKnot = knots.find((k) => k.id === activeId);

  // Track whether dragging is active for suppressing edit clicks
  // Uses both active state and a cooldown timer to prevent ghost clicks on iOS
  const [isDragging, setIsDragging] = useState(false);
  const dragCooldownRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (dragCooldownRef.current) {
        clearTimeout(dragCooldownRef.current);
      }
    };
  }, []);

  // Handle Safari PWA visibility issues - reset transforms and force refresh
  // when app resumes from background
  const handleResume = useCallback(() => {
    // Cancel any active drag operation that might have stale state
    setActiveId(null);
    setIsDragging(false);
    if (dragCooldownRef.current) {
      clearTimeout(dragCooldownRef.current);
      dragCooldownRef.current = null;
    }
    // Increment refresh key to force React to re-render the sortable items
    // This ensures all transforms are recalculated from scratch
    setRefreshKey((k) => k + 1);
  }, []);

  useSafariPWAFix({
    onResume: handleResume,
    forceLayoutRecalc: true,
  });

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
    setIsDragging(true);
    // Clear any pending cooldown
    if (dragCooldownRef.current) {
      clearTimeout(dragCooldownRef.current);
      dragCooldownRef.current = null;
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    // Keep isDragging true for 200ms after drag ends to prevent ghost clicks on iOS
    // This handles the "tap after drag" issue where iOS may fire a click event
    dragCooldownRef.current = setTimeout(() => {
      setIsDragging(false);
      dragCooldownRef.current = null;
    }, 200);

    if (over && active.id !== over.id) {
      const oldIndex = knots.findIndex((k) => k.id === active.id);
      const newIndex = knots.findIndex((k) => k.id === over.id);
      onReorder(arrayMove(knots, oldIndex, newIndex));
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    // Same cooldown for cancelled drags
    dragCooldownRef.current = setTimeout(() => {
      setIsDragging(false);
      dragCooldownRef.current = null;
    }, 200);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={knots} strategy={verticalListSortingStrategy}>
        {/* Key changes on Safari PWA resume to force fresh transform calculations */}
        <div className="flex flex-col gap-3" key={refreshKey}>
          {knots.map((knot) => (
            <SortableKnotItem
              key={knot.id}
              knot={knot}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
              onSnooze={onSnooze}
              isListDragging={isDragging}
              isSnoozing={knot.id === snoozingId}
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
            metadata={activeKnot.metadata}
            createdAt={activeKnot.createdAt}
            sourceType={activeKnot.sourceType}
            sourceUrl={activeKnot.sourceUrl}
            onToggle={() => {}}
            onDelete={() => {}}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
