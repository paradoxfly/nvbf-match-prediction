'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@predict/ui/utils';
import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from 'lucide-react';
import { useState } from 'react';
import { TeamLogo } from '@/components/team-logo';
import { ordinal } from '@/lib/format';
import type { TeamData } from '@/lib/types';

function MoveButton({
  direction,
  team,
  disabled,
  onClick,
}: {
  direction: 'up' | 'down';
  team: TeamData;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === 'up' ? ChevronUpIcon : ChevronDownIcon;
  return (
    <button
      type="button"
      // aria-disabled (not disabled) keeps focus on the button when a team reaches the end.
      aria-disabled={disabled}
      aria-label={`Move ${team.name} ${direction}`}
      onClick={() => {
        if (!disabled) onClick();
      }}
      className={cn(
        'flex size-9 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60',
        disabled && 'opacity-30 hover:bg-transparent',
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}

function SortableRow({
  team,
  index,
  count,
  disabled,
  onMove,
}: {
  team: TeamData;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.id, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative flex items-center gap-2 rounded-lg border border-border bg-card py-1.5 pr-1 pl-1.5',
        isDragging && 'z-10 border-sg-night shadow-card',
      )}
    >
      {disabled ? null : (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag ${team.name}, now ${ordinal(index + 1)}`}
          className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 active:cursor-grabbing"
        >
          <GripVerticalIcon aria-hidden className="size-4" />
        </button>
      )}
      <span className="w-7 shrink-0 text-center font-mono text-sm font-bold">{index + 1}</span>
      <TeamLogo team={team} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{team.name}</span>
      {disabled ? null : (
        <span className="flex shrink-0">
          <MoveButton
            direction="up"
            team={team}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <MoveButton
            direction="down"
            team={team}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          />
        </span>
      )}
    </li>
  );
}

/**
 * One predicted table: drag by the handle (mouse, touch or keyboard: space, arrows, space), or
 * use the up/down buttons. Read-only when `onChange` is missing.
 */
export function SortableTable({
  id,
  label,
  teams,
  onChange,
}: {
  id: string;
  label: string;
  teams: readonly TeamData[];
  onChange?: (teams: TeamData[]) => void;
}) {
  const [message, setMessage] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const readOnly = !onChange;
  const name = (teamId: UniqueIdentifier) => teams.find((team) => team.id === teamId)?.name ?? '';
  const place = (teamId: UniqueIdentifier) => teams.findIndex((team) => team.id === teamId) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, now ${ordinal(place(active.id))}.`,
    onDragOver: ({ active, over }) =>
      over ? `${name(active.id)} is over ${ordinal(place(over.id))} place.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${name(active.id)} dropped in ${ordinal(place(over.id))} place.`
        : `${name(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!onChange || !over || active.id === over.id) return;
    const from = teams.findIndex((team) => team.id === active.id);
    const to = teams.findIndex((team) => team.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove([...teams], from, to));
  }

  function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    const team = teams[index];
    if (!onChange || !team || to < 0 || to >= teams.length) return;
    onChange(arrayMove([...teams], index, to));
    setMessage(`${team.name} moved to ${ordinal(to + 1)} place.`);
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To move a team, press space or enter, use the up and down arrow keys, then press space or enter again. Press escape to cancel.',
        },
      }}
    >
      <SortableContext items={teams.map((team) => team.id)} strategy={verticalListSortingStrategy}>
        <ol aria-label={label} className="flex flex-col gap-1.5">
          {teams.map((team, index) => (
            <SortableRow
              key={team.id}
              team={team}
              index={index}
              count={teams.length}
              disabled={readOnly}
              onMove={(delta) => move(index, delta)}
            />
          ))}
        </ol>
      </SortableContext>
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
    </DndContext>
  );
}
