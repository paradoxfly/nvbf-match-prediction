'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@predict/ui/button';
import { cn } from '@predict/ui/utils';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { useId, type CSSProperties, type ReactNode } from 'react';

/** Moves one item of a list (returns a new array). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/**
 * Drag-to-reorder for a vertical list (mouse, touch and keyboard: focus a handle, Space, arrows,
 * Space). Pair every row with up/down buttons so reordering never depends on dragging.
 */
export function SortableList({
  ids,
  onMove,
  disabled = false,
  children,
}: {
  ids: readonly string[];
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const contextId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) onMove(from, to);
  }

  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={[...ids]} strategy={verticalListSortingStrategy} disabled={disabled}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** Wire one row: spread `rowProps` on the row element and `handleProps` on its drag handle. */
export function useSortableRow(id: string) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 2 : undefined,
  };
  return {
    rowProps: { ref: setNodeRef, style },
    handleProps: { ref: setActivatorNodeRef, ...attributes, ...listeners },
    isDragging,
  };
}

export function DragHandle({
  handleProps,
  label,
  disabled,
}: {
  handleProps: ReturnType<typeof useSortableRow>['handleProps'];
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
      {...handleProps}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

/** Up/down buttons, the accessible companion to dragging. */
export function MoveButtons({
  index,
  count,
  onMove,
  label,
  disabled,
  className,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex shrink-0', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${label} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        <ChevronUp aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${label} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        <ChevronDown aria-hidden />
      </Button>
    </span>
  );
}
